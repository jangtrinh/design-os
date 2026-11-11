/**
 * What `--register` does with a component whose name is held by a record that already has a code source (spec 033 D18).
 * The same reference and hash is unchanged. Anything else is a `component-source-changed` member: the owner's answer
 * decides, member by member, and nothing is refreshed, replaced or dropped without one. `refresh` is planned (the batch
 * rewrites the record through the narrow refresh function), `keep` leaves the record and lists it as stale, and a member
 * no ruling governs is listed as awaiting and planned for nothing.
 */
import { REFRESH_OUTCOME, KEEP_OUTCOME, sourceChangedMemberOf, tokenMovement } from "../owner-rulings/kind-component-source-changed.js";
import type { SourceChangedCandidate } from "../owner-rulings/kind-component-source-changed.js";
import { governingRuling } from "../owner-rulings/resolve-detections.js";
import { outcomeOf } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import type { ComponentRecord } from "../registry-store.js";

/** A record that is rewritten from the current source by `--apply`. */
export interface PlannedRefresh {
  name: string;
  sourceRef: string;
  /** The slice the code reference points at. */
  markup: string;
  tokens: string[];
  variants: string[];
  /** True for a record linked to a record of another door: only its code reference and tokens move. */
  linked: boolean;
  tokensAdded: string[];
  tokensRemoved: string[];
  /** Tokens the code no longer references that a linked record keeps. */
  tokensKept: string[];
}
/** A record whose source differs from the tree: kept as registered by ruling, or still awaiting one. */
export interface ChangedSourceItem {
  name: string; heldRef: string; nowRef: string;
  /** False when the slice hash is the one the record holds: the component only moved (its lines changed, its content did not). */
  contentChanged: boolean;
}

export type SameDoorOutcome =
  | { kind: "unchanged" }
  | { kind: "refresh"; candidate: SourceChangedCandidate; refresh: PlannedRefresh }
  | { kind: "stale"; candidate: SourceChangedCandidate; item: ChangedSourceItem }
  | { kind: "awaiting"; candidate: SourceChangedCandidate; item: ChangedSourceItem };

export interface CurrentSource { sourceRef: string; sha256: string; markup: string; tokens: string[]; variants: string[] }

export function classifySameDoor(record: ComponentRecord, now: CurrentSource, rulings: readonly Ruling[]): SameDoorOutcome {
  const held = record.code ?? record.provenance!;
  if (held.sourceRef === now.sourceRef && held.sha256 === now.sha256) return { kind: "unchanged" };
  const candidate: SourceChangedCandidate = {
    name: record.name, heldRef: held.sourceRef, heldSha: held.sha256, nowRef: now.sourceRef, nowSha: now.sha256,
    linked: record.provenance?.kind !== "code", heldTokens: record.tokensUsed, codeTokens: now.tokens,
  };
  const member = sourceChangedMemberOf(candidate);
  const ruling = governingRuling(rulings, "component-source-changed", member);
  const outcome = ruling === undefined ? undefined : outcomeOf(ruling, member);
  const item = { name: record.name, heldRef: held.sourceRef, nowRef: now.sourceRef, contentChanged: held.sha256 !== now.sha256 };
  if (outcome === REFRESH_OUTCOME) {
    const move = tokenMovement(candidate);
    return {
      kind: "refresh", candidate,
      refresh: { name: record.name, sourceRef: now.sourceRef, markup: now.markup, tokens: now.tokens, variants: now.variants, linked: candidate.linked, tokensAdded: move.added, tokensRemoved: move.removed, tokensKept: move.kept },
    };
  }
  return outcome === KEEP_OUTCOME ? { kind: "stale", candidate, item } : { kind: "awaiting", candidate, item };
}
