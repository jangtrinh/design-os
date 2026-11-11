/**
 * The generated ontology-areas block is compact: the query command once, then one line per area with its key and its
 * node count. The Codex section carries the block once, under its heading, before the first role.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START, blocksIn, renderAreasBlock } from "../src/core/agents-areas-block.js";
import { capture } from "./owner-rulings-helpers.js";
import { build } from "./ontology-helpers.js";
import { builtFull, builtRing1, shellWords } from "./ontology-query-helpers.js";
import { check, init, pinStudioHome, read } from "./agents-runtimes-helpers.js";

pinStudioHome();
const areas = [{ key: "page:Library", nodes: 3 }, { key: "tokens:color", nodes: 1 }];

describe("renderAreasBlock", () => {
  it("one command, then one line per area in key order with the node count", () => {
    for (const runtime of ["claude", "codex", "antigravity"] as const) {
      const block = renderAreasBlock({ state: "areas", areas }, runtime);
      const lines = block.trimEnd().split("\n");
      expect(lines[0]).toBe(BLOCK_START);
      expect(lines.at(-1)).toBe(BLOCK_END);
      expect(lines[1]).toBe("Ontology areas of this project. Before design work, ask the ontology what it knows about the area the task belongs to:");
      expect(lines[2]).toBe('`ui ontology query "<your task>" --area "<area key>"`');
      expect(lines[3]).toBe("Area keys, with the number of nodes in each:");
      expect(lines.slice(4, 6)).toEqual(["- page:Library (3)", "- tokens:color (1)"]);
      expect(block.split("ui ontology query").length - 1, runtime).toBe(1);
    }
  });
  it("the no-area, missing and not-current forms keep their text", () => {
    expect(renderAreasBlock({ state: "missing" }, "claude")).toContain("This project has no ontology yet (design/knowledge/ontology.json is missing): run `ui ontology build`, then `ui agents init --force` lists its areas here.");
    expect(renderAreasBlock({ state: "areas", areas: [] }, "claude")).toContain("The ontology holds no area yet (no component, token or ruling carries one)");
  });
});

describe("the Codex section carries the block once", () => {
  it("one block under the heading and before the first role, and the check compares that one block", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "codex").code).toBe(0);
    const text = read(p, "AGENTS.md");
    expect(blocksIn(text)).toHaveLength(1);
    const heading = text.indexOf("## design-os agents");
    const block = text.indexOf(BLOCK_START);
    const firstRole = text.indexOf("### ");
    expect(heading).toBeLessThan(block);
    expect(block).toBeLessThan(firstRole);
    expect(check(p).code).toBe(0);
    writeFileSync(join(p, "AGENTS.md"), text.replace("- page:Library (3)", "- page:Library (4)"));
    expect(check(p).data.findings.map((f) => f.checkId)).toEqual(["ONTOLOGY_STALE"]);
  });
  it("the roster still compares across runtimes: a role edited in the Codex section is drift", () => {
    const p = builtRing1();
    init(p);
    writeFileSync(join(p, "AGENTS.md"), read(p, "AGENTS.md").replace("You are", "You were"));
    expect(check(p).data.findings.map((f) => f.checkId)).toEqual(["AGENTS_ROSTER_DRIFT"]);
  });
});

describe("a key that needs escaping is printed in its escaped form, so pasting it between the quotes works", () => {
  it("a ruling category with a dollar sign and a double quote", () => {
    const p = builtFull();
    const file = join(p, "design", "knowledge", "rulings.json");
    writeFileSync(file, readFileSync(file, "utf8").replace('"component-reuse"', '"say \\"hi\\" $x"'));
    expect(build(p).code).toBe(0);
    expect(init(p, "--runtimes", "claude").code).toBe(0);
    const name = JSON.parse(read(p, "design/ds.manifest.json")).name as string;
    const block = blocksIn(read(p, `.claude/agents/designer-${name}.md`))[0]!;
    const line = block.split("\n").find((l) => l.startsWith("- rulings:say"))!;
    expect(line).toBe('- rulings:say \\"hi\\" \\$x (1)');
    const key = /^- (.*) \(\d+\)$/.exec(line)![1] as string;
    const command = `ontology query "task" --area "${key}"`;
    const done = capture([...shellWords(command), "--dir", p]);
    expect(done.code, done.err).toBe(0);
    expect(done.out).toContain('in area rulings:say "hi" $x');
  });
});
