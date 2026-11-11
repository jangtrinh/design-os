/**
 * `ui agents init --force` says what it replaced: an existing file is "replaced", not "written", and when its text
 * outside the area block differed from a fresh render (the comparison `ui agents check` makes) the line says that as a
 * fact, with no cause, and that the text is not kept. A stale block alone is not a difference worth a note.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1, changeScanAndRebuild } from "./ontology-query-helpers.js";
import { claudeFile, init, pinStudioHome, read } from "./agents-runtimes-helpers.js";

pinStudioHome();
const NOTE = "its text outside the area block differed from what this version generates; that text is not kept";
type Row = { runtime: string; role: string; path: string; replaced: boolean; differedOutsideBlock: boolean };
const rows = (p: string, ...flags: string[]): Row[] => (JSON.parse(init(p, ...flags, "--json").out).data.targets as Row[]);
const edit = (p: string, rel: string): void => writeFileSync(join(p, rel), read(p, rel).replace("You are", "You were"));

describe("a fresh project", () => {
  it("every line says written, no row is replaced", () => {
    const p = builtRing1();
    const done = init(p);
    expect(done.out).toMatch(/agent written: .*\(designer\)/);
    expect(done.out).toContain("agents section written:");
    expect(done.out).not.toMatch(/replaced|differed/);
    const p2 = builtRing1();
    for (const r of rows(p2)) expect([r.replaced, r.differedOutsideBlock], r.path).toEqual([false, false]);
  });
});

describe("--force on files that exist", () => {
  it("says replaced for every file and the section, with no note when nothing differed", () => {
    const p = builtRing1();
    init(p);
    const done = init(p, "--force");
    expect(done.out.match(/agent replaced:/g)).toHaveLength(6);
    expect(done.out).toContain("agents section replaced:");
    expect(done.out).not.toMatch(/agent written|differed/);
    for (const r of rows(p, "--force")) expect([r.replaced, r.differedOutsideBlock], r.path).toEqual([true, false]);
  });
  it("a change outside the block: the note names that file and only that file", () => {
    const p = builtRing1();
    init(p);
    edit(p, claudeFile(p, "designer"));
    const done = init(p, "--force");
    const noted = done.out.split("\n").filter((l) => l.includes(NOTE));
    expect(noted).toHaveLength(1);
    expect(noted[0]).toContain(`.claude/agents/designer-`);
    expect(noted[0]).not.toMatch(/edited by hand|hand-edited/);
    edit(p, claudeFile(p, "designer"));
    const flagged = rows(p, "--force").filter((r) => r.differedOutsideBlock);
    expect(flagged.map((r) => r.path.split("/").pop())).toEqual([`designer-${JSON.parse(read(p, "design/ds.manifest.json")).name}.md`]);
  });
  it("the Codex section is treated the same way", () => {
    const p = builtRing1();
    init(p);
    edit(p, "AGENTS.md");
    const done = init(p, "--force");
    const line = done.out.split("\n").find((l) => l.startsWith("agents section replaced:"))!;
    expect(line).toContain(NOTE);
    expect(rows(p, "--force").every((r) => !r.differedOutsideBlock)).toBe(true);
  });
  it("a stale block only: replaced, no note", () => {
    const p = builtRing1();
    init(p);
    changeScanAndRebuild(p, (scan) => { scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "Kit" }; });
    const done = init(p, "--force");
    expect(done.out).toContain("agent replaced:");
    expect(done.out).not.toContain(NOTE);
  });
  it("an AGENTS.md of the person's with no section yet: the section is written, not replaced", () => {
    const p = builtRing1();
    writeFileSync(join(p, "AGENTS.md"), "# Mine\n");
    expect(init(p, "--runtimes", "codex").out).toContain("agents section written:");
    expect(readFileSync(join(p, "AGENTS.md"), "utf8").startsWith("# Mine\n")).toBe(true);
    expect(capture(["agents", "check", "--dir", p]).code).toBe(0);
  });
});
