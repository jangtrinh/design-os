from __future__ import annotations

import json
from pathlib import Path

from design_os.evolution_proof import proof_diagnostics, validate_proof


def source() -> dict[str, object]:
    return {
        "id": "lesson-1",
        "projectId": "fixture",
        "learnedAt": "2026-07-18T10:00:00Z",
        "evidenceRef": "reports/feedback.md",
        "lesson": "Use the project icon family.",
    }


def base() -> dict[str, object]:
    return {
        "kind": "evolution-proof",
        "version": 1,
        "projectId": "fixture",
        "sources": [source()],
        "applications": [],
        "defects": [],
        "comparisons": [],
        "safeguards": {
            "contradictionPassed": False,
            "contradictionRef": "",
            "isolationPassed": False,
            "isolationRef": "",
        },
    }


def test_learning_requires_a_valid_project_source() -> None:
    result = validate_proof(base())
    assert result["level"] == "LEARNING"
    assert result["counts"]["sources"] == 1


def test_application_requires_later_causal_receipt() -> None:
    proof = base()
    proof["applications"] = [{
        "id": "apply-1",
        "sourceIds": ["lesson-1"],
        "appliedAt": "2026-07-19T10:00:00Z",
        "relevance": "The later surface needs an icon.",
        "decisionRef": "decisions/icon.md",
        "artifactRef": "output/index.html",
        "outcomeRef": "audit/icon.json",
    }]
    assert validate_proof(proof)["level"] == "APPLIED"

    proof["applications"][0]["appliedAt"] = "2026-07-17T10:00:00Z"
    result = validate_proof(proof)
    assert result["level"] == "LEARNING"
    assert any(x["code"] == "invalid-memory-application" for x in result["findings"])


def test_application_cannot_use_invalid_or_duplicate_source() -> None:
    proof = base()
    proof["sources"].append(source())
    proof["applications"] = [{
        "id": "apply-1", "sourceIds": ["lesson-1"],
        "appliedAt": "2026-07-19T10:00:00Z", "relevance": "Relevant",
        "decisionRef": "d", "artifactRef": "a", "outcomeRef": "o",
    }]
    result = validate_proof(proof)
    assert result["level"] == "ALIVE"
    assert result["counts"]["applications"] == 0
    assert any(x["code"] == "duplicate-learning-source" for x in result["findings"])


def test_defect_gate_requires_negative_fixture_and_later_run() -> None:
    proof = base()
    proof["defects"] = [{
        "id": "defect-1",
        "sourceId": "lesson-1",
        "escapedAt": "2026-07-18T11:00:00Z",
        "correctedAt": "2026-07-18T12:00:00Z",
        "rootCause": "The gate did not inspect icon provenance.",
        "gateId": "G10",
        "gateRef": "gates/icon-family.js",
        "negativeFixtureRef": "gates/cases/icon-family.json",
        "fixtureFails": True,
        "laterRunRef": "reports/gates-final.json",
        "laterDetectedCount": 2,
    }]
    assert validate_proof(proof)["level"] == "APPLIED"
    proof["defects"][0]["fixtureFails"] = False
    assert validate_proof(proof)["level"] == "LEARNING"


def test_improving_requires_control_thresholds_and_safeguards() -> None:
    proof = base()
    proof["applications"] = [{
        "id": "apply-1", "sourceIds": ["lesson-1"],
        "appliedAt": "2026-07-19T10:00:00Z", "relevance": "Relevant",
        "decisionRef": "d", "artifactRef": "a", "outcomeRef": "o",
    }]
    proof["comparisons"] = [{
        "id": "cmp-1", "controlledInputs": True, "blindEvaluation": True,
        "control": {"artifactRef": "c", "curatorScore": 60, "repairRounds": 4, "repeatedCorrections": 10},
        "treatment": {"artifactRef": "t", "curatorScore": 72, "repairRounds": 2, "repeatedCorrections": 2},
        "regressions": 0,
    }]
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "tests/contradiction.json",
        "isolationPassed": True, "isolationRef": "tests/isolation.json",
    }
    assert validate_proof(proof)["level"] == "IMPROVING"
    proof["comparisons"][0]["treatment"]["curatorScore"] = 69
    assert validate_proof(proof)["level"] == "APPLIED"


def test_improving_requires_safeguard_references_and_numeric_counts() -> None:
    proof = base()
    proof["applications"] = [{
        "id": "apply-1", "sourceIds": ["lesson-1"],
        "appliedAt": "2026-07-19T10:00:00Z", "relevance": "Relevant",
        "decisionRef": "d", "artifactRef": "a", "outcomeRef": "o",
    }]
    proof["comparisons"] = [{
        "id": "cmp-1", "controlledInputs": True, "blindEvaluation": True,
        "control": {"artifactRef": "c", "curatorScore": 60, "repairRounds": 4, "repeatedCorrections": 10},
        "treatment": {"artifactRef": "t", "curatorScore": 72, "repairRounds": 2, "repeatedCorrections": 2},
        "regressions": 0,
    }]
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "",
        "isolationPassed": True, "isolationRef": "",
    }
    assert validate_proof(proof)["level"] == "APPLIED"
    proof["safeguards"]["contradictionRef"] = "c.json"
    proof["safeguards"]["isolationRef"] = "i.json"
    proof["comparisons"][0]["control"]["repairRounds"] = True
    assert validate_proof(proof)["level"] == "APPLIED"


def test_diagnostics_name_nested_store_stale_heartbeat_and_corrections(tmp_path: Path) -> None:
    nested = tmp_path / "design" / "design"
    nested.mkdir(parents=True)
    (nested / "memory.events.jsonl").write_text("{}\n", encoding="utf-8")
    design = tmp_path / "design"
    (design / "heartbeat.json").write_text("{}", encoding="utf-8")
    memory = design / "memory"
    memory.mkdir()
    (memory / "figma-corrections.jsonl").write_text(
        json.dumps({"unresolved": True}) + "\n", encoding="utf-8"
    )
    codes = {x["code"] for x in proof_diagnostics(tmp_path)}
    assert codes == {"nested-memory-store", "heartbeat-never-recorded", "unresolved-designer-corrections"}
