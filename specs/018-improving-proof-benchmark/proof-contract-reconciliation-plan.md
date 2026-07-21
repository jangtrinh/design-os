# Spec 018 — Proof-Contract Reconciliation (execution plan)

**Author tier:** Opus 4.8 (plan) → Sonnet 5 (implement) → Opus + Codex 5.6 sol (review) → Fable 5 (audit gate)
**Domain (Cynefin):** Complicated — acceptance criteria sealed by the IMPROVING-graduation-strategy
context; no brainstorm, no relitigation.
**Boundary:** deterministic engine only (Art I) — pure transforms, no network/model. Thresholds MUST NOT
be weakened. This task fixes a contract↔engine mismatch; it does NOT generate or graduate any design.

## Problem (the mismatch)

The written benchmark contract declares a **suite-level** IMPROVING bar, but the engine grants IMPROVING
from **one** qualifying comparison, and `_reduction(0,0)` reports a fake 100% improvement.

| Surface | Says today | Must say |
|---|---|---|
| `benchmark-contract.md` | suite: 3 cases, mean +10, agg reductions | + explicit ≥2 categories + zero-denominator clause |
| `evolution_proof.py:83` | `comparisons and safe` → one comparison graduates | suite aggregate gate graduates |
| `evolution_proof.py:36` | `_reduction(0,0)==1.0` | `0` baseline → `None` (no reduction demonstrated) |
| `_valid_comparisons` | per-item ≥10/≥.25/≥.70 gate | structural validity only (incl. `category`) |
| schema `comparisons[]` | no `category` | `category` required |
| tests | 1 comparison → IMPROVING | 3-case/2-category suite → IMPROVING |
| README:177 | "a controlled comparison clears…" | "a preregistered suite of ≥3 holdouts across ≥2 categories clears…" |

## Target design (exact)

### 1. `design-os/src/design_os/evolution_proof.py`

**`_reduction` — fix zero-denominator (signature changes to Optional):**
```python
def _reduction(before: int, after: int) -> float | None:
    """Fractional reduction before→after. None when there is no baseline (before == 0):
    a 0→0 or 0→N change demonstrates no reduction and must never read as improvement."""
    if before == 0:
        return None
    return (before - after) / before
```

**`_valid_comparisons` — structural validity ONLY (drop per-item threshold gate; require `category`):**
A comparison is structurally valid iff: `_text(id)`, `_text(control.artifactRef)`, `_text(treatment.artifactRef)`,
`_text(category)`, both curatorScores numeric in [0,100] and not bool, all four counts int≥0 and not bool,
`controlledInputs is True`, `blindEvaluation is True`, `regressions` int≥0 and not bool. No score/repair/repeated
threshold here. Invalid → finding `{"code": "invalid-comparison", "message": "comparison '<id>' is structurally incomplete"}`.
Valid items are returned (they carry into the suite gate).

**New `_suite_result(comparisons) -> dict` — the suite aggregate gate:**
```python
def _suite_result(comparisons: list[dict[str, Any]]) -> dict[str, Any]:
    cases = len(comparisons)
    categories = {c["category"] for c in comparisons}
    deltas = [c["treatment"]["curatorScore"] - c["control"]["curatorScore"] for c in comparisons]
    wins = bool(comparisons) and all(d > 0 for d in deltas)
    no_regressions = all(c["regressions"] == 0 for c in comparisons)
    mean_delta = (sum(deltas) / cases) if cases else 0.0
    repair = _reduction(sum(c["control"]["repairRounds"] for c in comparisons),
                        sum(c["treatment"]["repairRounds"] for c in comparisons))
    repeated = _reduction(sum(c["control"]["repeatedCorrections"] for c in comparisons),
                          sum(c["treatment"]["repeatedCorrections"] for c in comparisons))
    passed = (cases >= 3 and len(categories) >= 2 and wins and no_regressions
              and mean_delta >= 10
              and repair is not None and repair >= 0.25
              and repeated is not None and repeated >= 0.70)
    return {"cases": cases, "categories": len(categories), "meanDelta": mean_delta,
            "repairReduction": repair, "repeatedReduction": repeated,
            "allWon": wins, "noRegressions": no_regressions, "passed": passed}
```

**`validate_proof` — replace the graduation branch and surface the suite:**
- After `comparisons = _valid_comparisons(...)`, compute `suite = _suite_result(comparisons)`.
- If `comparisons` non-empty and `not suite["passed"]`, append finding
  `{"code": "suite-below-improving-bar", "message": "<reason>"}` where `<reason>` names the FIRST unmet
  dimension in this order: fewer than 3 cases / fewer than 2 categories / a case did not win / a case has a
  regression / mean delta < 10 / repair reduction < 25% or undefined / repeated-correction reduction < 70% or undefined.
- Graduation: `if level == "APPLIED" and suite["passed"] and safe: level = "IMPROVING"`.
- Return dict gains `"suite": suite` alongside `"level"`, `"counts"`, `"findings"`. Keep
  `counts.comparisons = len(comparisons)`.

Keep every other level rule and finding code unchanged (duplicate-learning-source, invalid-proof-base,
invalid-learning-source, invalid-memory-application, invalid-defect-learning, missing-proof-safeguards).

### 2. `schemas/evolution-proof.schema.json`

In `comparisons.items`: add `"category": { "type": "string", "minLength": 1 }` to `properties`, and add
`"category"` to that item's `required` array (currently `["id","controlledInputs","blindEvaluation","control","treatment","regressions"]`).
Keep `version const 1`, `additionalProperties: false`.

### 3. `specs/017-living-agent-proof/evidence/ease-design-proof.json`

Add `"category": "native-mobile"` to its single comparison object so it stays schema-valid and structurally
valid. Verdict remains APPLIED (cases=1 < 3). The two sibling proofs have empty `comparisons` → no change.

### 4. `design-os/tests/test_evolution_proof.py`

- **Rewrite** `test_improving_requires_control_thresholds_and_safeguards`: build a 3-comparison suite across
  2 categories (e.g. cat "promotion","native-mobile","architecture" → 3 categories is fine, ≥2), each treatment
  winning, aggregate repair reduction ≥25%, aggregate repeated reduction ≥70%, mean delta ≥10, regressions 0,
  safeguards pass → assert IMPROVING. Then drop one case (2 cases) → assert APPLIED + `suite-below-improving-bar`.
- **Rewrite** `test_improving_requires_safeguard_references_and_numeric_counts` to the same 3-case suite; keep its
  intent (empty safeguard refs → APPLIED; a bool `repairRounds` makes that comparison structurally invalid →
  suite drops below 3 → APPLIED).
- **Add** `test_suite_requires_two_categories`: 3 cases all same `category` → APPLIED + finding names categories.
- **Add** `test_suite_requires_every_case_to_win`: 3 cases/2 categories but one has treatment ≤ control → APPLIED.
- **Add** `test_mean_delta_gate_not_per_case`: cases with deltas e.g. [16,16,4] mean=12≥10 → passes that dimension;
  and [12,12,3] mean=9 <10 → APPLIED. (proves MEAN, not per-case ≥10.)
- **Add** `test_zero_denominator_repair_is_not_improvement`: all control.repairRounds==0 and treatment.repairRounds==0
  (repeated fine) → `repairReduction is None` → APPLIED (NOT graduated by fake 100%). This is the bug-fix test.
- **Add** `test_aggregate_reduction_thresholds`: agg repair reduction 24% → APPLIED; agg repeated 69% → APPLIED.
- Keep all other existing tests unchanged and passing.

### 5. `specs/018-improving-proof-benchmark/benchmark-contract.md`

Under "Graduation threshold" add: "across at least two categories" to the case requirement, and append a
zero-denominator clause: "If aggregate control repair rounds or aggregate repeated corrections are zero, that
reduction is undefined and the suite does not graduate — a `0 → 0` change is never counted as improvement."

### 6. `README.md` line ~177 and ~203-207

- Line 177-178: replace "a controlled comparison clears declared quality, repair, recurrence, and safety
  thresholds." with "a preregistered suite of at least three holdouts across at least two categories clears the
  declared mean-quality, aggregate-repair, recurrence, and safety thresholds — the deterministic engine computes
  the suite verdict itself."
- Line 203-207 boundary paragraph: keep APPLIED; adjust "one successful case is not proof of an everyday trend"
  to also note the verdict now requires the full suite gate (no single comparison can graduate).

### 7. `specs/017-living-agent-proof/STATUS.md`

Update "Next proof milestone" to state the engine now enforces a suite-level gate (≥3 cases/≥2 categories, mean
+10, aggregate reductions, zero-denominator-safe); no wording that lowers thresholds.

## Acceptance criteria (all must hold)

1. A single qualifying comparison can NEVER reach IMPROVING (needs ≥3 cases/≥2 categories).
2. Suite gate enforces: mean delta ≥10, aggregate repair reduction ≥25%, aggregate repeated ≥70%, every case wins,
   zero regressions, contradiction+isolation pass.
3. `_reduction(0,0) is None` and a zero-baseline metric fails its threshold (no fake 100%).
4. mean is enforced across cases, not per case.
5. schema, engine, tests, contract, README, STATUS all agree on suite-level graduation.
6. `ease-design-proof.json` still validates and still reports APPLIED.
7. Gates green: `design-os` pytest, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.

## Constraints

- Do not weaken any threshold. Do not touch the deterministic boundary.
- Keep `evolution_proof.py` < 200 lines.
- Full Spec 013 completion is out of scope.
- Do not generate/polish any design; this is engine/contract work only.
