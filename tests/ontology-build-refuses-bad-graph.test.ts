/**
 * A build never writes a graph its own lint refuses: the lint's error checks (a repeated node id, a link to a missing
 * node) run on what the build is about to write. An error leaves the tree untouched, names the code, the count, the
 * source that holds the cause and the command that settles it. No node is dropped or renamed to make ids unique.
 */
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { build, codeProject, editRegistry, fullProject, json, lint, ontologyOf, ring1Project } from "./ontology-helpers.js";

/** Repeats the first component record under its own name and reseals the pair, as an older registry can hold. */
function repeatOneName(project: string): string {
  let name = "";
  editRegistry(project, (registry) => { const first = registry.components[0]!; name = first["name"]; registry.components.push({ ...first }); });
  return name;
}

describe("the build refuses a graph its own lint would refuse", () => {
  it("a sealed registry holding one name twice: exit 1, nothing written, the registry and the ingest named", () => {
    const p = ring1Project();
    const name = repeatOneName(p);
    const before = hashTree(p);
    const done = build(p);
    expect(done.code).toBe(1);
    const err = json(done.out).error!;
    expect(err.code).toBe("ONTOLOGY_DUPLICATE_ID");
    expect(err.message).toContain(`component:${name}`);
    expect(err.message).toContain("1 node id(s)");
    expect(err.message).toContain("design/component-registry.json");
    expect(err.message).toContain("ui ingest-figma-ds");
    expect(err.message).toContain("duplicate component names");
    expect(hashTree(p)).toBe(before);
  });
  it("the text surface says the same, meaning first and the code after it", () => {
    const p = ring1Project();
    repeatOneName(p);
    const done = capture(["ontology", "build", "--dir", p]);
    expect(done.code).toBe(1);
    expect(done.err).toMatch(/design\/component-registry\.json.+\(ONTOLOGY_DUPLICATE_ID\)/s);
  });
  it("the graph of every fixture project passes the lint's error checks inside the build's own run", () => {
    const full = fullProject();
    build(full);
    const answers = keyOf(full).filter((k) => k.kind === "inferred-links").map((k) => ({ fingerprint: k.fingerprint, choice: "standalone" }));
    expect(submit(full, answers).code).toBe(0);
    for (const project of [ring1Project(), codeProject(), full]) {
      expect(build(project).code).toBe(0);
      const o = ontologyOf(project);
      const ids = o.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      const known = new Set(ids);
      expect(o.links.filter((l) => !known.has(l.from) || !known.has(l.to))).toEqual([]);
      const found = (json(lint(project).out).data!["findings"] as { code: string; severity: string }[]).filter((f) => f.severity === "error");
      expect(found).toEqual([]);
    }
  });
});
