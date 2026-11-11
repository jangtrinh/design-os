/**
 * From the surface to registry records (spec 033 FR-027, controller rulings R3 and R4). The preview lists the records
 * the surface would write: the component name, a `sourceRef` (`file:start-end`, the provenance form of Spec 031 P2),
 * the `tokensUsed` of the component, and the variants only where `variants-reader.ts` read them exactly. A component
 * whose variants no extractor read exactly gets none and is counted under `notRead`; nothing is inferred from a file name.
 *
 *  - A shadowed file is not registered: its name is taken by the public file the owner chose.
 *  - A collision no ruling decides yet is listed under `awaitingRuling` and nothing is planned for it: which file is
 *    public is the question, so nothing that depends on the answer is written.
 *  - A name already in the registry is listed under `alreadyRegistered` (the name, the provenance kind of the record that
 *    holds it, the code file). The rule for such a name is an open owner decision: the caller refuses to write while the
 *    list is not empty, and never replaces or renames a record.
 */
import type { Registry } from "../registry-store.js";
import type { CollisionRulingResult } from "./collision-rulings.js";
import { byText } from "./surface-types.js";
import type { ComponentDetail, SurfaceCollision, SurfaceModel } from "./surface-types.js";

export interface PlannedRecord {
  name: string;
  /** The directory of the file: the only grouping fact the source states. */
  category: string;
  sourceRef: string;
  tokensUsed: string[];
  variants: string[];
}
export interface RegisterPreview {
  records: PlannedRecord[];
  /** Components registered with no variants because no extractor read them exactly. */
  notRead: { count: number; components: string[] };
  alreadyRegistered: { count: number; items: { name: string; existingProvenance: string | null; file: string }[] };
  awaitingRuling: SurfaceCollision[];
  /** Files left out of the registry because the owner ruled another file of the name public. */
  shadowedNotRegistered: number;
}
/** What the shared registration path takes: the preview record with the markup (the source slice) it is checked against. */
export interface BatchInput extends PlannedRecord { markup: string }
export interface RegisterPlan { preview: RegisterPreview; batch: BatchInput[] }

export function planRegistration(model: SurfaceModel, rulings: CollisionRulingResult, existing: Registry | null): RegisterPlan {
  const awaiting = new Set(rulings.unruled.map((c) => c.name));
  const shadowed = new Set(rulings.shadowed.map((s) => `${s.file}#${s.name}`));
  const tokensOf = new Map(model.output.components.map((c) => [`${c.file}#${c.name}`, c.tokens]));
  const held = new Map((existing?.components ?? []).map((c) => [c.name, c]));

  const candidates = model.details.filter((d) => !awaiting.has(d.name) && !shadowed.has(`${d.file}#${d.name}`));
  const already = candidates.filter((d) => held.has(d.name));
  const records: PlannedRecord[] = candidates.map((d) => ({
    name: d.name, category: d.dir, sourceRef: `${d.file}:${d.startLine}-${d.endLine}`,
    tokensUsed: tokensOf.get(`${d.file}#${d.name}`) ?? [], variants: d.variants,
  }));
  const notRead = candidates.filter((d) => d.variants.length === 0).map((d) => d.name);
  return {
    batch: records.map((r, i) => ({ ...r, markup: (candidates[i] as ComponentDetail).source })),
    preview: {
      records,
      notRead: { count: notRead.length, components: [...new Set(notRead)].sort(byText) },
      alreadyRegistered: {
        count: already.length,
        items: already.map((d) => ({ name: d.name, existingProvenance: held.get(d.name)?.provenance?.kind ?? null, file: d.file })),
      },
      awaitingRuling: rulings.unruled,
      shadowedNotRegistered: rulings.shadowed.length,
    },
  };
}
