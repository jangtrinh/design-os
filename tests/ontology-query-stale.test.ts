/**
 * A stale or missing ontology.json is never queried, and a query never writes.
 */
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { keyOf } from "./project-kinds-helpers.js";
import { fullProject, ontologyOf, read } from "./ontology-helpers.js";
import { builtRing1, failure, printedCommands, query, queryData } from "./ontology-query-helpers.js";

describe("a stale or missing ontology.json is never queried, and the query writes nothing", () => {
  it("refuses with ONTOLOGY_STALE after a source changed, names the build, and the printed command heals it", () => {
    const p = builtRing1();
    writeFileSync(join(p, "design", "ds.json"), read(p, "design/ds.json").replaceAll('"name": "Library"', '"name": "Kit"'));
    const before = hashTree(p);
    const done = query(p, "Sign in");
    expect(done.code).toBe(1);
    expect(done.err).toContain("ONTOLOGY_STALE");
    expect(done.out).not.toContain("matches");
    expect(hashTree(p)).toBe(before);
    for (const argv of printedCommands(done.err, p)) expect(capture(argv).code, argv.join(" ")).toBe(0);
    expect(query(p, "Sign in").code).toBe(0);
  });
  it("while an owner question blocks the build, the refusal names the one action that works, and running it raises the question", () => {
    const p = fullProject();
    const done = query(p, "Sign in");
    expect(done.code).toBe(1);
    expect(done.err).toContain("ONTOLOGY_STALE");
    expect(done.err).toMatch(/await an owner ruling/);
    const next = printedCommands(done.err, p);
    expect(next).toEqual([["ontology", "build", "--dir", p]]);
    expect(capture(next[0] as string[]).code).toBe(1);
    expect(keyOf(p).some((k) => k.kind === "inferred-links")).toBe(true);
    expect(capture(["onboard", "questions", "--format", "claude", "--cwd", p]).code).toBe(0);
  });
  it("a missing file is stale too, and a file that is not valid JSON", () => {
    const p = builtRing1();
    rmSync(join(p, "design", "knowledge", "ontology.json"));
    expect(failure(p, "Sign in").error.code).toBe("ONTOLOGY_STALE");
    writeFileSync(join(p, "design", "knowledge", "ontology.json"), "{ nope");
    expect(failure(p, "Sign in").error.code).toBe("ONTOLOGY_STALE");
  });
  it("a successful query, a query with no match and a refusal leave the tree byte for byte as it was", () => {
    const p = builtRing1();
    const before = hashTree(p);
    for (const args of [["Sign in"], ["zzzz"], ["card", "--area", "nope"], ["card", "--budget", "x"], ["Sign in", "--json"]]) { query(p, args[0] as string, ...args.slice(1)); expect(hashTree(p)).toBe(before); }
  });
  it("the query reads only the file: the same pack from the ontology of the tree", () => {
    const p = builtRing1();
    const o = ontologyOf(p);
    expect(o.nodes.length).toBeGreaterThan(0);
    expect(queryData(p, "Sign in").pack!.groups.length).toBeGreaterThan(0);
  });
});
