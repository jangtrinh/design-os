# Phase 04 — `design-os harvest` (host layer, the only model-driven piece)

> **Executor: Sonnet.** This phase writes the **first host-model invocation in the repo** —
> there is no precedent to copy. Read §Key Insights before writing a line. The kernel stays
> untouched: harvest calls `ui memory record` and nothing else.

## Context Links

- Spec `specs/006-living-loop/spec.md` §2, AC3 · Plan `plan.md` P4
- Constitution Art I (model at the host, kernel deterministic), Art VIII (honesty floors),
  Art IX (<200 lines)
- Read 2026-07-17: `design-os/src/design_os/{cli,kernel,envelope}.py`,
  `commands/{doctor,heartbeat*}.py`, `commands/librarian/{__init__,collect,core}.py`,
  `knowledge/librarian-loop.md`, `recall/cli/src/cmd-reflect.ts`
- P1 (event types), P3 (recurrence)

## Overview

- **Priority**: P4 — turns the prose graveyard into structured candidates.
- **Status**: not started. **Depends**: P1, P3.
- **Description**: read end-of-phase reports whose outcome is known → a **fresh** host-model
  instance extracts structured candidates → a **deterministic** selection gate drops the
  noise and the hallucinations → survivors land as `harvested` / `insight` / `gap` events via
  the kernel. Gaps then flow through the **existing, unchanged** librarian veto-chain.

## Key Insights (three of them overturn plan.md — read first)

1. **`librarian record` / `librarian run` DO NOT EXIST.** The librarian has exactly one
   leaf: `design-os librarian collect` (`librarian/__init__.py:15-24`). Gaps are written by
   the **TS kernel** (`ui memory record gap`), and `collect` merely *reads*
   `<project>/design/memory.events.jsonl` (`librarian/core.py:78-79`), treating a gap as open
   until some `insight` event's `refs` cite it (`core.py:105-122`). → **"queue gaps for the
   librarian" means: record `gap` events. There is no queue to write to and no gate to
   change.** That is the whole integration.
2. **No host-model invocation exists anywhere in this repo.** `design-os`'s only runtime
   dependency is `typer==0.26.8`; every `subprocess.run` targets a deterministic tool (`ui`,
   `figma-agent`, `pixelshot`, `git`, `npm`, `node`). The repo's standing pattern is
   **procedure-as-markdown**: Python emits a JSON envelope and a *host CLI procedure*
   (`knowledge/librarian-loop.md`) does the thinking. `librarian/collect.py:5-7` says it
   outright: *"It calls NO model and makes NO judgement."*
3. **But procedure-as-markdown cannot satisfy this spec.** The locked decision is *"Harvest
   runs **AUTOMATICALLY** on the heartbeat rhythm, with a fresh model instance"*. A packet
   printed for a human to notice is exactly the manual, opt-in step that spec 006 exists to
   kill (spec §Why: "recording is manual; the engine has no fuel line"). So harvest must
   really invoke a model — see Decision 2 for how, and how the doctrine survives.
4. **An `insight` event REQUIRES `refs`** (`memory-events.ts:117-122`, `BAD_EVENT` otherwise).
   A lesson extracted from prose has no source *event* to cite. The `harvested` type exists
   for exactly this and requires `["source"]` (`memory-events.ts:44`) — so harvest records
   the `harvested` event **first** and refs the insight to it (Decision 4). This is not a
   workaround; it is what `harvested` is for, and `memory-corpus.ts:72-77` already embeds it.
5. **The gap `kind` vocabulary already exists** — `rubric-gap | persona-gap | recipe-gap |
   benchmark-stale | guardrail-lesson`, "optional and unenforced" (`memory-events.ts:50-51`).
   A "taste observation" is a `rubric-gap`; no third candidate kind is needed (Decision 5).
6. **A heartbeat runner's `summary` must be numeric-only**, and `compare_summary`
   (`heartbeat_core.py:106-137`) reports **"worsened" when any number goes UP**. A harvest
   that finds *more* candidates is doing better, not worse — so its summary must only carry
   metrics where up = bad. Binding on P5; stated here because harvest's return shape is
   designed here.

## Decisions (RESOLVED)

### Decision 1 — what harvest reads

`plans/**/reports/*.md` by default, **not** `plans/*.md`. Rationale: the spec says "reports
**with the outcome known**"; `plan.md` / `phase-XX.md` are forward-looking intent (todo
lists), while `reports/` is the repo's convention for what an executor/auditor found *after*
the fact (`.claude/rules/documentation-management.md`). Deterministic — no heuristic guess at
"is this phase done".

Configurable: `--glob` (repeatable, default `plans/**/reports/*.md`), so P5 can point at a
real campaign's actual layout without a code change. Globs resolve **relative to `--dir`**
and any match outside it is dropped (path traversal guard).

### Decision 2 — the model adapter (the new precedent)

Harvest is **deterministic core + one pluggable model call**:

- **Core (pure, ~180 lines, fully unit-tested, no model)**: report discovery, the cursor,
  packet assembly, candidate validation, the selection gate, kernel writes.
- **The extraction step only** shells out to a host-model command configured by
  **`DESIGN_OS_MODEL_CMD`** (parsed with `shlex.split`), sending the packet on **stdin** and
  reading candidate JSON from stdout. No SDK, no API key handling, no new dependency — the
  same `subprocess.run` seam `kernel.py` already uses for `ui`.
- **Fresh instance = a new process per harvest**, fed nothing but the versioned prompt + the
  reports. No session reuse, no conversation history, no repo context. That is structurally
  fresher than any in-session "please be objective" instruction, and it is what the locked
  decision asks for. Documented suggested value (README + `--help`, never hardcoded):
  `DESIGN_OS_MODEL_CMD="claude -p --model claude-opus-4-8"`.
- **Unset or unresolvable → `status: skipped`, `skipReason: "no-model-adapter"`, exit 0**,
  and the packet is written to `<dir>/design/harvest-inbox/<slug>.md` so the
  procedure-as-markdown path still works by hand. **Both doctrines survive**: automatic when
  configured, honest and non-fatal when not.

**This is a new precedent and it needs the gate's explicit blessing.** It is the first place
where a `design-os` command can invoke a model. It stays inside Art I (the *kernel* is what
must be deterministic; `design-os` is the host layer where the model belongs) — but it is
new, so name it in the PR body as a decision, not as a detail.

### Decision 3 — the selection gate is DETERMINISTIC and adversarial

The model proposes; **Python disposes**. The gate never asks the model whether it did well.
A candidate is dropped unless **all** hold (`harvest_core.py`, constants at module top):

| Rule | Constant / test |
|---|---|
| `evidence` is a verbatim substring of the source report, after whitespace normalisation | **the anti-hallucination gate** — a lesson that cannot quote its own source is invented |
| `source` is one of the reports actually harvested this run | no citing a file we never read |
| `durable is true` **and** `actionable is true` (model self-labels; the gate enforces) | Selective Hindsight |
| `confidence >= 0.6` | `MIN_CONFIDENCE = 0.6` |
| `40 <= len(text) <= 500` | `MIN_TEXT`/`MAX_TEXT` — drops junk and essays |
| `kind == "gap"` → `target` matches `^[a-z0-9][a-z0-9-]*\.md(#[a-z0-9-]+)?$` and `data.kind` ∈ the documented vocabulary | matches what `librarian collect` groups by (`core.py:139-164`) |
| not a duplicate of another candidate **in this batch** (normalised text) | across batches, recurrence is the signal (P3 Decision 3) — **do not** dedupe against the ledger |
| at most `MAX_PER_REPORT = 3` survivors per report, highest confidence first, ties by text | Selective Hindsight: few and high-value |

**No silent caps (Art VIII):** every drop is counted by reason and reported in
`data.dropped = {reason: count}` plus, in text mode, one line per dropped candidate. A
harvest that discards 9 of 10 says so.

### Decision 4 — provenance chain: `harvested` → `insight` / `gap`

Per report, in this order (stop the report's chain on any failure; never partial-write a
child without its parent):

1. `ui memory record harvested --dir <p> --actor "design-os harvest" --data
   '{"source":"<report relpath>","what":"<n> candidates","promptVersion":"harvest-extract-v1","sha256":"<hash>"}'`
   → envelope `data.id` = `eH`.
2. each surviving insight → `ui memory record insight --dir <p> --actor "design-os harvest"
   --refs <eH> --data '{"text":"…","evidence":"…"}'`
3. each surviving gap → `ui memory record gap --dir <p> --actor "design-os harvest"
   --refs <eH> --data '{"text":"…","target":"…","kind":"…","evidence":"…"}'`
   (`gap` needs no refs; we pass them anyway — provenance is free and `collect` ignores them.)

`--actor "design-os harvest"` makes model-extracted knowledge **queryable and separable**
from human-recorded knowledge forever. That matters for 007 and it costs one flag.

**Cursor is advanced only after a report's chain completes** — a crash re-harvests that
report rather than losing it.

### Decision 5 — candidate kinds are `insight` and `gap` only

A "taste observation" is a `gap` with `data.kind = "rubric-gap"` and a `taste-rubric.md`
target (Key Insight 5). Two kinds, both already recorded by the kernel, zero new event types
in P4.

### Decision 6 — the cursor is a content hash, not a timestamp

`<dir>/design/harvest-state.json`:
```json
{"version": 1, "promptVersion": "harvest-extract-v1",
 "harvested": {"plans/x/reports/r.md": {"sha256": "…", "at": "2026-07-17T…Z", "recorded": 3}}}
```
Keys sorted, 2-space indent, trailing newline (byte-stable). A report whose sha256 is
unchanged is skipped; an **edited** report re-harvests (reports get appended to as a campaign
runs — a timestamp cursor would miss that, and mtime lies after a clone). `--since <path>`
is **not** a phase name: it is not implemented in v1 — `--force` re-harvests everything and
`--dir` scopes the run. *(Resolves tasks.md's `--since <phase>`: dropped, because "phase" is
not a concept the file tree exposes; the sha cursor covers the real need.)*

### Decision 7 — cadence: per-phase, per report, via the cursor

tasks.md's open question. Because the cursor is per-report and content-hashed, cadence stops
mattering: harvest can run every heartbeat and does nothing (`skipped`,
`skipReason: "no-new-reports"`) until a report lands or changes. Cost is bounded by
`MAX_REPORTS_PER_RUN = 5` (oldest first, remainder reported in `data.deferred`, never
silently dropped) so one run cannot fan out over a whole campaign's backlog.

## Related Code Files

**Create**
- `design-os/src/design_os/commands/harvest.py` (~130) — Typer leaf + envelope + orchestration
- `design-os/src/design_os/harvest_core.py` (~185) — pure: discovery, cursor, packet, gate
- `design-os/src/design_os/harvest_model.py` (~85) — the adapter subprocess + JSON parse
- `design-os/src/design_os/prompts/harvest-extract-v1.md` — the versioned extraction prompt
- `design-os/tests/test_harvest_core.py`, `design-os/tests/test_command_harvest.py`
- `design-os/tests/fixtures/harvest/campaign-report.md` — the seeded real-shaped report

**Modify**
- `design-os/src/design_os/cli.py` — ONE line: `app.command(name="harvest")(harvest_cmd.harvest)`
  (Art VI collision point — stage this hunk explicitly)
- `design-os/pyproject.toml` — package the `prompts/` dir as package data if the build
  excludes non-`.py` files (verify; do not change the build system otherwise)
- `design-os/tests/goldens/root-help.txt` — `test_tree_contract.py` pins root `--help`

**Never**: `knowledge/librarian-loop.md`, `librarian/*` (the gate is unchanged — spec
non-goal), any `src/` kernel file.

## Architecture

### `harvest_core.py` (pure — no subprocess, no model, no clock beyond an injected `now`)

```python
PROMPT_VERSION = "harvest-extract-v1"
MIN_CONFIDENCE = 0.6
MIN_TEXT, MAX_TEXT = 40, 500
MAX_PER_REPORT = 3
MAX_REPORTS_PER_RUN = 5
GAP_KINDS = frozenset({"rubric-gap", "persona-gap", "recipe-gap", "benchmark-stale", "guardrail-lesson"})
DEFAULT_GLOBS = ("plans/**/reports/*.md",)

@dataclass(frozen=True)
class Report:
    rel: str          # project-relative posix path — the provenance ref
    sha256: str
    text: str

@dataclass(frozen=True)
class Candidate:
    kind: str         # "insight" | "gap"
    text: str
    evidence: str
    source: str
    durable: bool
    actionable: bool
    confidence: float
    target: str | None = None     # required iff kind == "gap"
    gap_kind: str | None = None   # required iff kind == "gap"

def discover_reports(project_dir: Path, globs: Sequence[str]) -> list[Report]: ...
    # sorted by rel for determinism; drops any match escaping project_dir

def load_state(project_dir: Path) -> dict[str, Any]: ...
def save_state(project_dir: Path, state: dict[str, Any]) -> None: ...   # sorted keys, byte-stable
def pending(reports: Sequence[Report], state: dict[str, Any], *, force: bool) -> tuple[list[Report], list[Report]]: ...
    # → (to_harvest[:MAX_REPORTS_PER_RUN], deferred)

def build_packet(prompt: str, reports: Sequence[Report]) -> str: ...
    # prompt + one fenced block per report, each headed by its rel path

def parse_candidates(raw: str) -> list[Candidate]: ...
    # strips a ```json fence, json.loads, validates the envelope shape;
    # raises HarvestError("BAD_CANDIDATES", …) — never a bare exception

def gate(cands: Sequence[Candidate], reports: Sequence[Report]) -> tuple[list[Candidate], dict[str, int]]: ...
    # → (survivors, dropped_by_reason). The rules of Decision 3, in that order.

def normalize(s: str) -> str: ...   # lower, collapse whitespace — used by evidence + dedupe
```

### `harvest_model.py`

```python
class ModelUnavailable(Exception): ...

def resolve_model_cmd() -> list[str] | None:
    """DESIGN_OS_MODEL_CMD split with shlex; None when unset/empty."""

def extract(packet: str, *, cmd: list[str], timeout: float = 300.0) -> str:
    """Run the host model on a FRESH process with the packet on stdin; return raw stdout.

    Fresh = a new process fed nothing but the packet: no session, no history, no repo
    context. Raises ModelUnavailable on a missing binary, a timeout, or a non-zero exit —
    the caller degrades to `skipped`, never crashes the heartbeat.
    """
```

### `harvest.py` — the Typer leaf

```python
def harvest(
    dir_: Annotated[Path, typer.Option("--dir", help="Project dir holding design/ (default: cwd)")] = Path("."),
    glob: Annotated[Optional[list[str]], typer.Option("--glob", help="Report glob, repeatable (default: plans/**/reports/*.md)")] = None,
    force: Annotated[bool, typer.Option("--force", help="Re-harvest reports the cursor already covered")] = False,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Extract + gate, record nothing, leave the cursor")] = False,
    emit_packet: Annotated[bool, typer.Option("--emit-packet", help="Write the packet to design/harvest-inbox/ and stop — no model call")] = False,
    json_: JsonFlag = False,
) -> None:
```

Envelope `data`:
```json
{"project": "…", "reports_read": 2, "deferred": ["…"], "candidates": 7,
 "recorded": {"insight": 2, "gap": 1}, "dropped": {"evidence-not-in-source": 3, "low-confidence": 1},
 "events": ["e41","e42","e43","e44"], "promptVersion": "harvest-extract-v1",
 "status": "ok" | "skipped", "skipReason": "no-model-adapter" | "no-new-reports"}
```
Error codes (envelope + `--help`, per `test_tree_contract`/`cmd-schema` discipline):
`NO_PROJECT` (no `design/` — mirrors P1's opt-in guard), `BAD_CANDIDATES` (model output
unparseable), `KERNEL_MISSING` (`ui` absent), `WRITE_ERROR`.

Orchestration order: resolve dir → require `design/` → discover → `pending` → nothing? emit
`skipped/no-new-reports` (exit 0) → build packet → `--emit-packet`? write inbox + stop →
resolve model cmd → None? write inbox + `skipped/no-model-adapter` (exit 0) → `extract` →
`parse_candidates` → `gate` → `--dry-run`? report + stop → per report: `harvested` then
children via `run_ui` → `save_state` → emit.

### `prompts/harvest-extract-v1.md`

Versioned; the filename **is** the version and `PROMPT_VERSION` must match it (a test pins
this). It must instruct, at minimum:

- Role: *extract lessons from a finished piece of work; you did not do this work and have no
  stake in it looking good.*
- Output: **raw JSON only**, schema `{"v":1,"candidates":[{kind,text,evidence,source,durable,actionable,confidence,target?,gapKind?}]}`.
- **`evidence` must be copied verbatim from the report** — *a candidate whose evidence is not
  a literal quote will be discarded* (tell the model the gate exists; it is not a secret).
- `durable`: would this help on a *different* project? A one-off fact is not durable.
- `actionable`: does it change what someone would DO?
- **Prefer none to noise. Zero candidates is a valid, respected answer.**
- `kind`: `insight` = a durable lesson; `gap` = knowledge missing from `knowledge/` (then
  `target` = `<file>.md[#section]` and `gapKind` ∈ the vocabulary). A taste observation is a
  `gap` with `gapKind: "rubric-gap"`.
- **Never** write files, never run commands, never emit prose outside the JSON.

## Implementation Steps

1. `harvest_core.py` + `test_harvest_core.py` first, complete and green — **no model
   involved**. This is ~80% of the phase.
2. `prompts/harvest-extract-v1.md`.
3. `harvest_model.py` + `test_harvest_model.py` (adapter faked with a shell stub via the
   existing `fake_bin` fixture, `conftest.py:60-73`).
4. `harvest.py` + `test_command_harvest.py` (CliRunner + `fake_bin` stub for `ui`).
5. `cli.py` one-line registration; regenerate `tests/goldens/root-help.txt`.
6. Gates: `uv run pytest -q` in `design-os/`, plus the repo's four gates (the TS side is
   untouched, but run them — the golden help file is contract).
7. **Art III**: run `design-os harvest --dir <a real project> --dry-run --json` against a real
   campaign's reports; paste the survivors **and the dropped-by-reason table** into the PR
   body. If the gate drops a finding you know is real, fix the prompt, not the gate.

## Todo List

- [ ] `harvest_core.py` (discovery · cursor · packet · parse · gate)
- [ ] `test_harvest_core.py`
- [ ] `prompts/harvest-extract-v1.md`
- [ ] `harvest_model.py` + tests
- [ ] `harvest.py` (Typer leaf, envelope, orchestration)
- [ ] `test_command_harvest.py`
- [ ] `cli.py` registration + golden root-help
- [ ] `pyproject.toml` package-data check for `prompts/`
- [ ] pytest + 4 gates
- [ ] Art III dry-run on real reports, pasted in the PR

## Tests — file, name, assertion

### `design-os/tests/test_harvest_core.py` (pure, no model, no subprocess)

Discovery / cursor:
- `test_discover_reports_finds_only_the_default_glob_and_sorts_by_path`
- `test_discover_reports_drops_a_match_outside_the_project_dir` (symlink/`../` escape)
- `test_pending_skips_a_report_whose_sha_is_unchanged`
- `test_pending_reharvests_an_edited_report` (same path, new content → new sha)
- `test_pending_returns_everything_under_force`
- `test_pending_caps_at_five_and_returns_the_rest_as_deferred`
- `test_save_state_is_byte_stable_for_the_same_input` (write twice → identical bytes)

Parsing:
- `test_parse_candidates_strips_a_json_code_fence`
- `test_parse_candidates_raises_bad_candidates_on_prose` (the model chatted instead of JSON)
- `test_parse_candidates_raises_bad_candidates_on_a_missing_required_field`
- `test_parse_candidates_accepts_an_empty_candidate_list` (zero is a valid answer)

The gate (**the heart of the phase**):
- `test_gate_drops_a_candidate_whose_evidence_is_not_in_the_source_report` ← anti-hallucination
- `test_gate_accepts_evidence_that_differs_only_in_whitespace_from_the_report`
- `test_gate_drops_a_candidate_citing_a_report_that_was_not_read`
- `test_gate_drops_non_durable_and_non_actionable_candidates`
- `test_gate_drops_confidence_below_the_floor_and_keeps_it_at_exactly_0_6`
- `test_gate_drops_text_shorter_than_40_and_longer_than_500_chars`
- `test_gate_drops_a_gap_with_a_malformed_target`
- `test_gate_drops_a_gap_whose_kind_is_outside_the_documented_vocabulary`
- `test_gate_dedupes_within_one_batch_but_never_against_the_ledger` (P3 D3: recurrence is signal)
- `test_gate_caps_at_three_per_report_keeping_the_highest_confidence`
- `test_gate_counts_every_drop_by_reason` → `dropped == {"evidence-not-in-source": 2, "low-confidence": 1}` (no silent caps)

The Art III-shaped fixture (`tests/fixtures/harvest/campaign-report.md`): a real-shaped
end-of-phase report seeded with **one genuine finding** — use the audit's own example: *"a
fixed-width box hugging Inter's width wraps under Be Vietnam Pro"* — plus noise (*"ran npm
test, all green"*, *"took 2 hours"*, a restated todo list).
- `test_the_seeded_font_metric_finding_survives_the_gate`
- `test_the_green_test_run_and_the_time_spent_are_dropped_as_not_durable`

### `design-os/tests/test_harvest_model.py`

- `test_resolve_model_cmd_returns_none_when_the_env_var_is_unset`
- `test_resolve_model_cmd_splits_the_command_with_shlex` (`'claude -p --model x'` → 4 items)
- `test_extract_passes_the_packet_on_stdin_and_returns_stdout` (stub echoes stdin to a file)
- `test_extract_raises_model_unavailable_on_a_missing_binary`
- `test_extract_raises_model_unavailable_on_a_nonzero_exit`
- `test_extract_raises_model_unavailable_on_timeout`

### `design-os/tests/test_command_harvest.py` (CliRunner + `fake_bin`)

- `test_no_design_dir_errors_with_no_project` (exit 1, `error.code == "NO_PROJECT"`)
- `test_no_new_reports_skips_cleanly_with_exit_zero` → `data.status == "skipped"`,
  `skipReason == "no-new-reports"`
- `test_unset_model_cmd_skips_and_writes_the_packet_to_the_inbox` → exit 0,
  `skipReason == "no-model-adapter"`, `design/harvest-inbox/*.md` exists **with the reports
  inside it**
- `test_emit_packet_writes_the_packet_and_never_calls_the_model` (assert the stub was not run)
- `test_dry_run_gates_but_records_nothing_and_leaves_the_cursor` → no `ui` call, state file
  unchanged
- `test_a_successful_harvest_records_harvested_first_then_the_insight_refs_it` → assert the
  `ui` stub's recorded argv order **and** that the insight's `--refs` is the harvested id
- `test_every_record_carries_actor_design_os_harvest`
- `test_a_gap_is_recorded_with_its_target_and_kind`
- `test_a_failed_child_write_leaves_the_cursor_unadvanced_so_the_report_reharvests`
- `test_harvest_never_writes_outside_design_and_never_touches_knowledge` → snapshot the repo
  tree before/after; the only new paths are under `design/`
- `test_prompt_version_matches_the_prompt_filename` (pins Decision on versioning)
- `test_json_envelope_reports_dropped_candidates_by_reason` (no silent caps)

## Success Criteria

1. On a real campaign report, harvest surfaces the actual finding as a candidate and drops
   the noise (spec AC3), with the drop reasons shown.
2. A candidate whose `evidence` is not a verbatim quote **never** reaches the ledger.
3. Every write goes through `ui memory record`; harvest writes no ledger bytes itself and
   **never** touches `knowledge/` — only `gap` events, which the unchanged librarian
   veto-chain graduates.
4. Provenance: every insight/gap refs a `harvested` event naming the source report + sha +
   prompt version; every record carries `--actor "design-os harvest"`.
5. Fresh instance per run (new process, packet-only input); no session reuse.
6. No model configured → `skipped`, exit 0, packet in the inbox. The heartbeat never breaks.
7. `harvest_core.py` < 200, `harvest.py` < 200, `harvest_model.py` < 200 (Art IX).
8. `uv run pytest -q` green; four gates green; golden root-help updated.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| **The model hallucinates a lesson the report never contained** | The verbatim-evidence gate — deterministic, adversarial, and unfoolable by a confident tone. It is the single most important line of this phase. |
| **A self-serving lesson** ("the agent did great") | Fresh process, packet-only context, no knowledge of who wrote the report; `durable`+`actionable` gate; and nothing enters `knowledge/` except through the librarian's fresh-judge veto-chain (unchanged). |
| **Harvest floods the ledger** | `MAX_PER_REPORT=3`, `MAX_REPORTS_PER_RUN=5`, content-hash cursor, gate. All caps reported, never silent. |
| **We are inventing the repo's first model call** | Isolated in one ~85-line module behind an env var, degrades to `skipped`, and the deterministic 80% is testable without it. Explicitly flagged for the gate (Decision 2). |
| A prompt edit silently changes extraction behaviour | The prompt is versioned by filename, `PROMPT_VERSION` is pinned to it by a test, and the version is recorded in every `harvested` event — so P5 can attribute a bad batch to a prompt. |
| Model output is enormous / the process hangs | `timeout=300` → `ModelUnavailable` → `skipped`. |
| `DESIGN_OS_MODEL_CMD` is a shell-injection surface | `shlex.split` + `subprocess.run` with a list (never `shell=True`); the value is the operator's own config, not user input. Packet goes on **stdin**, never on argv. |
| The prompt file is not packaged in the wheel | Explicit step 6 check; `test_prompt_version_matches_the_prompt_filename` fails loudly if it cannot be read. |

## Security Considerations

The first outbound-model path in the repo: **report prose leaves the machine** if the
operator points `DESIGN_OS_MODEL_CMD` at a hosted model. Document that in `--help` and the
README in one line — the operator chooses the command, and harvest sends exactly the reports
named in `data.reports_read`, nothing else (no env, no source, no ledger). No secrets are
read. The model never gets write access: it returns text, Python does every write, and the
only writable roots are `design/` and the kernel's ledger.

## Deviations from `plan.md` / `tasks.md` (report to the gate)

1. **"queue gaps for the librarian"** — there is no queue. Gaps *are* `gap` events;
   `librarian collect` reads the ledger (Key Insight 1). No librarian file is touched.
2. **`--since <phase>` is dropped** in favour of a content-hash cursor (Decision 6) — "phase"
   is not a concept the file tree exposes, and reports get edited after they are written.
3. **Reads `plans/**/reports/*.md`, not `plans/*.md`** (Decision 1) — with `--glob` to adapt.
4. **No `taste-observation` candidate kind** — it is a `gap` with `gapKind: "rubric-gap"`,
   using the vocabulary the kernel already documents (Decision 5).
5. **The model-invocation mechanism did not exist and had to be designed** (Decision 2) —
   plan.md assumed "invokes the host model" was a solved seam. It was not.
6. Harvest **cannot** dedupe against the ledger even though that looks like an obvious
   saving: recurrence is exactly the signal P3 counts (P3 Decision 3).

## Next Steps

- **P5** wires `harvest` as a heartbeat runner (respecting Key Insight 6's summary trap) and
  proves the whole loop on real projects.
- Gaps recorded here appear in `design-os librarian collect` with **no change to the
  librarian** — that is the integration test P5 runs for real.
