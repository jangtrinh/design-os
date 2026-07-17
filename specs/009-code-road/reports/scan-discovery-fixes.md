# scan-discovery-fixes — three measured fixes (fix/scan-discovery)

Branch: `fix/scan-discovery` off `main` (worktree `agent-a68911a5f16a9b8fb`, base commit `26e2f99`).

## Status: DONE

## Four gates

```
npm run typecheck   → tsc --noEmit — clean
npm run lint        → eslint src tests — clean
npm run build       → tsup, ESM dist/cli.js 817.49 KB, success
npm test             → vitest run: 136 test files passed (136), 2064 tests passed | 4 skipped (2068)
ui knowledge check   → 0 findings
```
All green, re-verified after a stash/pop round-trip (used to capture the "before" numbers below) and one more full build+test+knowledge pass after restore.

## Fix 1 — `COMPONENT_DIR_NAMES` ancestor rule

`src/core/project-scan.ts`: the BFS walk (`walk()`) now carries two inherited
flags per queue item — `hasComponentsAncestor` and `inTestTree` (new
`WalkItem` interface). A dir qualifies (`>=3` direct `CODE_EXT` files) if
`COMPONENT_DIR_NAMES.has(base) || hasComponentsAncestor`, and only outside a
test tree (`TEST_DIR_NAMES = __tests__, __mocks__, test, tests, spec,
stories`). `COMPONENT_DIR_NAMES` itself is untouched (`components`, `ui`,
`widgets`) — the ancestor clause is additive, so `ui`/`widgets` still qualify
standalone (no `components` ancestor required — tested explicitly), and a
literal `components` dir still qualifies by name as before. `SKIP_DIRS`,
`slice(0,5)`, `MAX_DEPTH`/`MAX_ENTRIES` values, verdict logic untouched.

7 new tests added to `tests/cmd-scan.test.ts`: ancestor-qualifies-with-unlisted-name,
two-levels-under-ancestor, no-ancestor-does-not-qualify, `__tests__` never
qualifies, a `components` dir nested inside `__mocks__` still excluded,
standalone `widgets` still qualifies by name alone.

**widgets: still 0/9 on this corpus** (confirmed by running the four target
scans below — no `widgets`-named dir appears in any of them). Recommend
keeping it — it's a published contract from before this fix, not something
this fix added, and it costs nothing to keep. Not removed.

## Fix 2 — `truncated` = entry cap only

`src/core/project-scan.ts` `walk()`: the depth-cap branch (`if (depth >
MAX_DEPTH)`) now does `continue` only — it no longer sets `acc.truncated =
true`. Only the two entry-cap check sites still set it. Header comment
(`:1-22`) and the `ScanResult.truncated`/`componentDirs` field docstrings
rewritten to state the new (and only intended) semantics. `MAX_DEPTH`/
`MAX_ENTRIES` values unchanged.

Updated `tests/cmd-scan.test.ts`'s
`test_a_tree_over_max_depth_reports_truncated` → renamed
`test_a_tree_over_max_depth_alone_does_NOT_report_truncated`, now asserts
`truncated === false` for an 8-level-deep, low-entry-count tree (previously
asserted `true` — that assertion was the bug, per the hard-won-rules "a test
can enshrine the bug" lesson). Also asserts the buried file past depth 6 is
still not counted — the depth cap still functions, it just isn't conflated
with `truncated` anymore. Did not propose a second field for depth-truncation
— per the task's instruction, flagging it here instead: **if a caller wants to
know "was some branch skipped due to depth" as distinct machine-readable
state, that's a new field, a separate decision — not added.**

## Fix 3 — `ui ds status` warns on `imported-ds`

`src/commands/ds-status-impl.ts`: added `IMPORTED_DS_DEFAULT_NAME =
"imported-ds"` (must track `ds-import-impl.ts`'s literal default — noted in a
comment) and `importedDsWarning(name)` → `null` or a message pointing at the
reseal command. Added to both output paths:
- JSON: new `warning: string | null` field in the `ds status --json` data
  payload (additive, does not change exit code or any existing field).
- Text: a `warning: ...` line prepended to stdout when present; no line when
  absent (verified — "does not warn" test asserts `stdout` excludes
  `"warning:"`).

This is a **warning, not an error** — exit code unaffected either way; an
existing `imported-ds` store keeps working exactly as before. 2 new tests in
`tests/cmd-ds-status.test.ts`: one imports a real tokens.json with no
`--name` (reproducing the actual default path) and asserts the warning fires
in both JSON and text mode; one asserts a real-named store shows no warning
in either mode.

## Live verification (Art III) — read-only, verbatim

### 1. `ui scan --cwd /Users/jang/Products/spaflow --json`
```json
"componentDirs": [
  { "path": "src/components/admin", "files": 3 },
  { "path": "src/components/dashboard", "files": 64 },
  { "path": "src/components/landing", "files": 3 }
],
"truncated": false,
"visited": 303
```
`dashboard` (64 files) now surfaces. `truncated` is `false`.

### 2. `ui scan --cwd /Users/jang/Products/sodeal --json`
```json
"componentDirs": [
  { "path": "components/ai", "files": 15 },
  { "path": "components/dashboard", "files": 6 },
  { "path": "components/deal", "files": 3 },
  { "path": "components/icons", "files": 30 },
  { "path": "components/landing", "files": 16 },
  { "path": "components/layout", "files": 8 },
  { "path": "components/ui", "files": 7 }
],
"truncated": false,
"visited": 376
```
7 dirs / 85 files total — far more than the pre-fix 1 dir / 7 files.

### 3. `ui scan --cwd /Users/jang/Products/EaseUI --json`
```json
"componentDirs": [ 13 dirs, incl. "app/src/components/editor":39, "app/src/components/icons":40, "app/src/components/settings":9, "app/src/components/tutorial":5, "app/src/components/ui":12, "frontpage/app/src/components/icons":39, ... ],
"truncated": true,
"visited": 4000
```
`truncated` stays `true` — 4000 entries visited (the entry cap), genuinely
over. (Spec said 4220 total files on this project; the walk itself caps
visits at 4000 by design, so `visited` reads 4000 exactly, as expected when
entry-capped.)

### 4. `ui scan --cwd /Users/jang/Products/traicaybentre --json`
```json
"componentDirs": [
  { "path": "src/components", "files": 27 },
  { "path": "src/components/product", "files": 5 },
  { "path": "src/components/seo", "files": 4 }
],
"truncated": false,
"visited": 2971
```
`truncated` flipped to `false` (2971 entries visited, under the 4000 cap) —
**before this fix it was `true`** (confirmed by re-running against the
unpatched code via `git stash`/`stash pop`), driven purely by the depth cap.
Note: the spec stated 3054 entries; measured here is 2971 — a minor discrepancy,
reported as found, not tuned to match.

### 5. `ui ds status --dir /Users/jang/Products/VSF-PCP` (read-only, no writes)
```json
"name": "imported-ds",
"generation": 1,
"intent": "imported from /private/tmp/claude-501/-Users-jang-Products-VSF-PCP/902d9681-c59a-4f63-98d7-80b73b5d560b/scratchpad/flat-tokens.json",
"warning": "manifest name is the 'ui ds import' default 'imported-ds' — agent identity (ui agents init) derives from this name. Reseal with an explicit --name: ui ds import <tokens.json> --dir <project> --name <slug> --force"
```
Confirms the live claim verbatim: `name: "imported-ds"`, `generation: 1`, and
a dead absolute scratchpad path baked into `intent`. The warning now fires.
Text mode (`ui ds status --dir ...`, no `--json`) prepends `warning: ...` as
its own line before the existing summary — also verified, not shown twice
here for brevity.

## Before/after component-file counts (captured via `git stash`/`stash pop` — same tree, unpatched code)

| project | before | after |
|---|---|---|
| spaflow | `componentDirs: []` (0 dirs, 0 files); `truncated: true` (depth-cap false positive) | 3 dirs, 70 files (`admin` 3 + `dashboard` 64 + `landing` 3); `truncated: false` |
| sodeal | 1 dir, 7 files (`components/ui`) | 7 dirs, 85 files |
| EaseUI | 1 dir, 12 files (`app/src/components/ui`) | 13 dirs, 174 files; `truncated: true` (unchanged — genuinely over entry cap both before and after) |
| traicaybentre | 1 dir, 27 files (`src/components`); `truncated: true` (depth-cap false positive) | 3 dirs, 36 files (`src/components` 27 + `product` 5 + `seo` 4); `truncated: false` |

Note spaflow's *before* row is itself a live instance of the Fix 2 bug: the
tree is 303 entries (nowhere near the 4000 cap) but reported `truncated:
true` purely because of depth — exactly the misdiagnosis pattern described
in the task.

## `widgets` — keep or drop?

0/9 on the real corpus, confirmed again by these four live scans (no
`widgets`-named dir surfaced anywhere). Recommend **keep** — per the task's
own instruction ("removing it is a separate decision"), and because as an
existing published contract its cost is zero (one entry in a `Set`) while a
removal would be a silent behavior change for any project not in this
corpus that does use that convention.

## Where the given numbers didn't match measurement

- **traicaybentre entries**: spec said 3054; measured 2971 both times (before
  and after the fix — the file count itself didn't change, only which caps
  fire). Reporting as found, not adjusted to match.
- **EaseUI total files**: spec said 4220; `visited` reads exactly 4000
  because that IS the entry cap — the scan cannot see past it by
  construction, so this isn't a discrepancy, just what `visited` means when
  capped.
- Everything else (spaflow's per-dir counts, sodeal's before-state, VSF-PCP's
  manifest fields) matched the spec's stated numbers exactly.

## Unresolved / worth a second look

- `src/core/project-scan.ts` is now 278 lines (was 233 before this task,
  itself already over the constitution's Art IX ~200-line guidance). The task
  scoped this as a narrow 3-fix patch and explicitly fenced off touching
  `SKIP_DIRS`/`MAX_DEPTH`/`MAX_ENTRIES`/verdict/`slice(0,5)` — splitting the
  walk into its own module felt like scope creep for a "measured fix"
  commit and risks the Art I byte-identity guarantee if done carelessly.
  Flagging rather than doing it unasked; can split `walk()`/`WalkItem`/the
  ancestor logic into a `project-scan-walk.ts` helper in a follow-up if
  wanted.
- Fix 2's "propose, don't add" instruction: no second field added for
  depth-truncation. If a caller needs to distinguish "entry-capped" from
  "depth-capped-somewhere", that's a new `ScanResult` field (e.g.
  `depthCapped: boolean`) — a design decision for the constitution owner, not
  bundled into this fix.
