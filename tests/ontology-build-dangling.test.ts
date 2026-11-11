/**
 * The build refuses a graph the lint would refuse for a link to a node that does not exist, not only for a repeated id.
 * The graph is made dangling by wrapping the real build, so the command's own check is what is under test.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { danglingLinks, graphErrors } from "../src/core/ontology/graph-errors.js";

vi.mock("../src/core/ontology/build-ontology.js", async (original) => {
  const real = await original<typeof import("../src/core/ontology/build-ontology.js")>();
  return {
    ...real,
    buildOntology: (...args: Parameters<typeof real.buildOntology>): ReturnType<typeof real.buildOntology> => {
      const built = real.buildOntology(...args);
      if (process.env["ONTOLOGY_TEST_DANGLE"] === "from") built.ontology.links.push({ kind: "governs", from: "ruling:ghost", to: "project:root" });
      if (process.env["ONTOLOGY_TEST_DANGLE"] === "to") built.ontology.links.push({ kind: "governs", from: "project:root", to: "ruling:ghost" });
      return built;
    },
  };
});

const { build, json, ring1Project } = await import("./ontology-helpers.js");

describe("a link to a node that does not exist", () => {
  it("is dangling when its from is missing, not only when its to is", () => {
    const nodes = [{ id: "a", kind: "term" as const, name: "a" }];
    expect(danglingLinks(nodes, [{ kind: "governs", from: "ghost", to: "a" }])).toHaveLength(1);
    expect(danglingLinks(nodes, [{ kind: "governs", from: "a", to: "ghost" }])).toHaveLength(1);
    expect(graphErrors(nodes, [{ kind: "governs", from: "ghost", to: "a" }])[0]).toMatchObject({ code: "ONTOLOGY_DANGLING_LINK" });
  });
  it.each(["from", "to"])("the build refuses it (missing %s), names the link and writes nothing", (side) => {
    process.env["ONTOLOGY_TEST_DANGLE"] = side;
    try {
      const p = ring1Project();
      const done = build(p);
      expect(done.code).toBe(1);
      expect(json(done.out).error!.code).toBe("ONTOLOGY_DANGLING_LINK");
      expect(json(done.out).error!.message).toContain("ruling:ghost");
      expect(existsSync(join(p, "design/knowledge/ontology.json"))).toBe(false);
    } finally { delete process.env["ONTOLOGY_TEST_DANGLE"]; }
  });
});
