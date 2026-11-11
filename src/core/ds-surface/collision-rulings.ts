/**
 * What the owner's `component-name-collision` rulings do to a surface (spec 033 FR-020). A ruling names, per collision,
 * the file kept public (`keep:<file>`); every other file of the name is listed under `shadowed` with the fingerprint of
 * the ruling that decided it. No component leaves the output. A collision no ruling governs (or whose ruling names a
 * file the name is no longer exported from) stays unruled: it is asked, and nothing that depends on which file is
 * public is written for it.
 */
import { collisionMemberOf, keptFile } from "../owner-rulings/kind-component-name-collision.js";
import { governingRuling } from "../owner-rulings/resolve-detections.js";
import { outcomeOf } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { byText } from "./surface-types.js";
import type { SurfaceCollision, SurfaceShadowed } from "./surface-types.js";

export interface CollisionRulingResult {
  shadowed: SurfaceShadowed[];
  /** name -> the file kept public, for the collisions a ruling decided. */
  publicFile: Map<string, string>;
  /** The collisions no ruling decides yet. */
  unruled: SurfaceCollision[];
}

export function applyCollisionRulings(collisions: readonly SurfaceCollision[], rulings: readonly Ruling[]): CollisionRulingResult {
  const out: CollisionRulingResult = { shadowed: [], publicFile: new Map(), unruled: [] };
  for (const c of collisions) {
    const member = collisionMemberOf(c);
    const ruling = governingRuling(rulings, "component-name-collision", member);
    const kept = ruling === undefined ? null : keptFile(outcomeOf(ruling, member));
    if (ruling === undefined || kept === null || !c.files.includes(kept)) { out.unruled.push(c); continue; }
    out.publicFile.set(c.name, kept);
    for (const file of c.files) if (file !== kept) out.shadowed.push({ name: c.name, file, fingerprint: ruling.fingerprint });
  }
  out.shadowed.sort((a, b) => byText(a.file, b.file) || byText(a.name, b.name));
  return out;
}
