import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildPrinciplesIndex } from "../src/core/design-dir-principles.js";
import { scratch, ui } from "./ksync-helpers.js";

const FIXTURE = join(process.cwd(), "tests", "fixtures", "design-dir", "principles.md");
const md = readFileSync(FIXTURE, "utf8");
let tmp = scratch();
afterEach(() => { tmp.done(); tmp = scratch(); });

describe("buildPrinciplesIndex", () => {
  it("extracts id, title, yields_when and test in document order, skipping id-less headings", () => {
    const { index, problems } = buildPrinciplesIndex(md, "principles.md");
    expect(problems).toEqual([]);
    expect(index.principles.map((p) => p.id)).toEqual(["C1", "C2", "D1", "D10"]);
    expect(index.principles[0]).toEqual({
      id: "C1", title: "First core idea — subtract until only the work remains",
      yields_when: "it would remove a safety step (C2), or when the agent rather than the owner is the one simplifying.",
      test: "a rubric criterion in the critic pass; gate `check-example` (missing).",
    });
  });
  it("is byte-stable across runs", () => {
    expect(JSON.stringify(buildPrinciplesIndex(md, "p.md").index)).toBe(JSON.stringify(buildPrinciplesIndex(md, "p.md").index));
  });
  it("reports a missing Yields-when, a missing Test, and a duplicate id", () => {
    const bad = "### C1 · One\n- **Test:** t\n### C1 · Again\n- **Yields when:** y\n";
    const { problems } = buildPrinciplesIndex(bad, "p.md");
    expect(problems.map((p) => p.message)).toEqual([
      expect.stringContaining('C1 has no "Yields when"'),
      "duplicate principle id C1",
      expect.stringContaining('C1 has no "Test"'),
    ]);
  });
  it("ignores headings inside code fences and reports a file with no principles", () => {
    const { index, problems } = buildPrinciplesIndex("```\n### C9 · fenced\n```\n", "p.md");
    expect(index.principles).toEqual([]);
    expect(problems[0]!.message).toContain("no `### <ID> · <title>`");
  });
});

describe("ui design principles-index", () => {
  const src = (): string => { const p = tmp.path("principles.md"); copyFileSync(FIXTURE, p); return p; };
  it("writes the index, then --check passes on it (exit 0)", () => {
    const out = tmp.path("design/principles.json");
    mkdirSync(join(out, ".."), { recursive: true });
    expect(ui(["design", "principles-index", src(), "--out", out]).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).principles).toHaveLength(4);
    expect(ui(["design", "principles-index", src(), "--out", out, "--check"]).exitCode).toBe(0);
  });
  it("--check exits 1 when the markdown drifts from the committed index (negative control)", () => {
    const out = tmp.path("principles.json");
    const p = src();
    ui(["design", "principles-index", p, "--out", out]);
    writeFileSync(p, md.replace("Floors hold at every width", "Floors hold at every viewport"));
    const r = ui(["design", "principles-index", p, "--out", out, "--check", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).data.status).toBe("drift");
  });
  it("--check exits 1 when the index file is missing, and never creates it", () => {
    const out = tmp.path("nope.json");
    expect(ui(["design", "principles-index", src(), "--out", out, "--check"]).exitCode).toBe(1);
    expect(() => readFileSync(out)).toThrow();
  });
  it("exits 1 with BAD_PRINCIPLES when an entry lacks a Test bullet", () => {
    const p = tmp.path("bad.md");
    writeFileSync(p, "### C1 · One\n- **Yields when:** never\n");
    const r = ui(["design", "principles-index", p, "--out", tmp.path("o.json"), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_PRINCIPLES");
  });
  it("rejects a missing --out and an unknown flag", () => {
    expect(ui(["design", "principles-index", src(), "--json"]).exitCode).toBe(1);
    expect(ui(["design", "principles-index", src(), "--out", tmp.path("o.json"), "--frobnicate"]).exitCode).toBe(1);
  });
});
