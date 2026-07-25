---
id: 019-critic-divergence
title: Critic divergence evidence staging + owner blind ordinal ranking (Panel 2)
stage: 5-crosscheck
created: 2026-07-24
base_commit: 7132637        # HEAD on 2026-07-24 when the task was created
panel2_base_commit: 0a56699 # HEAD when Panel 2 was built (2026-07-25, after the #94/#95 merges)
task_branch: main
cap_exception: none
domain: clear               # as recorded in § Classification; see "Route note" below
feature: 019-model-routing-benchmark
ck_kit: absent
---

## Stage iterations

| stage | count |
|---|---|
| 2-spec | 2 |
| 3-build | 2 |
| 4-validate | 2 |
| 5-crosscheck | 1 |
| 6-final | 1 |

Iteration 2 of spec/build/validate is Panel 2 (2026-07-25): a preregistered ordinal re-run after
Panel 1's Approve/Reject proved unable to order the three arms it approved. No stage is at 3; no
escalation is owed.

**Route note.** § Classification records **CLEAR**, whose stage set is 2(micro-spec) → 3 → 4-lite —
it fires neither Stage 5 nor Stage 6. Both iterations nevertheless ran a Codex Stage-5 cross-check.
That is **over-delivery, not a route violation**: running more gates than the domain requires only
adds assurance, and CLEAR's accepted trade-off (logic/security handled by a Stage-4-lite spot-check)
was upgraded to a real cross-family review with an explicit OWASP pass. No reclassification was
triggered — that needs 2× `VERDICT: NO` at Stage 4, and neither iteration produced one.

Settlement is unaffected: CLEAR fires no Stage 6, so **Opus is the settler** either way
(ORCHESTRATION.md § "Settlement without Stage 6").

## Builders

| builder | branch | worktree path | spec revision |
|---|---|---|---|
| a0-cadence / a0-haven | main | — | panel-2 set 1 (imagery-suppressed) |
| a1-cadence / a1-haven | main | — | panel-2 set 1 |
| a5-cadence / a5-haven | main | — | panel-2 set 1 |
| img-a0-cadence / img-a0-haven | main | — | panel-2 set 2 (imagery enabled) |
| img-a1-cadence / img-a1-haven | main | — | panel-2 set 2 |
| img-a5-cadence / img-a5-haven | main | — | panel-2 set 2 |

Peak concurrency 3 in set 1, 2 in set 2 (imagery makes every builder a potential Codex holder;
2 builders + 2 Codex = the 4 ceiling). Cap never exceeded, no exception requested.

## Human gates

| gate | date | decision |
|---|---|---|
| G0 announce | 2026-07-24 | approved — "OK vậy làm thôi?" (evidence staging only) |
| G-owner blind verdict (Approve/Reject) | 2026-07-24 | **completed** — Panel 1, `e16` |
| G-owner craft-basis feedback | 2026-07-24 | recorded — "too simple", craft not layout, `e17` |
| G-imagery amendment | 2026-07-25 | approved — rebuild all 6 arms with imagery enabled |
| G-owner blind ORDINAL ranking | 2026-07-25 | **completed** — Panel 2, `e18` (+`e19` provenance fix) |

**Never re-ask a recorded decision.** The owner blind-ranking gate that blocked this task from
2026-07-24 is now closed on both halves.

## Verdicts

| stage | model | verdict | iteration | notes |
|---|---|---|---|---|
| 4-validate | Opus | `VERDICT: YES` | 1 | evidence staging; gates + ledger integrity |
| 5-crosscheck | Codex | `VERDICT: SKIPPED-ERROR` | 1 | HTTP 401 both transports; not fabricated |
| 5-crosscheck (sub) | Fable | `VERDICT: CONCERNS` → `PASS` | 1 | two framing concerns reconciled |
| 4-validate | Opus | `VERDICT: YES` | 2 | Panel 2: 6/6 builds gate-verified independently, blinding clean, panel leak-check clean |
| owner | human | **ordinal ranking recorded** | 2 | A5 first on both briefs; primary question unresolved |
| 5-crosscheck | Codex | `VERDICT: BLOCKER` | 2 | preregistration attested-not-auditable; + 2 MEDIUM, 1 LOW, 1 OWASP. `05-codex-review.md` |
| 5-settlement | Opus | `CONCERNS-RESOLVED` | 2 | BLOCKER confirmed real, discharged by claim-correction (not rebuild); 2/3/4 fixed; `e20` |

# Handoff 019 — Critic divergence evidence staging

## Task

Apply the evidence-supported portion of the cheap-model benchmark review without bypassing the DESIGN:OS librarian doctrine.

## Classification

- **Scope:** narrow — one spec evidence record plus generated studio gap events.
- **Novelty:** extension of the existing benchmark and librarian patterns.
- **Clarity:** clear; direct knowledge edits are explicitly out of scope until owner blind ranking.
- **Route:** CLEAR — evidence record → generated gap events → deterministic validation → diff review.

## Acceptance criteria

1. Benchmark findings and limits are preserved in a committed-path Spec 019 evidence record.
2. Demonstrated findings are recorded as studio-level `gap` evidence through `ui memory record`; the ledger is not hand-edited.
3. No routing default, taste profile, multi-candidate default, knowledge file, workflow template, schema, or gate threshold is changed.
4. Owner blind ranking remains the blocking gate before any librarian PR.
5. Repository validation and final diff/status are captured below.

## Human decision

The owner said “OK vậy làm thôi?” after receiving the Fable review. This authorizes evidence staging and the safe, review-supported path; it does not manufacture the missing blind owner verdict.

## Stage record

### Direction

Follow Fable review run `wf_22e91c7c-dac`: stage evidence now; do not hand-edit knowledge; keep routing and preference learning as hypotheses.

### Build

- Added `specs/019-model-routing-benchmark/benchmark-result.md` as the durable evidence boundary and Spec 019 hypothesis record.
- Recorded studio gaps `e11`–`e15` through `ui memory record gap` against `brand/`; the CLI regenerated `memory.graph.json` to 15 events.
- Did not edit `knowledge/**`, `templates/workflows/**`, routing, schemas, taste profile, or gate thresholds.
- Left the pre-existing untracked `arm-proper/` directory untouched.

### Validation

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm run build` — pass.
- `npm test` — pass: 148 files, 2232 tests passed, 6 skipped.
- `ui knowledge check` — pass: 0 findings.
- `design-os librarian collect --dir /Users/jangtrinh/Products/ease-design/brand --json` — pass: 15 open gaps; `e11`–`e15` collected with the intended targets.
- `ui memory status --dir /Users/jangtrinh/Products/ease-design/brand` — graph fresh, 15 events.

**Validation verdict:** `VERDICT: YES`

### Independent review

- The configured Codex CLI cross-check was attempted read-only but returned HTTP 401 for both WebSocket and HTTPS transports; no verdict was fabricated.
- Fable 5 review-only audit returned `VERDICT: CONCERNS`: the first draft omitted the grid's pipeline-vs-bare conflict and understated the pilot's anti-Fable-direction proxy signal. It otherwise verified scope confinement, ledger/graph integrity, no routing default, no threshold relaxation, and the owner-ranking block.
- Reconciled both findings in `benchmark-result.md`: it now states that Codex ranked bare A0 first while Gemini favored pipeline arms, and that all three pilot proxy families ranked all-cheap A1 above Fable-directed A3/A4 on both briefs. Both remain unresolved or narrowly scoped, not promoted rules.
- Minor non-blocking notes retained: the original run artifacts live in the workflow scratchpad; generated ledger entries include CLI-supported actor/artifact fields not present in older entries.
- Fable 5 then rechecked the reconciled files read-only and returned `VERDICT: PASS`: both evidence-framing concerns are closed; the owner block, confined scope, and no-knowledge/no-routing/no-threshold invariants remain intact.

**Independent review verdict:** `VERDICT: PASS`

**Review disposition:** Fable's two material concerns were fixed without widening scope or touching knowledge. Owner blind ranking remains the blocking gate before librarian graduation.

### Panel 2 — owner blind ordinal ranking (2026-07-25, iteration 2)

Acceptance criterion 4 ("owner blind ranking remains the blocking gate") is **now satisfied**;
criteria 1–3 and 5 are unchanged and still hold.

- **Why a second panel.** Panel 1's Approve/Reject approved three arms and could not order them.
  The § Blocking gate asked for an ordinal ranking; the record disclaimed it twice.
- **Why a NEW run, not a re-panel.** Run `wf_7126bcee-f58`'s 28 builds are unrecoverable — the
  scratchpad was cleared; nothing named Cadence/Haven exists on disk or in git history (both
  searched). Briefs were reconstructed from `e16`'s six-word description. Preregistered in
  `specs/019-model-routing-benchmark/panel-2-RUN-PLAN.md` before any candidate existed, including a
  pre-committed reading of every outcome — the unfavourable one included.
- **Amendment A1 (imagery).** The first build set was generated under an orchestrator constraint
  that suppressed the asset ladder's *generated asset* rung (`generation-craft-defaults.md:32-49`).
  Not a DESIGN:OS guidance gap — the guidance existed and was overridden. All six arms were rebuilt
  with imagery enabled; the suppressed set is retained as `panel-2/builds-noimage/` and was never
  shown to the owner.
- **Result.** Cadence `A5 > A1 > A0`; Haven `A5 > A0 > A1`. A5 (Sonnet direction + cross-family
  Codex judge) first on both briefs.
- **Recorded honestly:** the *primary* preregistered question (does DESIGN:OS beat bare) is
  **UNRESOLVED** — A0 beat full-pipeline A1 on Haven, which is the preregistered split case. A5's
  2/2 is directional only.
- **Load-bearing finding:** A1 held a perfect machine floor on both briefs and ranked 2nd/3rd. First
  owner-grounded support for Demonstrated finding 1 (*a deterministic floor is not a quality verdict*).

**Ledger:** `e18` (verdict), `e19` (provenance correction — `--refs` takes comma-separated ids for
`record`; the JSON form is `consolidate`-only. Ledger is append-only, so superseded, not edited).

**Panel-2 validation verdict:** `VERDICT: YES`

## Next stage / re-entry

**Stage 5 is now SATISFIED** (2026-07-25, `05-codex-review.md`), discharging the iteration-1
`SKIPPED-ERROR`. Codex returned `BLOCKER`; Opus confirmed it real and settled it by correcting the
overstated claim rather than rebuilding candidates — the defect was in the record's epistemics, not
in the artifacts.

**Stage 6 does NOT fire on this route.** `domain: clear` runs 2→3→4-lite only, and
ORCHESTRATION.md § Depth Routing states *Stage 6 fires iff Stage 1 fired*. Per § "Settlement without
Stage 6", **Opus is the settler and its written rationale is final**. (An earlier revision of this
handoff wrongly claimed Fable holds the last word here — corrected.) Fable's iteration-1 review was a
review-only audit, not a Stage-6 gate.

Remaining before `done`:

1. **Librarian veto chain + human merge** for the first eligible topic, **critic disagreement
   handling and verdict confidence** — which Panel 2 has made materially more interesting: the
   cross-family judge won both briefs while the perfect-machine-floor arm did not. 10 open gaps are
   visible to `design-os librarian collect`.
2. Merge `spec/019-panel-2` when the owner chooses.

**Nothing here authorizes a routing default, a model winner, or a knowledge edit.**
