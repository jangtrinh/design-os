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


def application() -> dict[str, object]:
    return {
        "id": "apply-1", "sourceIds": ["lesson-1"],
        "appliedAt": "2026-07-19T10:00:00Z", "relevance": "Relevant",
        "decisionRef": "d", "artifactRef": "a", "outcomeRef": "o",
    }


def three_case_suite() -> list[dict[str, object]]:
    return [
        {
            "id": "cmp-promotion", "category": "promotion", "controlledInputs": True, "blindEvaluation": True,
            "control": {"artifactRef": "c1", "curatorScore": 60, "repairRounds": 4, "repeatedCorrections": 10},
            "treatment": {"artifactRef": "t1", "curatorScore": 76, "repairRounds": 1, "repeatedCorrections": 1},
            "regressions": 0,
        },
        {
            "id": "cmp-native-mobile", "category": "native-mobile", "controlledInputs": True, "blindEvaluation": True,
            "control": {"artifactRef": "c2", "curatorScore": 62, "repairRounds": 4, "repeatedCorrections": 10},
            "treatment": {"artifactRef": "t2", "curatorScore": 74, "repairRounds": 1, "repeatedCorrections": 1},
            "regressions": 0,
        },
        {
            "id": "cmp-architecture", "category": "architecture", "controlledInputs": True, "blindEvaluation": True,
            "control": {"artifactRef": "c3", "curatorScore": 58, "repairRounds": 4, "repeatedCorrections": 10},
            "treatment": {"artifactRef": "t3", "curatorScore": 70, "repairRounds": 1, "repeatedCorrections": 1},
            "regressions": 0,
        },
    ]


def test_improving_requires_control_thresholds_and_safeguards() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "tests/contradiction.json",
        "isolationPassed": True, "isolationRef": "tests/isolation.json",
    }
    assert validate_proof(proof)["level"] == "IMPROVING"
    proof["comparisons"] = proof["comparisons"][:2]
    result = validate_proof(proof)
    assert result["level"] == "APPLIED"
    assert any(x["code"] == "suite-below-improving-bar" for x in result["findings"])


def test_improving_requires_safeguard_references_and_numeric_counts() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "",
        "isolationPassed": True, "isolationRef": "",
    }
    assert validate_proof(proof)["level"] == "APPLIED"
    proof["safeguards"]["contradictionRef"] = "c.json"
    proof["safeguards"]["isolationRef"] = "i.json"
    proof["comparisons"][0]["control"]["repairRounds"] = True
    assert validate_proof(proof)["level"] == "APPLIED"


def test_suite_requires_two_categories() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    for cmp in proof["comparisons"]:
        cmp["category"] = "promotion"
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "c.json",
        "isolationPassed": True, "isolationRef": "i.json",
    }
    result = validate_proof(proof)
    assert result["level"] == "APPLIED"
    assert any(x["code"] == "suite-below-improving-bar" and "categor" in x["message"] for x in result["findings"])


def test_suite_requires_every_case_to_win() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    proof["comparisons"][2]["treatment"]["curatorScore"] = proof["comparisons"][2]["control"]["curatorScore"]
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "c.json",
        "isolationPassed": True, "isolationRef": "i.json",
    }
    assert validate_proof(proof)["level"] == "APPLIED"


def test_mean_delta_gate_not_per_case() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "c.json",
        "isolationPassed": True, "isolationRef": "i.json",
    }
    deltas_passing = [16, 16, 4]
    for cmp, delta in zip(proof["comparisons"], deltas_passing):
        cmp["treatment"]["curatorScore"] = cmp["control"]["curatorScore"] + delta
    assert validate_proof(proof)["level"] == "IMPROVING"

    deltas_failing = [12, 12, 3]
    for cmp, delta in zip(proof["comparisons"], deltas_failing):
        cmp["treatment"]["curatorScore"] = cmp["control"]["curatorScore"] + delta
    assert validate_proof(proof)["level"] == "APPLIED"


def test_zero_denominator_repair_is_not_improvement() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    for cmp in proof["comparisons"]:
        cmp["control"]["repairRounds"] = 0
        cmp["treatment"]["repairRounds"] = 0
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "c.json",
        "isolationPassed": True, "isolationRef": "i.json",
    }
    result = validate_proof(proof)
    assert result["level"] == "APPLIED"
    assert result["suite"]["repairReduction"] is None
    assert any(x["code"] == "suite-below-improving-bar" for x in result["findings"])


def test_aggregate_reduction_thresholds() -> None:
    proof = base()
    proof["applications"] = [application()]
    proof["comparisons"] = three_case_suite()
    proof["safeguards"] = {
        "contradictionPassed": True, "contradictionRef": "c.json",
        "isolationPassed": True, "isolationRef": "i.json",
    }
    # aggregate repair reduction 24% (below the 25% bar): control 100, treatment 76.
    rounds = [{"control": 34, "treatment": 26}, {"control": 33, "treatment": 25}, {"control": 33, "treatment": 25}]
    for cmp, r in zip(proof["comparisons"], rounds):
        cmp["control"]["repairRounds"] = r["control"]
        cmp["treatment"]["repairRounds"] = r["treatment"]
    result = validate_proof(proof)
    assert result["level"] == "APPLIED"
    assert round(result["suite"]["repairReduction"], 2) == 0.24

    # aggregate repeated-correction reduction 69% (below the 70% bar): control 100, treatment 31.
    proof2 = base()
    proof2["applications"] = [application()]
    proof2["comparisons"] = three_case_suite()
    proof2["safeguards"] = proof["safeguards"]
    corrections = [{"control": 34, "treatment": 11}, {"control": 33, "treatment": 10}, {"control": 33, "treatment": 10}]
    for cmp, r in zip(proof2["comparisons"], corrections):
        cmp["control"]["repeatedCorrections"] = r["control"]
        cmp["treatment"]["repeatedCorrections"] = r["treatment"]
    result2 = validate_proof(proof2)
    assert result2["level"] == "APPLIED"
    assert round(result2["suite"]["repeatedReduction"], 2) == 0.69


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
