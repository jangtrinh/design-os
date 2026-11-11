/**
 * From the surface to registry changes (spec 033 FR-027, controller ruling R4, owner decision D16). The preview lists
 * what `--apply` would write: the component name, a `sourceRef` (`file:start-end`, the provenance form of Spec 031 P2),
 * the `tokensUsed` of the component, and the variants only where `variants-reader.ts` read them exactly. A component
 * whose variants no extractor read exactly gets none and is counted under `notRead`; nothing is inferred from a file name.
 *
 *  - A shadowed file is not registered: its name is taken by the public file the owner chose.
 *  - A collision no ruling decides yet is listed under `awaitingRuling` and nothing is planned for it.
 *  - A name that is not in the registry is a new record.
 *  - A name held by a record that came from another door is asked (`component-source-match`) and listed under
 *    `awaitingSourceMatch` until a ruling decides it. "Same" is a `link` (the record keeps everything and gains the code
 *    reference and the tokens); "separate" is a new record named `<name> · code`. Nothing is linked by name alone.
 *  - A name held by a record that already has a code source is the same door, not a question: the same reference and
 *    hash is `unchanged`, anything else is `changed` and the caller refuses it by name. No record is ever replaced.
 */
import { sha256OfText } from "../../commands/registry-provenance-refs.js";
import { hasCodeSource, unionTokens } from "../registry-code-source.js";
import { SAME_OUTCOME, SEPARATE_OUTCOME, sourceMatchMemberOf } from "../owner-rulings/kind-component-source-match.js";
import { NO_PROVENANCE_ID } from "../owner-rulings/kind-component-source-match.js";
import { governingRuling } from "../owner-rulings/resolve-detections.js";
import { outcomeOf } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import type { ComponentRecord, Registry } from "../registry-store.js";
import type { CollisionRulingResult } from "./collision-rulings.js";
import { registrableDetails } from "./source-match-candidates.js";
import { byText, idOf } from "./surface-types.js";
import type { SurfaceCollision, SurfaceModel } from "./surface-types.js";

/** The name a component gets when the owner ruled it is not the component that already holds its name. */
export const separateName = (name: string): string => `${name} · code`;

export interface PlannedRecord {
  name: string;
  /** The directory of the file: the only grouping fact the source states. */
  category: string;
  sourceRef: string;
  tokensUsed: string[];
  variants: string[];
}
export interface PlannedLink { name: string; sourceRef: string; sha256: string; tokens: string[]; tokensAdded: string[] }
export interface ChangedSource { name: string; file: string; heldRef: string; nowRef: string }
export interface AwaitingMatch { name: string; existingSource: string | null; file: string }
export interface RegisterPreview {
  /** New records, the `<name> · code` ones included. */
  records: PlannedRecord[];
  /** Existing records that gain a code reference. */
  links: { name: string; sourceRef: string; tokensAdded: string[] }[];
  /** Components whose registered code source is exactly what the tree holds now. */
  unchanged: number;
  /** Components whose registered code source differs from the tree: refused by name, never replaced. */
  changed: ChangedSource[];
  awaitingSourceMatch: AwaitingMatch[];
  /** Components registered with no variants because no extractor read them exactly. */
  notRead: { count: number; components: string[]; /** The ones left without variants because their props hold more than one literal union. */ severalUnions: string[] };
  awaitingRuling: SurfaceCollision[];
  /**
   * What a write of this plan would refuse, counted per code, from the same checks the write runs (filled by the command,
   * which reads the store). `notChecked` says why the checks could not run (a store that drifted from its seal).
   */
  wouldRefuse: { count: number; byCode: Record<string, number>; items: { name: string; code: string; message: string }[]; notChecked?: string };
  /** Files left out of the registry because the owner ruled another file of the name public. */
  shadowedNotRegistered: number;
}
/** What the shared registration path takes: the preview record with the markup (the source slice) it is checked against. */
export interface BatchInput extends PlannedRecord { markup: string; separate?: true }
export interface RegisterPlan { preview: RegisterPreview; batch: BatchInput[]; links: PlannedLink[] }

export function planRegistration(model: SurfaceModel, rulings: CollisionRulingResult, existing: Registry | null, matchRulings: readonly Ruling[]): RegisterPlan {
  const tokensOf = new Map(model.output.components.map((c) => [idOf(c), c.tokens]));
  const held = new Map<string, ComponentRecord>((existing?.components ?? []).map((c) => [c.name, c]));
  const batch: BatchInput[] = [];
  const links: PlannedLink[] = [];
  const changed: ChangedSource[] = [];
  const awaitingSourceMatch: AwaitingMatch[] = [];
  const notRead: string[] = [];
  const severalUnions: string[] = [];
  let unchanged = 0;

  for (const d of registrableDetails(model, rulings)) {
    const sourceRef = `${d.file}:${d.startLine}-${d.endLine}`;
    const sha256 = sha256OfText(d.source);
    const tokens = tokensOf.get(idOf(d)) ?? [];
    const asNew = (name: string, separate: boolean): void => {
      if (d.variants.length === 0) notRead.push(d.name);
      if (d.severalUnions) severalUnions.push(d.name);
      batch.push({ name, category: d.dir, sourceRef, tokensUsed: tokens, variants: d.variants, markup: d.source, ...(separate && { separate: true as const }) });
    };
    /** The same door: the registered code source is compared with the tree, never replaced. */
    const sameDoor = (record: ComponentRecord): void => {
      const source = record.code ?? record.provenance!;
      if (source.sourceRef === sourceRef && source.sha256 === sha256) unchanged++;
      else changed.push({ name: record.name, file: d.file, heldRef: source.sourceRef, nowRef: sourceRef });
    };

    const record = held.get(d.name);
    if (record === undefined) { asNew(d.name, false); continue; }
    if (hasCodeSource(record)) { sameDoor(record); continue; }

    const member = sourceMatchMemberOf({ name: d.name, existingId: record.provenance?.sourceRef ?? NO_PROVENANCE_ID, file: d.file });
    const ruling = governingRuling(matchRulings, "component-source-match", member);
    const outcome = ruling === undefined ? undefined : outcomeOf(ruling, member);
    if (outcome === SAME_OUTCOME) {
      links.push({ name: d.name, sourceRef, sha256, tokens, tokensAdded: unionTokens([], tokens).filter((t) => !record.tokensUsed.includes(t)) });
    } else if (outcome === SEPARATE_OUTCOME) {
      const own = held.get(separateName(d.name));
      if (own !== undefined && hasCodeSource(own)) sameDoor(own); else asNew(separateName(d.name), true);
    } else {
      awaitingSourceMatch.push({ name: d.name, existingSource: record.provenance?.sourceRef ?? null, file: d.file });
    }
  }
  return {
    batch, links,
    preview: {
      records: batch.map((b) => ({ name: b.name, category: b.category, sourceRef: b.sourceRef, tokensUsed: b.tokensUsed, variants: b.variants })),
      links: links.map((l) => ({ name: l.name, sourceRef: l.sourceRef, tokensAdded: l.tokensAdded })),
      unchanged, changed, awaitingSourceMatch,
      notRead: { count: notRead.length, components: [...new Set(notRead)].sort(byText), severalUnions: [...new Set(severalUnions)].sort(byText) },
      awaitingRuling: rulings.unruled,
      wouldRefuse: { count: 0, byCode: {}, items: [] },
      shadowedNotRegistered: rulings.shadowed.length,
    },
  };
}
