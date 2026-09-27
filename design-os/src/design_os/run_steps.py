"""Build the ``method-run/1`` document from what the kernel calls observed.

Pure: no I/O, no clock. The schema knows only ``done|skipped``; a run stopped by the
intake receipt is therefore ``define`` done and the later steps skipped, with the
``blocked-intake`` reason code.
"""

from __future__ import annotations

from typing import Any

STEPS = ("frame", "define", "explore", "decide", "build", "verify")
BLOCKED_CODE = "blocked-intake"


def _skip(code: str, detail: str) -> dict[str, Any]:
    return {"status": "skipped", "skip_reason": {"code": code, "detail": detail}, "artifacts": [], "needs_humans": []}


def _done(artifacts: list[dict[str, str]], needs: list[dict[str, str]] | None = None) -> dict[str, Any]:
    return {"status": "done", "artifacts": artifacts, "needs_humans": needs or []}


def _art(path: str, provenance: str = "observed") -> dict[str, str]:
    return {"path": path, "provenance": provenance}


def _human_needs(questions: list[dict[str, Any]]) -> list[dict[str, str]]:
    # Intake questions carry no addressee; the brief's owner side (PM) is the default (D7 role).
    return [{"question": str(q.get("question", q.get("field", "?"))), "role": "PM"} for q in questions]


def _frame(brief: dict[str, Any]) -> dict[str, Any]:
    if brief.get("rawRequest") and brief.get("audience"):
        return _skip("existing-evidence", "problem and audience are anchored by brief.json rawRequest and audience")
    return _done([], [{"question": "The brief does not state the problem and audience", "role": "PM"}])


def build_run(
    *,
    feature: str,
    brief: dict[str, Any],
    blocked: bool,
    questions: list[dict[str, Any]],
    screens: list[str],
    evidence: list[str],
) -> dict[str, Any]:
    """``screens`` and ``evidence`` are paths relative to run.json."""
    steps: dict[str, Any] = {
        "frame": _frame(brief),
        "define": _done([_art("brief.json"), _art("questions.json")], _human_needs(questions)),
    }
    if blocked:
        detail = "the D4 receipt is BLOCKED; answer questions.json and re-run"
        for name in STEPS[2:]:
            steps[name] = _skip(BLOCKED_CODE, detail)
    else:
        steps["explore"] = _skip("out-of-scope", "the conductor makes no model calls, so it generates no options")
        steps["decide"] = _skip("out-of-scope", "the D7 approver decision is owner-manual and not recorded by this run")
        steps["build"] = (
            _done([_art(p) for p in screens]) if screens
            else _skip("not-applicable", "no --screens directory with HTML files was supplied")
        )
        steps["verify"] = (
            _done([_art(p) for p in evidence]) if evidence
            else _skip("not-applicable", "nothing to verify: no screens, trace or candidates supplied")
        )
    return {"schema": "method-run/1", "feature": feature, "school": "none", "steps": steps}
