"""Deterministic causal proof for the DESIGN:OS learning ladder."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

LEVELS = ("ALIVE", "LEARNING", "APPLIED", "IMPROVING")


def _read(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _time(value: Any) -> datetime | None:
    if not _text(value):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _reduction(before: int, after: int) -> float | None:
    """Fractional reduction before→after. None when there is no baseline (before == 0):
    a 0→0 or 0→N change demonstrates no reduction and must never read as improvement."""
    if before == 0:
        return None
    return (before - after) / before


def validate_proof(proof: dict[str, Any]) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    project = proof.get("projectId")
    sources = proof.get("sources") if isinstance(proof.get("sources"), list) else []
    source_map: dict[str, dict[str, Any]] = {}
    duplicate_ids: set[str] = set()
    for source in sources:
        if not isinstance(source, dict) or not _text(source.get("id")):
            continue
        source_id = source["id"]
        if source_id in source_map:
            duplicate_ids.add(source_id)
        source_map[source_id] = source
    for source_id in sorted(duplicate_ids):
        findings.append({"code": "duplicate-learning-source", "message": f"source '{source_id}' is duplicated"})
    if proof.get("kind") != "evolution-proof" or proof.get("version") != 1 or not _text(project):
        findings.append({"code": "invalid-proof-base", "message": "kind, version, and projectId are required"})
    valid_sources = []
    for source in source_map.values():
        if (source.get("projectId") != project or not _time(source.get("learnedAt"))
                or not all(_text(source.get(k)) for k in ("evidenceRef", "lesson"))):
            findings.append({"code": "invalid-learning-source", "message": f"source '{source.get('id')}' is incomplete or cross-project"})
        else:
            valid_sources.append(source)
    valid_sources = [source for source in valid_sources if source["id"] not in duplicate_ids]
    valid_source_map = {source["id"]: source for source in valid_sources}
    applications = _valid_applications(proof.get("applications"), valid_source_map, findings)
    defects = _valid_defects(proof.get("defects"), valid_source_map, findings)
    comparisons = _valid_comparisons(proof.get("comparisons"), findings)
    safeguards = proof.get("safeguards") if isinstance(proof.get("safeguards"), dict) else {}
    safe = (safeguards.get("contradictionPassed") is True
            and safeguards.get("isolationPassed") is True
            and _text(safeguards.get("contradictionRef"))
            and _text(safeguards.get("isolationRef")))
    if not safe:
        findings.append({"code": "missing-proof-safeguards", "message": "contradiction and isolation checks must pass"})
    suite = _suite_result(comparisons)
    if comparisons and not suite["passed"]:
        reason = "fewer than 3 cases" if suite["cases"] < 3 else "fewer than 2 categories" if suite["categories"] < 2 else "a case did not win" if not suite["allWon"] else "a case has a regression" if not suite["noRegressions"] else "mean delta below 10" if suite["meanDelta"] < 10 else "repair reduction below 25% or undefined" if suite["repairReduction"] is None or suite["repairReduction"] < .25 else "repeated-correction reduction below 70% or undefined"
        findings.append({"code": "suite-below-improving-bar", "message": reason})
    level = "ALIVE"
    if valid_sources:
        level = "LEARNING"
    if valid_sources and (applications or defects):
        level = "APPLIED"
    if level == "APPLIED" and suite["passed"] and safe:
        level = "IMPROVING"
    return {"level": level, "counts": {"sources": len(valid_sources), "applications": len(applications),
            "defects": len(defects), "comparisons": len(comparisons)}, "suite": suite, "findings": findings}


def _valid_applications(value: Any, sources: dict[Any, dict[str, Any]], findings: list[dict[str, str]]) -> list[dict[str, Any]]:
    valid = []
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        ids = item.get("sourceIds") if isinstance(item.get("sourceIds"), list) else []
        applied = _time(item.get("appliedAt"))
        source_times = [_time(sources[x].get("learnedAt")) for x in ids if x in sources]
        refs = all(_text(item.get(k)) for k in ("id", "relevance", "decisionRef", "artifactRef", "outcomeRef"))
        if ids and len(source_times) == len(ids) and applied and refs and all(t and t < applied for t in source_times):
            valid.append(item)
        else:
            findings.append({"code": "invalid-memory-application", "message": f"application '{item.get('id')}' lacks causal chronology or references"})
    return valid


def _valid_defects(value: Any, sources: dict[Any, dict[str, Any]], findings: list[dict[str, str]]) -> list[dict[str, Any]]:
    valid = []
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        escaped, corrected = _time(item.get("escapedAt")), _time(item.get("correctedAt"))
        refs = all(_text(item.get(k)) for k in ("id", "rootCause", "gateId", "gateRef", "negativeFixtureRef", "laterRunRef"))
        source = sources.get(item.get("sourceId"))
        learned = _time(source.get("learnedAt")) if source else None
        if (source and learned and escaped and corrected and learned <= escaped < corrected and refs
                and item.get("fixtureFails") is True and isinstance(item.get("laterDetectedCount"), int)
                and item["laterDetectedCount"] >= 0):
            valid.append(item)
        else:
            findings.append({"code": "invalid-defect-learning", "message": f"defect '{item.get('id')}' lacks gate, fixture, or later-run proof"})
    return valid


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


def _valid_comparisons(value: Any, findings: list[dict[str, str]]) -> list[dict[str, Any]]:
    valid = []
    for item in value if isinstance(value, list) else []:
        control, treatment = item.get("control", {}), item.get("treatment", {})
        refs = all(_text(x) for x in (item.get("id"), control.get("artifactRef"), treatment.get("artifactRef"), item.get("category")))
        scores = [control.get("curatorScore"), treatment.get("curatorScore")]
        counts = [control.get("repairRounds"), treatment.get("repairRounds"), control.get("repeatedCorrections"), treatment.get("repeatedCorrections"), item.get("regressions")]
        numeric = all(isinstance(x, (int, float)) and not isinstance(x, bool) and 0 <= x <= 100 for x in scores)
        integral = all(isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in counts)
        if refs and numeric and integral and item.get("controlledInputs") is True and item.get("blindEvaluation") is True:
            valid.append(item)
        else:
            findings.append({"code": "invalid-comparison", "message": f"comparison '{item.get('id')}' is structurally incomplete"})
    return valid


def proof_diagnostics(project_dir: Path) -> list[dict[str, str]]:
    findings = []
    nested = project_dir / "design" / "design" / "memory.events.jsonl"
    if nested.is_file():
        findings.append({"code": "nested-memory-store", "message": str(nested)})
    hb = project_dir / "design" / "heartbeat.json"
    state = project_dir / "design" / "heartbeat-state.json"
    if hb.is_file() and not state.is_file():
        findings.append({"code": "heartbeat-never-recorded", "message": "heartbeat is configured but has no state"})
    corrections = project_dir / "design" / "memory" / "figma-corrections.jsonl"
    if corrections.is_file():
        unresolved = any(item.get("unresolved") is True for item in _read_jsonl(corrections))
        if unresolved:
            findings.append({"code": "unresolved-designer-corrections", "message": str(corrections)})
    return findings


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            items.append(value)
    return items


def read_and_validate(path: Path) -> dict[str, Any]:
    proof = _read(path)
    if proof is None:
        return {"exists": path.is_file(), "level": "ALIVE", "counts": {},
                "findings": [{"code": "missing-or-invalid-proof", "message": str(path)}]}
    return {"exists": True, **validate_proof(proof)}
