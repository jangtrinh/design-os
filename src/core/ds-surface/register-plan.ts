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
 *  - A name held by a record that already has a code source is the same door, not a source-match question: the same
 *    reference and hash is `unchanged`; anything else is a `component-source-changed` member (`source-changed-plan.ts`):
 *    `refresh` is planned, `keep` is listed as stale by ruling, no ruling is listed as awaiting. No record is ever
 *    replaced, and nothing is refreshed without an answer.
 */
import { sha256OfText } from "../../commands/registry-provenance-refs.js";
import { hasCodeSource, normalizedName, unionTokens } from "../registry-code-source.js";
import { SAME_OUTCOME, SEPARATE_OUTCOME, sourceMatchMemberOf } from "../owner-rulings/kind-component-source-match.js";
import { NO_PROVENANCE_ID } from "../owner-rulings/kind-component-source-match.js";
import { governingRuling } from "../owner-rulings/resolve-detections.js";
import { outcomeOf } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import type { ComponentRecord, Registry } from "../registry-store.js";
import type { CollisionRulingResult } from "./collision-rulings.js";
import { heldRecordFor, registrableDetails } from "./source-match-candidates.js";
import { classifySameDoor } from "./source-changed-plan.js";
import type { ChangedSourceItem, PlannedRefresh } from "./source-changed-plan.js";
import type { SourceChangedCandidate } from "../owner-rulings/kind-component-source-changed.js";
import { registerLedger } from "./register-ledger.js";
import type { RegisterLedger } from "./register-ledger.js";
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
/** A registered record with a code source whose component is no longer in the app: listed, never deleted. */
export interface RegisteredNotFound { name: string; sourceRef: string }
/** A component the owner ruled "separate" whose `<name> · code` is held by a record of another door. */
export interface SeparateNameHeld { name: string; heldBy: string }
export interface AwaitingMatch { name: string; existingSource: string | null; file: string }
export interface RegisterPreview {
  /** New records, the `<name> · code` ones included. */
  records: PlannedRecord[];
  /** Existing records that gain a code reference. */
  links: { name: string; sourceRef: string; tokensAdded: string[] }[];
  /** Components whose registered code source is exactly what the tree holds now. */
  unchanged: number;
  /** Records rewritten from the current source (the owner answered `refresh`): what each one keeps and gains. */
  refreshes: { name: string; sourceRef: string; linked: boolean; tokensAdded: string[]; tokensRemoved: string[]; tokensKept: string[] }[];
  /** Records the owner ruled to keep as registered although their source changed: stale until it changes again. */
  staleByRuling: ChangedSourceItem[];
  awaitingSourceChanged: ChangedSourceItem[];
  /** Records the design-system lint refused and the owner ruled to leave out: not registered. */
  leftOutByRuling: { name: string; code: string; file: string }[];
  /** Records the lint refused that no answer governs yet, and the ones the owner ruled `stop` for. */
  awaitingLintRuling: { name: string; code: string; file: string }[];
  lintStopped: { name: string; code: string; file: string }[];
  /** Every component of the run is in exactly one term of the ledger. */
  ledger: RegisterLedger;
  awaitingSourceMatch: AwaitingMatch[];
  /** Records registered from code whose component the app no longer holds (nothing is deleted). */
  registeredNotFound: RegisteredNotFound[];
  /** Components ruled "separate" whose `<name> · code` is already held by a record of another door: `--apply` refuses them by name. */
  separateNameHeld: SeparateNameHeld[];
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
export interface RegisterPlan {
  preview: RegisterPreview; batch: BatchInput[]; links: PlannedLink[]; refreshes: PlannedRefresh[];
  /** Every component whose registered code source differs from the tree, answered or not: the members of the question. */
  sourceChanged: SourceChangedCandidate[];
  /** How many components the run plans for (every registrable component is in exactly one outcome). */
  planned: number;
}

export function planRegistration(model: SurfaceModel, rulings: CollisionRulingResult, existing: Registry | null, matchRulings: readonly Ruling[]): RegisterPlan {
  const tokensOf = new Map(model.output.components.map((c) => [idOf(c), c.tokens]));
  const held = new Map<string, ComponentRecord>((existing?.components ?? []).map((c) => [c.name, c]));
  const batch: BatchInput[] = [];
  const links: PlannedLink[] = [];
  const refreshes: PlannedRefresh[] = [];
  const sourceChanged: SourceChangedCandidate[] = [];
  const staleByRuling: ChangedSourceItem[] = [];
  const awaitingSourceChanged: ChangedSourceItem[] = [];
  const awaitingSourceMatch: AwaitingMatch[] = [];
  const separateNameHeld: SeparateNameHeld[] = [];
  const notRead: string[] = [];
  const severalUnions: string[] = [];
  let unchanged = 0;
  const registrable = registrableDetails(model, rulings);

  for (const d of registrable) {
    const sourceRef = `${d.file}:${d.startLine}-${d.endLine}`;
    const sha256 = sha256OfText(d.source);
    const tokens = tokensOf.get(idOf(d)) ?? [];
    const asNew = (name: string, separate: boolean): void => {
      if (d.variants.length === 0) notRead.push(d.name);
      if (d.severalUnions) severalUnions.push(d.name);
      batch.push({ name, category: d.dir, sourceRef, tokensUsed: tokens, variants: d.variants, markup: d.source, ...(separate && { separate: true as const }) });
    };
    /** The same door: the registered code source is compared with the tree; a change is the owner's to answer, never replaced. */
    const sameDoor = (record: ComponentRecord): void => {
      const done = classifySameDoor(record, { sourceRef, sha256, markup: d.source, tokens, variants: d.variants }, matchRulings);
      if (done.kind === "unchanged") { unchanged++; return; }
      sourceChanged.push(done.candidate);
      if (done.kind === "refresh") refreshes.push(done.refresh);
      else if (done.kind === "stale") staleByRuling.push(done.item);
      else awaitingSourceChanged.push(done.item);
    };

    const record = heldRecordFor(existing, d.name);
    if (record === undefined) { asNew(d.name, false); continue; }
    if (hasCodeSource(record)) { sameDoor(record); continue; }

    const member = sourceMatchMemberOf({ name: d.name, existingId: record.provenance?.sourceRef ?? NO_PROVENANCE_ID, file: d.file });
    const ruling = governingRuling(matchRulings, "component-source-match", member);
    const outcome = ruling === undefined ? undefined : outcomeOf(ruling, member);
    if (outcome === SAME_OUTCOME) {
      links.push({ name: record.name, sourceRef, sha256, tokens, tokensAdded: unionTokens([], tokens).filter((t) => !record.tokensUsed.includes(t)) });
    } else if (outcome === SEPARATE_OUTCOME) {
      const own = held.get(separateName(d.name));
      if (own === undefined) asNew(separateName(d.name), true);
      else if (hasCodeSource(own)) sameDoor(own);
      else separateNameHeld.push({ name: d.name, heldBy: own.name });
    } else {
      awaitingSourceMatch.push({ name: d.name, existingSource: record.provenance?.sourceRef ?? null, file: d.file });
    }
  }
  const appRoot = model.output.app === "." ? "" : model.output.app;
  const present = new Set(model.details.map((d) => normalizedName(d.name)));
  const registeredNotFound: RegisteredNotFound[] = [];
  for (const r of existing?.components ?? []) {
    const source = r.code ?? (r.provenance?.kind === "code" ? r.provenance : undefined);
    if (source === undefined) continue;
    const file = source.sourceRef.replace(/:\d+(?:-\d+)?$/, "");
    if (appRoot !== "" && !file.startsWith(`${appRoot}/`)) continue; // another app's record: this run did not read that app
    const codeName = r.name.endsWith(" · code") ? r.name.slice(0, -" · code".length) : r.name;
    if (!present.has(normalizedName(codeName))) registeredNotFound.push({ name: r.name, sourceRef: source.sourceRef });
  }
  const preview: RegisterPreview = {
      records: batch.map((b) => ({ name: b.name, category: b.category, sourceRef: b.sourceRef, tokensUsed: b.tokensUsed, variants: b.variants })),
      links: links.map((l) => ({ name: l.name, sourceRef: l.sourceRef, tokensAdded: l.tokensAdded })),
      unchanged, awaitingSourceMatch, staleByRuling, awaitingSourceChanged,
      refreshes: refreshes.map((r) => ({ name: r.name, sourceRef: r.sourceRef, linked: r.linked, tokensAdded: r.tokensAdded, tokensRemoved: r.tokensRemoved, tokensKept: r.tokensKept })),
      leftOutByRuling: [], awaitingLintRuling: [], lintStopped: [], ledger: { planned: 0, written: 0, linked: 0, refreshed: 0, unchanged: 0, staleByRuling: 0, leftOutByRuling: 0, stopped: 0, separateNameHeld: 0, awaitingRuling: 0 },
      registeredNotFound: registeredNotFound.sort((a, b) => byText(a.name, b.name)), separateNameHeld,
      notRead: { count: notRead.length, components: [...new Set(notRead)].sort(byText), severalUnions: [...new Set(severalUnions)].sort(byText) },
      awaitingRuling: rulings.unruled,
      wouldRefuse: { count: 0, byCode: {}, items: [] },
      shadowedNotRegistered: rulings.shadowed.length,
  };
  preview.ledger = registerLedger(preview, registrable.length);
  return { batch, links, refreshes, sourceChanged, planned: registrable.length, preview };
}
