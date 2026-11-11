/**
 * A stored ruling is honoured only for a file the name is still exported from (review mutation m10, section F/G pin):
 * a ruling that keeps a file the name has left stays unruled, nothing is shadowed and nothing is made public by it.
 */
import { describe, expect, it } from "vitest";
import { applyCollisionRulings } from "../src/core/ds-surface/collision-rulings.js";
import { collisionMemberOf, keepFileOutcome } from "../src/core/owner-rulings/kind-component-name-collision.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";

const collision = { name: "Chip", files: ["src/a/Chip.tsx", "src/b/Chip.tsx"] };
const member = collisionMemberOf(collision);
const ruling = (kept: string): Ruling => ({ kind: "component-name-collision", fingerprint: "f".repeat(64), choice: "public-dir:x", covers: [member], members: { [member]: keepFileOutcome(kept) }, actor: "owner", at: "2026-11-11T09:00:00Z" });

describe("applyCollisionRulings", () => {
  it("keeps the named file public and lists the others as shadowed", () => {
    const r = applyCollisionRulings([collision], [ruling("src/a/Chip.tsx")]);
    expect(r.publicFile.get("Chip")).toBe("src/a/Chip.tsx");
    expect(r.shadowed.map((s) => s.file)).toEqual(["src/b/Chip.tsx"]);
    expect(r.unruled).toEqual([]);
  });
  it("a ruling that names a file the name is no longer exported from leaves the collision unruled", () => {
    const r = applyCollisionRulings([collision], [ruling("src/gone/Chip.tsx")]);
    expect(r.unruled).toEqual([collision]);
    expect(r.shadowed).toEqual([]);
    expect(r.publicFile.size).toBe(0);
  });
  it("a ruling that is not a keep outcome leaves it unruled", () => {
    const r = applyCollisionRulings([collision], [{ ...ruling("src/a/Chip.tsx"), members: { [member]: "exclude" } }]);
    expect(r.unruled).toEqual([collision]);
  });
});
