# Report — Spec 012 P2: wire the fuel line at DS-store creation

Branch `feat/wire-fuel-line` off `main` (4afe861).

## What was built

**`src/core/ds-fuel-line.ts`** (new, 75 lines) — `wireFuelLine(designDir)`, the single
shared helper (Art IV) both `ds init` and `ds import` call. Writes, each only if absent:
1. soul scaffold — delegates to existing `writeSoulScaffold` (ds-soul.ts), unchanged.
2. `heartbeat.json` — `{version:1, tasks:[ds-a11y 1d, specimen 1d, harvest 12h,
   reflect 24h {minEvents:5}]}` — VSF-PCP's shape minus `figma-audit` (needs a
   configured Figma file a fresh store doesn't have).
3. `harvest-inbox/` — empty dir.

**`src/commands/ds-init-impl.ts`** — replaced the direct `writeSoulScaffold` call with
`wireFuelLine(paths.dir)`; `data.soul`/`data.heartbeat` + a `heartbeat:` output line
added. File was already 275 lines (pre-existing Art IX debt); net +3 lines (278) since
the heartbeat/inbox logic now lives entirely in the helper, not inline.

**`src/commands/ds-import-impl.ts`** — added `wireFuelLine(designDir)` after the store
is written+sealed. Closes the dana-no-soul gap (dana was onboarded via `ds import`,
which never scaffolded a soul). 134 → 144 lines.

**`design-os/src/design_os/evolution_core.py`** — added the **WIRED** verdict.

## The WIRED-vs-DEAD-LOOP rule (settled, not escalated — the plan's own text resolved it)

```
learning_signal = insight_events>0 OR gap_events>0 OR soul.ratified
if learning_signal:            → ALIVE
elif heartbeat.wired:
    if heartbeat.fired:        → DEAD-LOOP   (ran, still learned nothing)
    else:                      → WIRED       (configured, hasn't run yet)
else:
    if ledger.exists:          → DEAD-LOOP   (ran some other way, no loop, no learning)
    else:                      → NO-LOOP     (never ran, never configured)
```

One deliberate change from P1: `heartbeat.fired` alone no longer counts as a learning
signal for ALIVE (P1's original rule did). The plan's own resolution for the ambiguous
"heartbeat wired + events-but-no-learning" case forces this — "unless it has FIRED and
still produced no learning (then DEAD)" only makes sense if firing-without-learning is
reachable, which requires removing `fired` from the ALIVE trigger. No shipped test
exercised `heartbeat.fired` as a lone ALIVE trigger, so nothing broke. Pinned by 4 new
tests in `test_evolution_core.py` (fresh-wired-no-ledger, wired-with-mechanical-events,
the fired-but-no-learning boundary → DEAD-LOOP, and the true-empty NO-LOOP sanity case)
plus a CLI-level test in `test_command_evolution.py`.

Also fixed `commands/evolution.py`'s `_render_text`: it used to return early when there
was no ledger, which hid the heartbeat/soul detail that explains a WIRED verdict
(Art VIII — the report must always name every dimension). Now it always prints every
signal; only the ledger detail block is conditional on the ledger existing.

## Gate suites

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (dist/cli.js 843.78 KB).
- `npm test` — 141 files, 2147 passed, 4 skipped (pre-existing skips, unrelated).
- `uv run pytest -q` (design-os/) — 255 passed, including the pre-existing live
  dana-desktop (DEAD-LOOP, unchanged) and VSF-PCP (ALIVE, unchanged) paired tests.
- `ui knowledge check` — 0 findings.

## LIVE loop (Art III) — import a scratch copy of dana's tokens, never touching the real project

Dana's `design/design.tokens.json` is already DTCG-shaped (dana went through `ds import`
once already), so to replay the *original* import road faithfully I flattened it back to
`{category:{name:value}}` and imported that flat file into a fresh scratch dir (never
writing into `/Users/jang/Products/dana-desktop`):

```
$ node dist/cli.js ds import <flattened-dana-tokens.json> --dir <scratch>/dana-copy --name dana-copy
ds import: 286 token(s) [236 color, 7 number, 39 dimension, 4 fontWeight] across 7 categories → .../dana-copy/design
  97 roles recognized, 2 gaps: popover, input
  soul: .../dana-copy/design/soul.md (draft — edit then set status: ratified)
  heartbeat: .../dana-copy/design/heartbeat.json
  next: ui ds a11y --dir .../dana-copy  ·  ui ds status --dir .../dana-copy

$ ls .../dana-copy/design
component-registry.json  design.tokens.json  ds.manifest.json  harvest-inbox  heartbeat.json  soul.md

$ uv run design-os evolution --dir <scratch>/dana-copy
evolution: WIRED
  ledger: no memory.events.jsonl — the loop has never run

$ uv run design-os evolution --dir /Users/jang/Products/dana-desktop   # untouched, for contrast
evolution: DEAD-LOOP
  ledger diversity: 1 distinct type(s) over 276 event(s) — token_change=276
  learning events: no insights, no gaps
  graph insights: no memory.graph.json
  soul: no soul.md
  heartbeat: not wired (no design/heartbeat.json with tasks)
  ...
```

The scratch copy — same tokens, same road (`ds import`), post-fix — reads **WIRED**.
The real un-wired dana-desktop, untouched, still reads **DEAD-LOOP**. `git status` in
`dana-desktop` confirms nothing was written there.

## Files touched
- `src/core/ds-fuel-line.ts` (new)
- `src/commands/ds-init-impl.ts`
- `src/commands/ds-import-impl.ts`
- `tests/ds-fuel-line.test.ts` (new)
- `tests/cmd-ds-init.test.ts`
- `tests/cmd-ds-import.test.ts`
- `design-os/src/design_os/evolution_core.py`
- `design-os/src/design_os/commands/evolution.py`
- `design-os/tests/test_evolution_core.py`
- `design-os/tests/test_command_evolution.py`

## Unresolved questions
None — the one ambiguity flagged in the task (WIRED-vs-DEAD boundary) was resolved by
the plan's own text and pinned with tests above.
