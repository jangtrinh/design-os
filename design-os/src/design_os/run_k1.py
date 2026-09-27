"""The ``k1.json`` measurement sheet, with the same top-level keys as the hand-made one.

Fields only a human or a model leg can fill (Figma parity, approver decision, preview
time) are reported as NOT RUN, never guessed: a wrong number is worse than an absent one.
"""

from __future__ import annotations

from typing import Any

NO_MODEL = "none (the conductor makes no model call)"


def _ratio(passing: int, total: int) -> dict[str, Any]:
    if total == 0:
        return {"value": None, "final": "0/0", "first_run": None, "fix_batches_to_green": None}
    return {"value": round(passing / total, 3), "final": f"{passing}/{total} = {round(100 * passing / total)}%",
            "first_run": None, "fix_batches_to_green": None}


def _bytes_before_mutation(trace: dict[str, Any] | None) -> dict[str, Any]:
    if trace is None:
        return {"trace_value": None, "trace_valid": False, "why_invalid": "no .design-os/trace/reads.jsonl in the project"}
    first = trace.get("firstMutation") or {}
    valid = bool(first) and first.get("kind") != "bash-legacy"
    out: dict[str, Any] = {"trace_value": trace.get("bytesBeforeFirstMutate"), "trace_valid": valid}
    if not valid:
        out["why_invalid"] = ("the first mutation is an untargeted legacy Bash record, so the pre-mutation "
                              "window ends at an unknown point" if first else "the trace holds no mutation record")
    return out


def build_k1(
    *,
    feature: str,
    base: str | None,
    screens: list[str],
    passing: list[str],
    d4: dict[str, Any],
    question_count: int,
    trace: dict[str, Any] | None,
) -> dict[str, Any]:
    total, ok = len(screens), len(passing)
    return {
        "feature": feature,
        "base": base,
        "model_tier": NO_MODEL,
        "screens_delivered": total,
        "screens": screens,
        "screens_passing_all_gates_final": ok,
        "screens_passing_all_gates_first_run": None,
        "screens_with_figma_parity": {"count": 0, "status": "NOT RUN", "reason": "the conductor has no Figma plugin session"},
        "screens_approver_accepted": {"count": 0, "status": "NOT RUN", "reason": "the D7 approver decision is owner-manual"},
        "design_true_rate": {
            "value": 0.0,
            "formula": f"passing ∧ parity ∧ accepted / delivered = 0/{total}",
            "note": "0 because two legs are NOT RUN, not because the design failed",
        },
        "gate_only_proxy": {**_ratio(ok, total), "note": "single conductor run: no first-run or fix-batch history"},
        "time_to_first_preview_minutes": None,
        "time_to_first_preview_basis": "the conductor renders no preview",
        "questions_needed": {"total": question_count, "blocking": len(d4.get("blocking", []))},
        "d4": {"B": d4.get("B"), "R": d4.get("R"), "L": d4.get("L"), "result": d4.get("decision")},
        "bytes_read_before_first_mutation": _bytes_before_mutation(trace),
        "trace_summary": {k: (trace or {}).get(k) for k in ("esDesignerLoaded", "esDesignerChecklistRan", "gateRuns")},
        "screenshots": "not produced by the conductor",
        "legs_not_run": ["L5 Figma", "D7 approver"],
        "time_to_preview_leg_end_minutes": None,
        "reruns": [],
    }
