/**
 * Error handling of the build command: a write failure never prints an absolute path, and the read-only look at the open
 * questions (appended to a graph refusal) catches only the stores' own errors and lets any other error propagate.
 */
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core/ontology/blocking-clusters.js", async (original) => {
  const real = await original<typeof import("../src/core/ontology/blocking-clusters.js")>();
  const { PendingStoreError } = await import("../src/core/owner-rulings/pending-store.js");
  return {
    ...real,
    blockingClusters: (...args: Parameters<typeof real.blockingClusters>): ReturnType<typeof real.blockingClusters> => {
      if (process.env["ONTOLOGY_TEST_CLUSTERS"] === "store") throw new PendingStoreError("test");
      if (process.env["ONTOLOGY_TEST_CLUSTERS"] === "other") throw new TypeError("unexpected failure of the look at the questions");
      return real.blockingClusters(...args);
    },
  };
});

const { build, editRegistry, json, ring1Project } = await import("./ontology-helpers.js");

const duplicate = (): string => { const p = ring1Project(); editRegistry(p, (r) => { r.components.push({ ...r.components[0]! }); }); return p; };

describe("a write failure", () => {
  it("names the path as given and the errno, never the absolute project path", () => {
    const p = ring1Project();
    const done = build(p, "--out", "design/soul.md/x.json");
    expect(done.code).toBe(1);
    const error = json(done.out).error!;
    expect(error.code).toBe("WRITE_ERROR");
    expect(error.message).toContain("cannot write 'design/soul.md/x.json'");
    expect(error.message).toMatch(/: (EEXIST|ENOTDIR) during mkdir/);
    expect(done.out).not.toContain(join(p, "design"));
    expect(done.out).not.toContain(p);
  });
});

describe("the look at the open questions behind a graph refusal", () => {
  it("swallows the stores' own errors: the refusal is still given, without the note", () => {
    process.env["ONTOLOGY_TEST_CLUSTERS"] = "store";
    try {
      const done = build(duplicate());
      expect(done.code).toBe(1);
      expect(json(done.out).error!.code).toBe("ONTOLOGY_DUPLICATE_ID");
      expect(json(done.out).error!.message).not.toContain("also await");
    } finally { delete process.env["ONTOLOGY_TEST_CLUSTERS"]; }
  });
  it("lets any other error propagate to the runner, which reports an internal error (exit 2)", () => {
    const p = duplicate();
    process.env["ONTOLOGY_TEST_CLUSTERS"] = "other";
    try {
      const done = build(p);
      expect(done.code).toBe(2);
      expect(done.err).toContain("internal error: unexpected failure of the look at the questions");
    }
    finally { delete process.env["ONTOLOGY_TEST_CLUSTERS"]; }
  });
});
