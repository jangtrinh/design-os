# Phase 03 — Recurrence lifecycle + decay on last retrieval (kernel)

> **Executor: Sonnet.** Two independent halves in one PR: **P3a** the graph's insight
> recurrence counters (`src/`), **P3b** recall's decay input (`recall/`). Neither calls a
> model. If the diff grows past the module caps, split P3b into its own PR and say so.

## Context Links

- Spec `specs/006-living-loop/spec.md` §3, §4, AC4 · Plan `plan.md` P3
- Prior art: **ExpeL** (recurrence-gated insights), **Oblivion** (decay on last *retrieval*)
- Code read 2026-07-17: `src/core/memory-graph.ts`, `recall/cli/src/{rank,decay,store,cmd-query,cmd-reflect}.ts`
- Constitution Art I, Art IV, Art IX

## Overview

- **Priority**: P3 — small, pure, offline-testable. **Depends**: P1.
- **Status**: not started.
- **Description**: an insight strengthens when it recurs and fades when nobody re-queries it.
  P3a derives recurrence counters in the graph compile; P3b switches recall's decay clock
  from *write* time to *last-retrieval* time.

## Key Insights (these overturn plan.md — read first)

1. **`rank.ts` does not compute decay.** It *consumes* a `decay?: ReadonlyMap<string, number>`
   input (`rank.ts:23-34`) and multiplies (`rank.ts:83`). The weights are built by
   `decayWeights(items, nowIso)` in **`recall/cli/src/decay.ts:37-44`** from `item.t`, and
   passed in at two call sites: `cmd-query.ts:66-71` and `cmd-reflect.ts:126-131`.
   → **`rank.ts` is NOT edited in this phase.** plan.md's "`recall/rank.ts`: decay input
   switches to…" names the wrong file.
2. **There is no retrieval timestamp anywhere.** Verified across `recall/cli/src`, tests and
   README: `runQuery` is strictly read-only — `open → knn → bm25 → getItems →
   invalidatedIds → close`. The only thing it writes is the caller's `--out` rank file
   (`cmd-query.ts:106`). plan.md's "retrieval events already exist to timestamp against" is
   **false**; the minimal add is specified below.
3. **A retrieval stamp must be its own TABLE, never a column on `items`.** `upsert`
   (`store.ts:90-101`) does DELETE-then-INSERT per item, so a `lastRetrievedAt` column would
   be **silently wiped on every re-index of that item** — the bug would look like "decay
   randomly resets".
4. **`SCHEMA_VERSION` is written but never validated** (`store.ts:33`, written at `:65`,
   never read at open `:60-71`). So an additive `CREATE TABLE IF NOT EXISTS` needs no
   migration — existing DBs gain the table on next open.
5. **`item.t` is the ledger event's own timestamp**, and knowledge chunks are deliberately
   timeless (`knowledge.ts:18` `const TIMELESS = "";` → `decayWeight` returns 1 for `""`,
   `decay.ts:27`). That behaviour must survive: a knowledge chunk that is never retrieved
   must NOT start decaying.
6. **`compileGraph` is a pure fold with `default: break`** (`memory-graph.ts:155-156`) and
   emits key-sorted maps + `r4()`-rounded weights so identical events + `--now` give
   byte-identical JSON (module docstring). Every addition here must keep that.
7. **Nothing outside `memory-graph.ts` reads `graph.insights`** (grepped) — so *additive*
   fields on `InsightEntry` are safe; **collapsing** the array into one entry per cluster
   would not be, and is not done.

## Decisions (RESOLVED)

### Decision 1 — recurrence is derived from insight TEXT clusters, not new state

`compileGraph` stays a pure fold over the ledger. Cluster key:

```ts
/** Cluster key for recurrence: an insight said twice in different words is two insights. */
function insightKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");
}
```
Exact-after-normalisation only. **No fuzzy matching** — semantic similarity is a model
judgment and the kernel does not make those (Art I). P4's harvest is what produces
re-statements of the same lesson; if it re-states one in different words, that is a *new*
insight, and the honest answer is that the kernel cannot know otherwise.

### Decision 2 — the counters and their exact meaning

| Field | Meaning |
|---|---|
| `seen` | cluster size — how many insight events share this key (≥1) |
| `upvotes` | recurrences beyond the birth: `max(0, upEvents - 1)` |
| `downvotes` | cluster events carrying `data.vote === "down"` |
| `lastSeenAt` | max `t` in the cluster |

An event is a **down-event** iff `data.vote === "down"`; everything else is an up-event
(`data.vote` is optional and unenforced, like `gap.kind` — no `REQUIRED_DATA` change, no
`validateEvent` change). Every member entry of a cluster carries the **cluster's** stats —
the array stays one-entry-per-event so ids and provenance survive (Key Insight 7).

**Fading is not a counter.** An insight nobody re-queries fades through P3b's retrieval
decay in recall; `lastSeenAt` is the graph's honest record of when it was last *written*.
Do not add a decayed `weight` field: nothing reads it (recall derives its own weight —
`decay.ts:4-10` documents that deliberate deviation), and unread state is Art IX debt.

**The reader of these counters is P4** (harvest reads the graph to know an insight is
recurring) **and spec 007**. This is stated so the executor does not "wire it up" anywhere.

### Decision 3 — harvest re-records recurring insights; it does not suppress them

Recurrence *is* re-recording. P4 dedups within one batch only. Carried into phase-04.

### Decision 4 — the retrieval stamp lives in a `retrievals` table in the vec DB

Not the ledger: a query is not an outcome-bearing command, and appending an event per
served hit would flood the ledger (the exact bloat failure spec §Why cites). Not a column
(Key Insight 3).

**Accepted wart, documented in the README next to invariant #2:** `recall query` becomes a
**writer**, and retrieval history lives in a file the README calls a rebuildable cache. On a
full rebuild (`rm *.vec.db && recall index`) the history is lost and decay **falls back to
write-time = today's behaviour**. Graceful degradation, no correctness break, no new store.

### Decision 5 — only `recall query` touches; `recall reflect` does NOT

`runReflect` fuses too (`cmd-reflect.ts:126-131`), but it is an automatic background pass.
If reflect stamped retrievals, every item it neighboured would stay eternally fresh and
Oblivion decay would be defeated by our own machinery. **A retrieval means a human or an
agent asked for it and got it.**

## Related Code Files

**Modify (P3a)**
- `src/core/memory-graph.ts` — `InsightEntry` + the insight case + a post-pass
- `tests/memory-graph.test.ts` — extend

**Modify (P3b)**
- `recall/cli/src/store.ts` — `retrievals` table, `touch()`, `getItems` LEFT JOIN, `RecallItem`
- `recall/cli/src/decay.ts` — effective timestamp
- `recall/cli/src/cmd-query.ts` — call `touch` on the served hits
- `recall/README.md` — invariant #2 caveat
- `recall/tests/{store,decay}.test.ts`, `recall/tests/integration.test.ts`

**Do not touch**: `recall/cli/src/rank.ts` (Key Insight 1), `cmd-reflect.ts` (Decision 5),
`src/core/memory-corpus.ts`, `src/core/memory-events.ts`.

## Architecture — P3a `src/core/memory-graph.ts`

**Edit 1** — `InsightEntry` (`memory-graph.ts:21`) becomes:

```ts
export interface InsightEntry {
  id: string;
  t: string;
  text: string;
  refs: string[];
  /** How many insight events share this text (after normalisation). ExpeL recurrence. */
  seen: number;
  /** Recurrences beyond the first statement: max(0, upEvents - 1). */
  upvotes: number;
  /** Cluster events carrying data.vote === "down" (a lesson a later outcome refuted). */
  downvotes: number;
  /** The most recent t in the cluster. */
  lastSeenAt: string;
}
```

**Edit 2** — the `case "insight"` block (`:149-152`) keeps pushing one entry per event but
also records the key. Collect into a local `insightKeys: string[]` parallel array, or push
`{...entry, key}` into a private list and strip `key` in the post-pass. Prefer the second:

```ts
case "insight": {
  const text = str(data["text"]) ?? "";
  insights.push({
    id: e.id, t: e.t, text, refs: e.refs ?? [],
    seen: 0, upvotes: 0, downvotes: 0, lastSeenAt: e.t,   // filled by the post-pass
  });
  insightVotes.push(data["vote"] === "down" ? "down" : "up");
  break;
}
```
with `const insightVotes: ("up" | "down")[] = [];` declared beside `const insights` (`:61`).

**Edit 3** — a post-pass, placed **immediately before** the existing
`insights.sort(...)` (`:171`), i.e. after the event loop:

```ts
// ─── Recurrence (ExpeL): an insight restated is an insight strengthened ──────────
// Clusters are exact-after-normalisation (see insightKey): the kernel never judges
// two differently-worded lessons to be the same one — that is a model's call.
const clusters = new Map<string, { seen: number; up: number; down: number; lastSeenAt: string }>();
for (let i = 0; i < insights.length; i++) {
  const entry = insights[i] as InsightEntry;
  const key = insightKey(entry.text);
  const c = clusters.get(key) ?? { seen: 0, up: 0, down: 0, lastSeenAt: entry.t };
  c.seen += 1;
  if (insightVotes[i] === "down") c.down += 1; else c.up += 1;
  if (entry.t > c.lastSeenAt) c.lastSeenAt = entry.t;   // ISO-8601 UTC sorts lexically
  clusters.set(key, c);
}
for (const entry of insights) {
  const c = clusters.get(insightKey(entry.text));
  if (c === undefined) continue;
  entry.seen = c.seen;
  entry.upvotes = Math.max(0, c.up - 1);
  entry.downvotes = c.down;
  entry.lastSeenAt = c.lastSeenAt;
}
```

`lastSeenAt` lexical comparison is valid **only** for ISO-8601 UTC with the same precision.
The ledger's `t` comes from `new Date().toISOString()` or a validated `--at`
(`memory-record-impl.ts:27-33` accepts any `Date.parse`-able string, so a `+07:00` offset
*is* possible). Use `Date.parse` comparison instead, and keep the ISO string:
`if (Date.parse(entry.t) > Date.parse(c.lastSeenAt)) c.lastSeenAt = entry.t;`
— **use this version**; the lexical note above is why.

No change to `halfLifeDays`, `r4`, sorting, or any other aggregate.

## Architecture — P3b `recall/`

**Edit 1 — `store.ts`.** In the `db.exec` block (`store.ts:51-56`), after the `items` table:

```ts
// Retrieval log (spec 006 P3, Oblivion): decay measures time since a lesson was last
// SERVED, not since it was written. Its own table on purpose — `upsert` DELETEs and
// re-INSERTs `items` on every re-index, which would wipe a column here.
db.exec(`CREATE TABLE IF NOT EXISTS retrievals (id TEXT PRIMARY KEY, t TEXT NOT NULL)`);
```
Bump `SCHEMA_VERSION` to `"2"` (`store.ts:33`) — cosmetic today (it is written, never
validated, `store.ts:60-71`); do **not** build a migration framework for it, and say so in
the PR body.

`RecallItem` (`store.ts:~20-31`) gains:
```ts
  /** When this item was last served by `recall query` (absent = never). */
  lastRetrievedAt?: string;
```

`getItems` (`store.ts:143`) — change the statement to a LEFT JOIN and map the alias:
```ts
const stmt = this.db.prepare(
  `SELECT items.*, retrievals.t AS lastRetrievedAt
     FROM items LEFT JOIN retrievals ON retrievals.id = items.id
    WHERE items.id = ?`,
);
// … in the row mapping, alongside the existing entity/invalidatedBy spreads:
...(r.lastRetrievedAt !== null && r.lastRetrievedAt !== undefined ? { lastRetrievedAt: r.lastRetrievedAt } : {}),
```

New method, placed next to `supersedeEntity` (`store.ts:~114`):
```ts
/** Stamp every id as retrieved now (idempotent per id; last write wins). */
touch(ids: readonly string[], nowIso: string): void {
  if (ids.length === 0) return;
  const stmt = this.db.prepare(
    `INSERT INTO retrievals (id, t) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET t = excluded.t`,
  );
  for (const id of ids) stmt.run(id, nowIso);
}
```

**Edit 2 — `decay.ts`.** `decayWeight` is unchanged. Add the lens and widen `decayWeights`:

```ts
/**
 * The clock a lesson decays against: the last time it was SERVED, falling back to when
 * it was written (Oblivion — a lesson nobody re-queries fades even if freshly written;
 * one that is used stays sharp). A timeless item ("" — knowledge chunks, knowledge.ts:18)
 * stays timeless: decayWeight("") is 1 and must not start ticking on first retrieval.
 */
export function effectiveTimestamp(item: { t: string; lastRetrievedAt?: string }): string {
  if (item.t.length === 0) return "";
  return item.lastRetrievedAt ?? item.t;
}

export function decayWeights(
  items: readonly { id: string; t: string; lastRetrievedAt?: string }[],
  nowIso: string,
  halfLifeDays: number = HALF_LIFE_DAYS,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.id, decayWeight(effectiveTimestamp(it), nowIso, halfLifeDays));
  return m;
}
```
The `t.length === 0` guard is load-bearing (Key Insight 5): without it a knowledge chunk
would begin decaying from its first retrieval, which is backwards.

**Edit 3 — `cmd-query.ts`.** After the served hits are computed (the `topK`/`hits` block at
`:73-76`) and **before** `store.close()`:

```ts
// A retrieval is a use: stamp only what we actually served, so decay measures use,
// not neighbourhood. `recall reflect` deliberately does NOT touch (spec 006 P3 D5).
store.touch(hits.map((h) => h.id), nowIso);
```
`nowIso` is already in scope (`cmd-query.ts:56`, injectable via `opts.now`). No signature
change, no new flag.

**Edit 4 — `recall/README.md`.** Under invariant #2 (the rebuildable-cache claim), add:
> Exception (spec 006 P3): `recall query` writes a `retrievals` row per served id, so decay
> can measure time since last *use*. That history is the one thing in the DB that is not
> rebuildable — deleting the DB resets decay to write-time (the pre-006 behaviour). The
> ledger remains truth for everything else.

## Implementation Steps

1. P3a Edits 1–3 + tests. Run `npm test`; **expect existing graph snapshots to fail** on the
   four new keys — update them, and state in the PR body that `memory.graph.json`'s shape
   changed additively.
2. P3b Edits 1–4 + tests. Run `npx vitest run --config recall/vitest.config.ts`.
3. Gates: repo-root `npm run typecheck && npm run lint && npm run build && npm test`, plus
   the recall config run (it is a separate vitest project and is **not** covered by
   `npm test` — say so in the PR body).
4. Art III: on a real project with a non-trivial ledger, `ui memory compile --now <iso>` and
   paste the `insights` block (an entry with `seen > 1` if one exists) into the PR body.

## Todo List

- [ ] `insightKey` + `InsightEntry` fields + post-pass in `memory-graph.ts`
- [ ] `tests/memory-graph.test.ts` recurrence cases + byte-stability re-assert
- [ ] `retrievals` table + `touch()` + `getItems` LEFT JOIN + `RecallItem.lastRetrievedAt`
- [ ] `effectiveTimestamp` + widened `decayWeights`
- [ ] `cmd-query.ts` touch on served hits (and confirm `cmd-reflect.ts` is untouched)
- [ ] `recall/README.md` invariant #2 caveat
- [ ] Both suites + 4 gates

## Tests — file, name, assertion

### `tests/memory-graph.test.ts` (extend; pure `compileGraph`)

- `it("counts an insight stated twice as one cluster: seen 2, upvotes 1 on both entries")` →
  two `insight` events, same text → both entries `seen:2, upvotes:1, downvotes:0`; the array
  still has **2 entries** (ids preserved).
- `it("treats a differently-worded restatement as a separate insight (no fuzzy matching)")` →
  `seen:1` each. *Pins Decision 1 against a future 'improvement'.*
- `it("clusters across whitespace, case and a trailing period")` → `"A lesson."` /
  `"a  lesson"` → `seen:2`.
- `it("counts data.vote=down as a downvote and not an upvote")` → up, up, down →
  `seen:3, upvotes:1, downvotes:1`.
- `it("sets lastSeenAt to the newest t in the cluster, not the entry's own t")` → the older
  entry also reports the newer `lastSeenAt`.
- `it("keeps lastSeenAt correct across mixed UTC offsets")` → `2026-07-17T10:00:00Z` vs
  `2026-07-17T12:00:00+07:00` (= 05:00Z) → `lastSeenAt` is the `Z` one. *Pins the
  `Date.parse` comparison against the lexical bug.*
- `it("a single insight reports seen 1, upvotes 0, downvotes 0")` → the birth is not a recurrence.
- `it("compiling the same ledger twice with the same --now is byte-identical")` → re-assert
  the existing determinism guarantee with the new fields present.

### `recall/tests/decay.test.ts` (extend)

- `describe("effectiveTimestamp")`
  - `it("uses lastRetrievedAt when present")`
  - `it("falls back to the write timestamp when the item was never retrieved")`
  - `it("keeps a timeless knowledge chunk timeless even after a retrieval")` →
    `{t:"", lastRetrievedAt:"2026-07-17T00:00:00Z"}` → `""` → weight 1.
- `describe("decayWeights")`
  - `it("a stale-written but freshly-retrieved item outweighs a fresh-written unretrieved one")`
    → written 90d ago + retrieved today (≈1.0) vs written 20d ago, never retrieved (≈0.63).
    *This is the AC4 assertion.*
  - `it("an item never re-queried fades on its write clock exactly as before")` → the
    pre-006 number, unchanged.

### `recall/tests/store.test.ts` (extend; `:memory:` DB)

- `it("touch stamps a retrieval and getItems returns it as lastRetrievedAt")`
- `it("touch is idempotent per id: the last stamp wins")`
- `it("touch([]) is a no-op")`
- `it("a re-indexed item KEEPS its retrieval stamp (the DELETE+INSERT upsert cannot wipe it)")`
  → touch, then `upsert` the same id with new text, then `getItems` → `lastRetrievedAt`
  survives. *This is the whole reason the table is separate — Key Insight 3.*
- `it("getItems returns no lastRetrievedAt for an item that was never touched")`
- `it("opens an existing v1 DB and creates the retrievals table without a migration")` →
  open a DB, close, reopen → `touch` works.

### `recall/tests/integration.test.ts` (E2E-gated, `RECALL_E2E=1`)

- `it("recall query stamps only the ids it served")` → after a query with `k:1`, exactly one
  `retrievals` row exists.
- `it("recall reflect serves neighbours without stamping any retrieval")` → `retrievals`
  count unchanged. *Pins Decision 5.*

**Honesty note for the PR body**: the two wiring assertions above run only under
`RECALL_E2E=1` (the embedder is model-gated, `integration.test.ts:9-11`). The
non-gated proof is `store.touch` + `decayWeights` unit tests; the real proof is P5.

## Success Criteria

1. An insight that recurs reports `seen>1` / `upvotes≥1` on every member entry; ids and refs
   are preserved (no collapsing).
2. `data.vote:"down"` lands as a downvote; no `REQUIRED_DATA` / `validateEvent` change.
3. Same ledger + same `--now` → byte-identical `memory.graph.json` (Art I) **with** the new
   fields.
4. A stale-written, freshly-retrieved item outranks a fresher-written, never-retrieved one.
5. A knowledge chunk stays timeless after retrieval.
6. A re-indexed item keeps its retrieval stamp.
7. `recall reflect` writes nothing.
8. `rank.ts` diff is **empty**.
9. Both suites green + 4 gates + `ui knowledge check`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Existing graph-shape tests / committed `memory.graph.json` fixtures break on the 4 new keys | Expected and additive; update them in the same commit and name it in the PR body. Nothing outside `memory-graph.ts` reads `graph.insights` (grepped). |
| A column-vs-table mistake silently wipes retrieval stamps on re-index | The dedicated regression test ("a re-indexed item KEEPS its retrieval stamp") is mandatory, not optional. |
| `recall query` becomes a writer on a "read-only" path — a query against a read-only DB now throws | `touch` runs on an already-open writable handle (`store.open` creates the file). If a real read-only case appears, wrap `touch` in a try/catch — **do not** add a flag speculatively. Named in the README caveat. |
| Exact-match clustering under-counts real recurrence (the same lesson, reworded) | Honest limitation, documented in `insightKey`'s comment. Fuzzy matching is a model judgment (Art I) — P4's extraction prompt is where wording is normalised, and P5 measures whether it works. |
| Two vitest projects: `npm test` does not run `recall/` | Run both; state both in the PR body. |

## Security Considerations

No network, no model. One new local SQLite table holding ids + timestamps. No user content
beyond what the index already stores.

## Deviations from `plan.md` / `tasks.md` (report to the gate)

1. **`rank.ts` is not edited** — it consumes a decay map it never computes. The change lands
   in `decay.ts` + `store.ts` + `cmd-query.ts` (Key Insight 1).
2. **"retrieval events already exist to timestamp against" is false** — none exist. A
   `retrievals` table is added (Decision 4).
3. **The retrieval stamp is not rebuildable** although it lives in a store the README calls a
   rebuildable cache. Accepted with documented graceful degradation, not silently.
4. **No decayed `weight` field on insights** — tasks.md's four fields
   (`seen/upvotes/downvotes/lastSeenAt`) are exactly right; anything more has no reader.

## Next Steps

- **P4** reads `seen`/`upvotes` to know a candidate is recurring, and re-records recurring
  insights rather than suppressing them (Decision 3).
- **Spec 007** gates autonomy on this evidence.
