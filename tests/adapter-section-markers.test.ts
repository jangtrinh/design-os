/**
 * The shared adapter writer refuses a host file whose section markers are not one start line followed by one end line,
 * before any file is written: a missing end marker must never turn a later replace into a deletion of a person's text.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdapterWriteError, writeAdapterArtifacts } from "../src/core/adapter-writer.js";
import { capture } from "./owner-rulings-helpers.js";
import { classifySectionMarkers } from "../src/core/adapter-section-markers.js";

const B = "<!-- BEGIN x -->";
const E = "<!-- END x -->";

describe("classifySectionMarkers", () => {
  it("none, one start followed by one end, and every other shape", () => {
    expect(classifySectionMarkers("plain\n", B, E)).toEqual({ shape: "none", begins: 0, ends: 0 });
    expect(classifySectionMarkers(`a\n${B}\nbody\n${E}\nb\n`, B, E).shape).toBe("one");
    expect(classifySectionMarkers(`${B}\nbody\n`, B, E)).toEqual({ shape: "malformed", begins: 1, ends: 0 });
    expect(classifySectionMarkers(`body\n${E}\n`, B, E)).toEqual({ shape: "malformed", begins: 0, ends: 1 });
    expect(classifySectionMarkers(`${E}\n${B}\n`, B, E).shape).toBe("malformed");
    expect(classifySectionMarkers(`${B}\n${B}\n${E}\n`, B, E)).toEqual({ shape: "malformed", begins: 2, ends: 1 });
    expect(classifySectionMarkers(`${B}\n${E}\n${E}\n`, B, E)).toEqual({ shape: "malformed", begins: 1, ends: 2 });
  });
  it("a well-formed section in a CRLF file is one", () => {
    expect(classifySectionMarkers(`a\r\n${B}\r\nbody\r\n${E}\r\nb\r\n`, B, E).shape).toBe("one");
  });
});

describe("writeAdapterArtifacts with a malformed host file", () => {
  const art = (path: string) => ({ mode: "upsert-section" as const, absPath: path, content: `${B}\nnew\n${E}`, sentinelBegin: B, sentinelEnd: E });
  const dir = (): string => mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "writer-"));
  for (const [what, host] of [
    ["an end marker missing", `# Mine\n${B}\nold\n## My notes\nKEEP-ME\n`],
    ["two start markers", `${B}\na\n${B}\nb\n${E}\nKEEP-ME\n`],
    ["the end before the start", `${E}\nKEEP-ME\n${B}\n`],
    ["an end marker only", `KEEP-ME\n${E}\n`],
  ] as const) {
    for (const force of [false, true]) {
      it(`${what}: refused with a named error before anything is written (force ${force})`, () => {
        const d = dir();
        const target = join(d, "AGENTS.md");
        const other = join(d, "other.md");
        writeFileSync(target, host);
        let caught: unknown;
        try { writeAdapterArtifacts([{ mode: "write", absPath: other, content: "x" }, art(target)], { force }); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(AdapterWriteError);
        expect((caught as AdapterWriteError).code).toBe("SECTION_MALFORMED");
        expect((caught as AdapterWriteError).message).toMatch(/nothing was written/);
        expect(readFileSync(target, "utf8")).toBe(host);
        expect(existsSync(other)).toBe(false);
      });
    }
  }
  it("a well-formed section is replaced in place, and a CRLF file keeps its line endings outside it", () => {
    const d = dir();
    const target = join(d, "AGENTS.md");
    writeFileSync(target, `top\r\n${B}\r\nold\r\n${E}\r\nbottom\r\n`);
    writeAdapterArtifacts([art(target)], { force: true });
    expect(readFileSync(target, "utf8")).toBe(`top\r\n${B}\nnew\n${E}\r\nbottom\r\n`);
  });
});

describe("ui init --runtime codex with a malformed kernel section", () => {
  it("is refused with SECTION_MALFORMED and the file is untouched, instead of a second section being appended", () => {
    const d = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "init-codex-"));
    const host = "# Mine\n<!-- BEGIN ease-design -->\nold\nKEEP-ME\n";
    writeFileSync(join(d, "AGENTS.md"), host);
    const done = capture(["init", "--runtime", "codex", "--cwd", d, "--json"]);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.out).error.code).toBe("SECTION_MALFORMED");
    expect(readFileSync(join(d, "AGENTS.md"), "utf8")).toBe(host);
  });
});
