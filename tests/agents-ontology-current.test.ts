/**
 * The agents list areas only from an ontology file that is current: the one definition of "current" is the query's
 * (a build from the current sources writes the same bytes). A file that is not current is never listed, `ui agents
 * check` says so with the shared next action, and `ui agents init` still writes the roster.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blocksIn } from "../src/core/agents-areas-block.js";
import { capture } from "./owner-rulings-helpers.js";
import { builtFull, builtRing1, printedCommands } from "./ontology-query-helpers.js";
import { check, init, pinStudioHome, read } from "./agents-runtimes-helpers.js";

pinStudioHome();
const rewrite = (p: string, rel: string, change: (text: string) => string): void => writeFileSync(join(p, rel), change(readFileSync(join(p, rel), "utf8")));
const staleMessages = (p: string): string[] => check(p).data.findings.filter((f) => f.checkId === "ONTOLOGY_STALE").map((f) => f.message);
const paths = (p: string): string[] => (JSON.parse(init(p, "--force", "--json").out).data.targets as { path: string }[]).map((t) => t.path);

/** Each change makes the ontology file not current by editing a source, never the file. */
const CHANGES: [string, string, () => string, (p: string) => void, string][] = [
  ["a page renamed in the scan", "page:Library", builtRing1, (p) => rewrite(p, "design/ds.json", (t) => t.replaceAll('"name": "Library"', '"name": "Lib2"')), "page:Lib2"],
  ["a ruling category changed", "rulings:component-reuse", builtFull, (p) => rewrite(p, "design/knowledge/rulings.json", (t) => t.replace('"component-reuse"', '"reuse-of-parts"')), "rulings:reuse-of-parts"],
  ["a token group renamed in the sealed store", "tokens:space", builtRing1, (p) => {
    rewrite(p, "design/design.tokens.json", (t) => t.replace('"space"', '"gap"'));
    expect(capture(["ds", "reseal", "--apply", "--reason", "test", "--dir", p]).code).toBe(0);
  }, "tokens:gap"],
];

for (const [what, oldKey, make, mutate, newKey] of CHANGES) {
  describe(what, () => {
    it("check fails with ONTOLOGY_STALE and the shared next action; init --force lists no area of the old name; the cure heals it", () => {
      const p = make();
      expect(init(p).code).toBe(0);
      expect(check(p).code).toBe(0);
      mutate(p);
      const messages = staleMessages(p);
      expect(check(p).code).toBe(1);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]).toContain("not current");
      expect(printedCommands(messages[0] as string, p)[0]).toEqual(["ontology", "build", "--dir", p]);
      for (const path of paths(p)) {
        const text = readFileSync(path, "utf8");
        expect(text, path).not.toContain(oldKey);
        expect(blocksIn(text)[0], path).toContain("not current");
      }
      const again = init(p, "--force");
      expect(again.code).toBe(0);
      expect(again.out).toMatch(/ontology file is not current/);
      expect(check(p).code).toBe(1);
      expect(capture(["ontology", "build", "--dir", p]).code).toBe(0);
      expect(init(p, "--force").code).toBe(0);
      expect(check(p).code).toBe(0);
      expect(read(p, "AGENTS.md")).toContain(newKey);
    });
  });
}

describe("a file that merely looks like an ontology", () => {
  it("is not listed: a foreign JSON with a nodes list gives the not-current block, and the check fails", () => {
    const p = builtRing1();
    writeFileSync(join(p, "design", "knowledge", "ontology.json"), JSON.stringify({ nodes: [{ id: "x:1", kind: "token", name: "x", area: "page:Foreign" }] }));
    expect(init(p, "--runtimes", "claude").code).toBe(0);
    const files = paths(p);
    for (const path of files) expect(readFileSync(path, "utf8")).not.toContain("page:Foreign");
    expect(check(p).code).toBe(1);
    expect(staleMessages(p).length).toBeGreaterThan(0);
  });
});
