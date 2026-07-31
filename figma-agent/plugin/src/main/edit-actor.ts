// Owner-edit change feed (wave 4.4, phase 01) — actor classification. Pure function over
// injected state: no `figma`, no clock read inside, fully unit-tested (tests/edit-actor.test.ts).
//
// Per-node id subtraction alone does NOT work — measured against the dispatch code in
// main.ts, not assumed. `mutationTargetIds` declares targets for six commands only
// (SET_VARIANT, BIND_VARIABLE, SET_AUTOLAYOUT, SET_CONSTRAINTS, SET_TEXT, CLONE_TRAITS);
// `resultMutationIds` learns a created id AFTER dispatch returns — i.e. after the change
// event already fired; EXEC_JS mutates arbitrary nodes it never declares; `runBatch` routes
// children straight to `dispatch` with no bookkeeping; and a command that throws mid-way
// mutated nodes it never recorded. A pure nodeId subtraction would therefore label most
// agent work `owner` — the exact failure A2 (spec) forbids.
//
// So the classifier takes TWO signals: a time-bounded "an agent command is executing right
// now" flag (covers every command class, including EXEC_JS and batch children) plus the
// per-node declarations where they exist.
import type { EditActor, EditOp } from '../../../shared/edit-feed';

/** "The agent touched this recently" — cannot claim owner within this window. Also the
 *  trailing grace window after the LAST in-flight dispatch drains to zero (post-review
 *  fix): a write landing just after every active dispatch finishes is still attributable,
 *  and using the same window as the per-node echo check keeps one duration to reason
 *  about instead of two. */
export const AGENT_ECHO_MS = 10_000;

export interface ActorState {
  /** Number of agent dispatches currently in flight. Concurrent overlapping commands
   *  (two CLI invocations racing the same plugin instance) are real, not a corner case —
   *  a single scalar "busy until" clobbers one dispatch's window with another's, so this
   *  is a COUNTER: incremented at receipt, decremented when each dispatch's reply posts. */
  activeCount: number;
  /** epoch ms the active count last returned to 0 (0 = never has, i.e. idle since boot). */
  lastDrainAt: number;
  /**
   * nodeId → epoch ms the declaration EXPIRES. Same lifecycle as `lastAgentAt` (post-
   * review, second fix round): `Infinity` while the declaring dispatch is still active,
   * then stamped to `now + AGENT_ECHO_MS` in that dispatch's own `finally` once it
   * finishes, then pruned. An add-only union that only ever cleared in one blanket sweep
   * (the first fix round's version) grows unboundedly under continuous traffic AND lets a
   * long-finished request's ids keep mislabelling a much-later owner edit as `agent` — the
   * defect this shape exists to close. May be empty.
   */
  declared: ReadonlyMap<string, number>;
  /** nodeId → epoch ms of the last COMPLETED agent mutation (resultMutationIds + declared). */
  lastAgentAt: ReadonlyMap<string, number>;
}

/** Whether `nodeId`'s declaration is still valid at `now` — active (`Infinity`) or
 *  within its post-completion echo window. Exported so main.ts's per-batch pruning can
 *  reuse the exact same rule the classifier uses, rather than a second copy of it. */
export function isDeclaredNow(declared: ReadonlyMap<string, number>, nodeId: string, now: number): boolean {
  const expiresAt = declared.get(nodeId);
  return expiresAt !== undefined && (expiresAt === Infinity || now < expiresAt);
}

/**
 * Command-log subtraction (spec brief #3), in strict order:
 *   1. busy && isDeclaredNow(id)        → 'agent'      (its own write landing)
 *   2. busy && otherwise                → 'ambiguous'  (EXEC_JS's untracked work, an
 *                                                        UNDECLARED creation, or the
 *                                                        owner editing during a run)
 *   3. !busy && lastAgentAt within AGENT_ECHO_MS → 'ambiguous'
 *   4. otherwise                        → 'owner'
 * Rule 2 is the honest answer, not a gap: while a command runs, an undeclared node change
 * is genuinely indistinguishable from an owner edit, and guessing either way is what this
 * wave exists to stop — `ambiguous` is a refusal to guess, never a fallback.
 *
 * **Post-review correction (Codex P1, supersedes the phase's original rule):** an
 * UNDECLARED `created` node while busy is now `ambiguous`, not `agent`. The original rule
 * special-cased creation because a fresh id cannot be in `declared` (mutationTargetIds
 * only sees id-taking params, and resultMutationIds learns the new id AFTER dispatch
 * returns — too late for this classification) — but that same blind spot means an OWNER
 * creating a node while an agent command happens to be running would ALSO get labelled
 * `agent`, which is exactly the guess A2 forbids applied to the wrong direction. Until a
 * command declares the ids it creates (the flagged follow-up: `ui.*` stdlib recording
 * touched ids), an undeclared creation during a busy window stays `ambiguous` like any
 * other undeclared write — narrower coverage, but never a false `agent`.
 *
 * `op` is accepted for shape-compatibility with callers and future rules but is not
 * currently read — the created-node special case that used it was removed above.
 */
export function classifyActor(
  nodeId: string, _op: EditOp, now: number, s: ActorState,
): EditActor {
  const busy = s.activeCount > 0 || (s.lastDrainAt > 0 && now - s.lastDrainAt < AGENT_ECHO_MS);
  if (busy) {
    return isDeclaredNow(s.declared, nodeId, now) ? 'agent' : 'ambiguous';
  }
  const lastAgentAt = s.lastAgentAt.get(nodeId);
  if (lastAgentAt !== undefined && now - lastAgentAt < AGENT_ECHO_MS) return 'ambiguous';
  return 'owner';
}

// ─── State hygiene — pure, mutate-in-place, exported for direct unit testing ─────────
// main.ts holds the actual `declared`/`lastAgentAt` Maps as module state and calls these
// once per documentchange batch / once per completed dispatch respectively; kept here
// (not as main.ts-local closures) so a continuous-traffic loop and the cap can be
// exercised without a figma mock harness.

export const DECLARED_IDS_CAP = 2_000;
export const LAST_AGENT_AT_CAP = 2_000;

/** Evict oldest-first (Map insertion order) until `map.size <= cap`. */
function enforceCap(map: Map<string, number>, cap: number): void {
  if (map.size <= cap) return;
  let excess = map.size - cap;
  for (const id of map.keys()) {
    if (excess <= 0) break;
    map.delete(id);
    excess -= 1;
  }
}

/**
 * Drop `declared` entries whose expiry has passed (an `Infinity` entry is never dropped
 * here — that id's dispatch is still active), then enforce a hard cap. A long session
 * under continuous traffic must not grow this map without bound.
 */
export function pruneDeclaredIds(declared: Map<string, number>, now: number, cap = DECLARED_IDS_CAP): void {
  for (const [id, expiresAt] of declared) {
    if (expiresAt !== Infinity && now >= expiresAt) declared.delete(id);
  }
  enforceCap(declared, cap);
}

/** Drop `lastAgentAt` entries the echo window has already outlived, then enforce a hard
 *  cap. Same shape as `pruneDeclaredIds`, independently owned (different map, different
 *  meaning — a CONFIRMED mutation vs a DECLARED target). */
export function pruneLastAgentAt(
  lastAgentAt: Map<string, number>, now: number, echoMs = AGENT_ECHO_MS, cap = LAST_AGENT_AT_CAP,
): void {
  for (const [id, at] of lastAgentAt) {
    if (now - at >= echoMs) lastAgentAt.delete(id);
  }
  enforceCap(lastAgentAt, cap);
}
