# Phase 05 — Heartbeat rhythm + the real-data GATE

> **Executor: Sonnet for the runners; the real-data gate is owner-in-the-loop.** This phase
> makes the loop *live* (no human trigger) and then proves it on two real projects. Art III:
> a green suite on a fixture validates the mechanism, not the contract.

## Context Links

- Spec `specs/006-living-loop/spec.md` §AC5, §AC6 · Plan `plan.md` P5
- Constitution Art III (real data before done), Art VI (git discipline / human merge), Art VIII
- Motivating audit: memory `living-loop-fuel-line-finding` — **this phase is what falsifies it**
- Read 2026-07-17: `design-os/src/design_os/heartbeat_core.py`,
  `commands/{heartbeat,heartbeat_runners,heartbeat_render}.py`, `recall/cli/src/cmd-reflect.ts`
- P1–P4 phase files

## Overview

- **Priority**: P5 — the definitive proof. **Depends**: P1–P4.
- **Status**: not started.
- **Description**: two heartbeat runners (`harvest`, `reflect`) on a due schedule, then the
  real-data run on **VSF-PCP** and **platform-design-system**: the ledger must go from
  ingest-only (one burst, 2 mechanical types) to **alive** — diverse event types, a populated
  graph, the first real graduations.

## Key Insights (each one is a trap in the existing code)

1. **`compare_summary` calls any number going UP "worsened"** (`heartbeat_core.py:106-137`),
   and `render_outcome` exits 1 on any worsened task (`heartbeat_render.py:45-54`) — that is
   the notify signal. A harvest that extracts *more* candidates would therefore be reported
   as a **regression**. → the harvest runner's `summary` must carry **only metrics where up =
   bad** (Decision 2).
2. **Runners must not raise** (`heartbeat_runners.py:4-8` contract; `heartbeat.py:179-182`
   catches `OSError` as a safety net only). Every failure is `{"status": "error"|"skipped", …}`.
3. **A new task type needs three edits, not one**: the function, the `TASK_RUNNERS` dict
   entry (`heartbeat_runners.py:160-169`), **and** `_KNOWN_TYPES` (`heartbeat.py:41`) — a
   type missing from `_KNOWN_TYPES` fails config validation with `BAD_CONFIG`, exit 2.
4. **`is_due` degrades to due** on missing/malformed state (`heartbeat_core.py:80-93`), and
   the first run is staggered once by `stagger_offset` (`heartbeat.py:82-88`). So a fresh
   `harvest` task fires on the first heartbeat after its stagger — no special-casing needed.
5. **P1's ledger resolution is cwd-based** for the lint family. `_run_audit_pages` imports
   `build_audit` directly and never changes cwd — so a heartbeat-triggered `ui audit` would
   record into design-os's cwd, not the project. → **binding constraint from phase-01**: any
   runner that shells out to `ui` for an outcome-bearing command MUST pass
   `cwd=str(project_dir)` (or `--dir` where the command declares it). Audit this for
   `_run_ds_a11y`, `_run_specimen`, `_run_audit_pages`, `_run_figma_audit` **before** adding
   new ones — they are now auto-record call sites whether we like it or not.
6. **`recall reflect` writes nothing** (`cmd-reflect.ts`): it returns a packet with a fixed
   `INSTRUCTION` and a printed write-back command (`:80-84`). Automating reflect = feeding
   that packet to a model and running the write-back — the same shape as harvest, so it
   reuses `harvest_model.extract` rather than inventing a second adapter (Art IV).
7. **`recall reflect` rejects `--home`** (`recall.ts:126`) and takes a `<job-events.json>`
   path, accepting `["e1"]` / `{"events":[…]}` / `[{"id":"e1"}]` (`cmd-reflect.ts:60`).

## Decisions (RESOLVED)

### Decision 1 — two task types: `harvest` and `reflect`

Config (`<dir>/design/heartbeat.json`) gains, e.g.:
```json
{"id": "harvest", "type": "harvest", "interval": "12h", "params": {"glob": ["plans/**/reports/*.md"]}},
{"id": "reflect", "type": "reflect", "interval": "24h", "params": {"minEvents": 5}}
```
`12h` for harvest: reports land on a phase rhythm (days), and the content-hash cursor makes
an early run free (`skipped/no-new-reports`). `24h` for reflect: it costs a model call per
run and reflects over accumulated events.

**Scope valve (state it in the PR):** if the diff for both runners exceeds the 200-line cap
on `heartbeat_runners.py` (currently 199 lines — it is *already at the cap*), **split**:
`harvest` runner + the real-data gate in this PR, `reflect` runner in a follow-up. Extract
the two runners into a new `heartbeat_runners_learning.py` and import them into the
`TASK_RUNNERS` dict — that keeps both modules under the cap and is the Art IX-honest move.
**Do not grow `heartbeat_runners.py` past 200 lines.**

### Decision 2 — the summary trap: only "up = bad" numbers

```python
{"status": "ok", "summary": {"failures": 0}, "detail": "harvest: 2 reports → 3 recorded, 4 dropped"}
```
`failures` = model errors + kernel write errors. Candidate/recorded/dropped counts go in
`detail` (a string — `compare_summary` never sees it) and in the JSON envelope of the
command itself. **Never** put `recorded` or `candidates` in `summary`: a good harvest would
page the owner as a regression (Key Insight 1).

### Decision 3 — runners call the Python core directly, not the CLI

`_run_harvest` imports `harvest_core`/`harvest_model` and passes `project_dir` explicitly —
the `_run_audit_pages` pattern (`heartbeat_runners.py:82-101`, direct `build_audit` import,
no subprocess). This sidesteps Key Insight 5's cwd trap entirely for harvest. The `ui memory
record` shell-outs inside harvest already pass `--dir` (P4 Decision 4).

### Decision 4 — every degradation is `skipped`, never `error`

| Condition | status / skipReason |
|---|---|
| no `design/` in the project | `skipped` / `no-project` |
| no new/changed reports | `skipped` / `no-new-reports` |
| `DESIGN_OS_MODEL_CMD` unset | `skipped` / `no-model-adapter` (packet → inbox) |
| `recall` binary absent | `skipped` / `recall-missing` |
| fewer than `minEvents` new events | `skipped` / `no-new-events` |
| model call failed / timed out | `error` + `failures: 1` (this one SHOULD notify) |

A studio without a model adapter configured must never see a red heartbeat — it just does
not learn automatically yet, and the inbox says so.

### Decision 5 — `reflect`'s job events come from the corpus export cursor

No new kernel seam. `<dir>/design/reflect-state.json` = `{"version":1,"lastEventId":"e41"}`.
Per run:
1. `run_ui(["memory","export-corpus","--since",last,"--json","--dir",p])` → `data` items →
   ids (`memory-corpus.ts` emits `{id, tier, text, refs, t}`; ids are the ledger's own).
2. fewer than `params.minEvents` (default 5) → `skipped/no-new-events`.
3. write the ids to a temp `job-events.json`, run `recall reflect <file> --project <p> --json`
   (resolve the bin via `resolve_bin("recall", "DESIGN_OS_RECALL_BIN")`; absent →
   `skipped/recall-missing`).
4. packet (`instruction` + `neighbors`) → `harvest_model.extract` → **one** lesson text.
5. gate it: `40 <= len <= 500`, and it must not be byte-identical to the most recent existing
   insight for that project (a cheap "did the model just echo a neighbour" guard). Then
   `ui memory record insight --dir p --actor "design-os reflect" --refs <jobEventIds> --data '{"text":…}'`.
6. advance `lastEventId` to the max id **only after** the record lands.

Only export-corpus **embeddable** events reach reflect (`memory-corpus.ts:93` returns null
for the rest) — so P1's `lint_run`/`autofix_applied`/`reconcile_applied`/`taste_vote` are
**invisible to reflect** in v1. That is honest and correct for now: reflect reflects on
prose. **Record this in the P5 report** — if the real-data run shows the lint stream carries
the lesson, opening `memory-corpus.shape()` to `lint_run` is a spec-007 decision, not a
silent patch here.

### Decision 6 — graduation-merge autonomy stays owner-merge (tasks.md open question)

Harvest auto-runs → gap events accumulate → `librarian collect` sees them → the librarian
loop opens a **PR** → **the owner merges**. Unchanged (`librarian-loop.md` step 7: "Human
gate — the invariant"). Spec 007's competence ladder is what may later gate this; 006 does
not touch it.

## Related Code Files

**Create**
- `design-os/src/design_os/commands/heartbeat_runners_learning.py` (~150) — `_run_harvest`,
  `_run_reflect` (Decision 1's scope valve)
- `design-os/src/design_os/reflect_core.py` (~90) — cursor + job-event selection + the
  one-lesson gate (pure)
- `design-os/tests/test_heartbeat_runner_harvest.py`, `design-os/tests/test_reflect_core.py`
- `specs/006-living-loop/reports/p5-real-data-gate.md` — **the evidence artifact**

**Modify**
- `design-os/src/design_os/commands/heartbeat_runners.py` — import + 2 `TASK_RUNNERS` entries
  **only** (do not grow it)
- `design-os/src/design_os/commands/heartbeat.py` — `_KNOWN_TYPES` += `{"harvest","reflect"}`
- `design-os/tests/test_command_heartbeat.py` — config-validation cases for the new types
- **Audit + fix**: the four existing runners' cwd handling (Key Insight 5)

**Never**: `heartbeat_core.py` (the scheduler is fine as-is), `librarian/*`,
`knowledge/librarian-loop.md`.

## Architecture

```python
def _run_harvest(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Harvest new end-of-phase reports into memory candidates (spec 006 P5).

    Summary carries ONLY `failures` — a number where UP means BAD. compare_summary
    (heartbeat_core.py:106) reports any rising number as "worsened" and exits 1, so a
    harvest that found MORE candidates would page the owner as a regression.
    """
    globs = params.get("glob") or list(DEFAULT_GLOBS)
    if not (project_dir / "design").is_dir():
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-project"}
    …
    return {"status": "ok", "summary": {"failures": 0},
            "detail": f"harvest: {n_reports} report(s) → {n_recorded} recorded, {n_dropped} dropped"}
```
`_run_reflect(project_dir, params)` mirrors it (`minEvents`, `skipReason` per Decision 4).

## Implementation Steps

### Part A — the runners (Sonnet)

1. Audit the four existing runners for the cwd trap (Key Insight 5); fix by passing
   `cwd=str(project_dir)` to their `subprocess.run` / by pointing the direct-import calls at
   `project_dir`. **This is a P1 consequence, not a nice-to-have** — a heartbeat recording
   into the wrong ledger poisons P5's own evidence.
2. `reflect_core.py` + tests (pure).
3. `heartbeat_runners_learning.py` with both runners.
4. Wire `TASK_RUNNERS` + `_KNOWN_TYPES`; confirm `heartbeat_runners.py` stays < 200 lines.
5. Tests (below). `uv run pytest -q` + four gates.

### Part B — the real-data GATE (owner-in-the-loop, Art III)

Run on **both** projects. Resolve their paths from `~/.ease-design/projects.json`
(`loadRegistry`) or ask the owner — **do not guess a path**.

1. **Baseline, per project** — record in the report, before anything:
   ```
   ui memory compile --now <iso> --dir <p> --json    # eventCount, insights, tokens, personas
   jq -r .type design/memory.events.jsonl | sort | uniq -c   # the type histogram
   design-os librarian collect --dir <p> --json      # open gaps
   ```
   Expected baseline (the audit's finding): one ingest burst, ~2 mechanical types, 0 gaps,
   0 insights, empty graph. **If the baseline does not match the audit, say so** — the
   motivating evidence would be stale and the gate's meaning changes.
2. **Fuel the line**: do a real slice of work with the fed binary — the lints/audit the
   project actually runs. Do not synthesise runs to pad the ledger; that is fixture data
   wearing a real project's clothes.
3. **Harvest**: `design-os harvest --dir <p> --json` (first `--dry-run`, inspect, then live).
4. **Compile + inspect**: type histogram again; `insights` with `seen > 1` if any.
5. **Graduate**: `design-os librarian collect --dir <p> --json` → run the librarian loop per
   `knowledge/librarian-loop.md` → it opens a PR → **the owner merges** (Decision 6).
6. **Write `specs/006-living-loop/reports/p5-real-data-gate.md`** with a before/after table
   per project:

   | Metric | VSF-PCP before | after | platform-DS before | after |
   |---|---|---|---|---|
   | ledger events | | | | |
   | distinct event types | | | | |
   | graph insights (seen>1) | | | | |
   | open gaps (`librarian collect`) | | | | |
   | librarian PRs opened / merged | | | | |
   | harvest: candidates → recorded → dropped (by reason) | | | | |

   Plus, verbatim: **one real lesson** that made it from a `plans/` report into the ledger,
   and **one that the gate dropped and should not have** (or "none" — but look for it).

## Todo List

- [ ] Audit + fix the four existing runners' cwd (P1 consequence)
- [ ] `reflect_core.py` + `test_reflect_core.py`
- [ ] `heartbeat_runners_learning.py` (`_run_harvest`, `_run_reflect`)
- [ ] `TASK_RUNNERS` + `_KNOWN_TYPES` wiring; `heartbeat_runners.py` still < 200
- [ ] `test_heartbeat_runner_harvest.py` + heartbeat config-validation cases
- [ ] pytest + four gates
- [ ] **Real-data gate on VSF-PCP** (baseline → work → harvest → compile → collect → PR)
- [ ] **Real-data gate on platform-design-system**
- [ ] `specs/006-living-loop/reports/p5-real-data-gate.md`
- [ ] Owner merges the graduation PR(s)

## Tests — file, name, assertion

### `design-os/tests/test_heartbeat_runner_harvest.py`

- `test_harvest_runner_summary_carries_only_failures` → `set(res["summary"]) == {"failures"}`.
  *Pins Key Insight 1: the anti-regression trap.*
- `test_a_bigger_harvest_is_not_reported_as_worsened` → feed `compare_summary` a previous
  run's summary and this one's after a **larger** harvest → `"ok"`, **not** `"worsened"`.
  *This is the assertion that would have caught the trap.*
- `test_a_model_failure_reports_error_and_one_failure` → `status == "error"`,
  `summary["failures"] == 1`, and the runner **did not raise**.
- `test_no_model_adapter_skips_with_no_model_adapter`
- `test_no_new_reports_skips_with_no_new_reports`
- `test_missing_design_dir_skips_with_no_project`
- `test_runner_never_raises_when_the_project_dir_does_not_exist`
- `test_harvest_runner_passes_the_project_dir_and_never_relies_on_cwd` → run with
  `os.chdir(tmp_other)`; assert the events land in `project_dir/design`. *Pins Key Insight 5.*

### `design-os/tests/test_reflect_core.py`

- `test_job_events_are_the_ids_since_the_cursor`
- `test_fewer_than_min_events_yields_no_job`
- `test_cursor_advances_only_after_the_insight_is_recorded`
- `test_a_lesson_identical_to_the_latest_existing_insight_is_dropped`
- `test_a_lesson_shorter_than_40_chars_is_dropped`

### `design-os/tests/test_command_heartbeat.py` (extend)

- `test_harvest_is_a_known_task_type` → a config with `type: "harvest"` validates (no `BAD_CONFIG`)
- `test_reflect_is_a_known_task_type`
- `test_an_unknown_learning_type_still_fails_bad_config` (the guard still guards)
- `test_harvest_task_runs_on_the_heartbeat_with_no_human_trigger` → `monkeypatch.setitem(
  TASK_RUNNERS, "harvest", stub)`, freeze `_now`, assert the stub ran and state recorded a
  `nextRunAt`. *This is spec AC5 in one assertion.*

## Success Criteria

1. `design-os heartbeat` runs harvest + reflect on their due schedule with **no human
   trigger** (spec AC5), and a project without a model adapter stays green.
2. A larger harvest never renders as "worsened" / exit 1.
3. No runner raises; every degradation is a documented `skipReason`.
4. Every runner writes into the **project's** ledger regardless of cwd.
5. **Art III / spec AC6** — on VSF-PCP and platform-design-system:
   - the type histogram goes from ~2 mechanical types to **diverse** (lint/autofix/token/
     reconcile/harvested/insight/gap present),
   - `memory.graph.json` is **populated** (insights present; ≥1 with `seen > 1` if the corpus
     supports it — if not, say so plainly rather than claiming recurrence),
   - **≥1 librarian PR opened from a real harvested gap**, owner-merged.
6. `p5-real-data-gate.md` committed with the before/after table and the verbatim lesson.
7. `heartbeat_runners.py` < 200; new modules < 200. Four gates + `uv run pytest -q` green.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| **The summary trap pages the owner every time harvest works** | Decision 2 + two dedicated tests, one of which drives `compare_summary` directly. |
| The real-data run shows the ledger stays thin (the loop does not actually fill) | **That is a finding, not a failure — report it.** Art VIII: a phase that proves the mechanism does not fuel the loop is worth more than a green fixture. Likely culprits to check first: the P1 cwd trap, `design/` missing in the target project, reports living outside the default glob. |
| Harvest extracts a plausible-but-wrong lesson into a real project's ledger | The verbatim-evidence gate (P4) + the librarian's fresh-judge veto + owner merge. A bad *insight* event is recoverable (the ledger is append-only; a later `vote:"down"` insight down-weights it — P3 Decision 2). Nothing reaches `knowledge/` without a human. |
| Reflect echoes a neighbour back as a "new lesson" | The identical-to-latest guard (Decision 5.5); it is cheap and catches the obvious case. Real duplicates surface in the P5 report. |
| The four existing runners were already recording into the wrong ledger after P1 | Part A step 1 audits them first — before any P5 evidence is collected, or the evidence is worthless. |
| Reflect never sees the auto-recorded outcome stream (corpus filters them out) | Documented in Decision 5, not silently accepted; the P5 report states whether it mattered. |
| The two real projects are not on this machine | Resolve paths from the registry or ask the owner. **Do not fabricate a run.** If a project is unreachable, the gate is incomplete — say so and stop. |

## Security Considerations

Harvest's model call now runs **unattended** on the heartbeat: report prose leaves the
machine on every rhythm if `DESIGN_OS_MODEL_CMD` points at a hosted model. That is the
operator's explicit configuration (unset = no call), and it must be stated in the heartbeat
task's `--help`/README line, not buried. No credentials pass through design-os; the model
never gets write access (Python does every write); the librarian's human merge remains the
only path into `knowledge/`.

## Deviations from `plan.md` / `tasks.md` (report to the gate)

1. **The runners live in a new `heartbeat_runners_learning.py`**, not in
   `heartbeat_runners.py` — that file is already at 199/200 lines (Art IX; Decision 1).
2. **`recall reflect`'s automation needed a job-event source that did not exist** — it is
   built from the `memory export-corpus --since` cursor (Decision 5), not from a recall
   feature. The consequence (auto-recorded outcome types are invisible to reflect) is
   documented, not hidden.
3. **A P1 consequence lands here**: the four *existing* heartbeat runners became auto-record
   call sites and must be audited for cwd (Key Insight 5). plan.md did not foresee this.

## Next Steps

- With the ledger alive, **spec 007 (competence ladder)** reads it — that was the whole point
  of building the fuel line first (spec §Locked decisions).
- If P5's report shows a real lesson stuck in a stream reflect cannot see, that is 007's
  input, not a silent patch here.
- Update memory `living-loop-fuel-line-finding` with the after-state: the audit that
  motivated 006 should end with its own answer.
