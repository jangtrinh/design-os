/**
 * Which components found in code are asked about as `component-source-match` (spec 033 FR-027, owner decision D16, and
 * controller ruling R4). Only a component the surface would register is a candidate: a name inside a collision no
 * ruling decides is not asked yet (which file is public comes first) and a shadowed file is not registered at all.
 * A candidate is asked when its name is exactly the name of a record whose provenance is not `code` and that has no code
 * source of its own; a record that came from the code door is the same door, which is not a question.
 */
import { hasCodeSource } from "../registry-code-source.js";
import type { SourceMatchCandidate } from "../owner-rulings/kind-component-source-match.js";
import { NO_PROVENANCE_ID } from "../owner-rulings/kind-component-source-match.js";
import type { Registry } from "../registry-store.js";
import type { CollisionRulingResult } from "./collision-rulings.js";
import type { ComponentDetail, SurfaceModel } from "./surface-types.js";
import { idOf } from "./surface-types.js";

/** The components the surface would register after the collision rulings, in file order. */
export function registrableDetails(model: SurfaceModel, rulings: CollisionRulingResult): ComponentDetail[] {
  const awaiting = new Set(rulings.unruled.map((c) => c.name));
  const shadowed = new Set(rulings.shadowed.map(idOf));
  return model.details.filter((d) => !awaiting.has(d.name) && !shadowed.has(idOf(d)));
}

export function sourceMatchCandidates(model: SurfaceModel, rulings: CollisionRulingResult, existing: Registry | null): SourceMatchCandidate[] {
  const held = new Map((existing?.components ?? []).map((c) => [c.name, c]));
  const tokensOf = new Map(model.output.components.map((c) => [idOf(c), c.tokens]));
  const out: SourceMatchCandidate[] = [];
  for (const d of registrableDetails(model, rulings)) {
    const record = held.get(d.name);
    if (record === undefined || hasCodeSource(record)) continue;
    out.push({
      name: d.name, existingId: record.provenance?.sourceRef ?? NO_PROVENANCE_ID, file: d.file,
      existingTokens: record.tokensUsed, codeTokens: tokensOf.get(idOf(d)) ?? [],
    });
  }
  return out;
}
