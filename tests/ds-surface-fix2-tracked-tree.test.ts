/**
 * Fix round 2, section N: a test never writes into a tracked directory. A surface read writes `pending.json`, so a read
 * is a write for this rule: the helper refuses a project inside the repository, and the fixture holds no run artifact.
 * (The check does not depend on git, so it also holds on an archive copy that has no `.git`.)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE, fixtureCopy, surface } from "./ds-surface-helpers.js";

describe("the tracked fixture stays an input", () => {
  it("surface() refuses a project inside the repository's tree", () => {
    expect(() => surface(FIXTURE)).toThrow(/inside the repository/);
    expect(() => surface(join(FIXTURE, "src"))).toThrow(/inside the repository/);
  });
  it("surface() accepts the scratch copy", () => {
    expect(surface(fixtureCopy()).code).toBe(0);
  });
  it("the fixture holds no .design-os directory (a run artifact is never an input)", () => {
    expect(existsSync(join(FIXTURE, ".design-os"))).toBe(false);
  });
});
