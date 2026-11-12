/**
 * A design-os agents section in AGENTS.md whose markers are not one start line followed by one end line is refused by
 * `ui agents init` and reported as an error by `ui agents check`; nothing is written, and the person's text survives.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END } from "../src/core/agents-targets.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { check, init, pinStudioHome, read } from "./agents-runtimes-helpers.js";

pinStudioHome();
const notes = "## My own notes\nKEEP-ME\n";
const withBroken = (change: (text: string) => string): string => {
  const p = builtRing1();
  expect(init(p, "--runtimes", "codex").code).toBe(0);
  writeFileSync(join(p, "AGENTS.md"), change(read(p, "AGENTS.md")));
  return p;
};
const SHAPES: [string, (t: string) => string, [number, number]][] = [
  ["the end marker deleted and a person's notes appended", (t) => `${t.replace(CODEX_AGENTS_END, "")}\n${notes}`, [1, 0]],
  ["two start markers", (t) => `${t}\n${CODEX_AGENTS_BEGIN}\n${notes}`, [2, 1]],
  ["the end before the start", () => `${CODEX_AGENTS_END}\n${notes}\n${CODEX_AGENTS_BEGIN}\n`, [1, 1]],
  ["an end marker only", () => `${notes}${CODEX_AGENTS_END}\n`, [0, 1]],
];

describe("ui agents init refuses a malformed section and writes nothing", () => {
  for (const [what, change, [begins, ends]] of SHAPES) {
    it(what, () => {
      const p = withBroken(change);
      const before = hashTree(p);
      for (const flags of [[], ["--force"]]) {
        const done = init(p, "--runtimes", "codex", ...flags, "--json");
        expect(done.code, flags.join(" ")).toBe(1);
        const err = JSON.parse(done.out).error as { code: string; message: string };
        expect(err.code).toBe("AGENTS_SECTION_MALFORMED");
        expect(err.message).toContain(`${begins} start marker line(s) and ${ends} end marker line(s)`);
        expect(err.message).toContain("nothing was written");
        expect(err.message).toMatch(/one start line followed by one end line, or remove them/);
        expect(hashTree(p)).toBe(before);
      }
      expect(read(p, "AGENTS.md")).toContain("KEEP-ME");
    });
  }
  it("a default run for all runtimes refuses before it writes any runtime", () => {
    const p = withBroken(SHAPES[0]![1]);
    const before = hashTree(p);
    expect(init(p, "--force").code).toBe(1);
    expect(hashTree(p)).toBe(before);
  });
});

describe("ui agents check reports it as an error and prints no --force cure", () => {
  for (const [what, change] of SHAPES) {
    it(what, () => {
      const p = withBroken(change);
      const before = hashTree(p);
      const got = check(p);
      expect(got.code).toBe(1);
      const hit = got.data.findings.filter((f) => f.checkId === "AGENTS_SECTION_MALFORMED");
      expect(hit).toHaveLength(1);
      expect(hit[0]!.severity).toBe("error");
      expect(hit[0]!.message).not.toContain("--force");
      expect(got.data.findings.map((f) => f.checkId)).not.toContain("no-agents");
      expect(hashTree(p)).toBe(before);
    });
  }
  it("every command the tool prints leaves the person's text in place", () => {
    const p = withBroken(SHAPES[0]![1]);
    const text = capture(["agents", "check", "--dir", p]).out;
    expect(text).not.toMatch(/ui agents init/);
    expect(readFileSync(join(p, "AGENTS.md"), "utf8")).toContain("KEEP-ME");
  });
});
