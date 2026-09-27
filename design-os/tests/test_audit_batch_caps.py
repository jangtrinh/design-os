"""``audit_batch.caps`` — load+validate the frozen caps file. Every malformed shape names the
exact reason (acceptance §W10b A4: "caps exceeded → fail-closed with the cap named" starts
here — a cap that cannot even be loaded correctly is the first fail-closed gate).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from design_os.commands.audit_batch import Caps, CapsError, load_caps

VALID = {"maxPages": 10, "maxSecondsPerPage": 30, "totalBudgetSeconds": 300}


def _write(tmp_path: Path, doc: object) -> Path:
    p = tmp_path / "caps.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    return p


def test_valid_caps_load(tmp_path: Path) -> None:
    caps = load_caps(_write(tmp_path, VALID))
    assert caps == Caps(max_pages=10, max_seconds_per_page=30.0, total_budget_seconds=300.0)


def test_missing_file_is_caps_error(tmp_path: Path) -> None:
    with pytest.raises(CapsError, match="not found"):
        load_caps(tmp_path / "nope.json")


def test_invalid_json_is_caps_error(tmp_path: Path) -> None:
    p = tmp_path / "caps.json"
    p.write_text("{not json", encoding="utf-8")
    with pytest.raises(CapsError, match="not valid JSON"):
        load_caps(p)


def test_non_object_is_caps_error(tmp_path: Path) -> None:
    with pytest.raises(CapsError, match="must be a JSON object"):
        load_caps(_write(tmp_path, [1, 2, 3]))


def test_missing_key_named(tmp_path: Path) -> None:
    doc = dict(VALID)
    del doc["maxSecondsPerPage"]
    with pytest.raises(CapsError, match="missing required key.*maxSecondsPerPage"):
        load_caps(_write(tmp_path, doc))


def test_unknown_key_named(tmp_path: Path) -> None:
    doc = dict(VALID)
    doc["bogus"] = 1
    with pytest.raises(CapsError, match="unknown key.*bogus"):
        load_caps(_write(tmp_path, doc))


@pytest.mark.parametrize("key", ["maxPages", "maxSecondsPerPage", "totalBudgetSeconds"])
def test_non_positive_value_named(tmp_path: Path, key: str) -> None:
    doc = dict(VALID)
    doc[key] = 0
    with pytest.raises(CapsError, match=f"'{key}' must be a positive number"):
        load_caps(_write(tmp_path, doc))


@pytest.mark.parametrize("key", ["maxPages", "maxSecondsPerPage", "totalBudgetSeconds"])
def test_non_numeric_value_named(tmp_path: Path, key: str) -> None:
    doc = dict(VALID)
    doc[key] = "ten"
    with pytest.raises(CapsError, match=f"'{key}' must be a positive number"):
        load_caps(_write(tmp_path, doc))


def test_boolean_value_rejected(tmp_path: Path) -> None:
    doc = dict(VALID)
    doc["maxPages"] = True
    with pytest.raises(CapsError, match="'maxPages' must be a positive number"):
        load_caps(_write(tmp_path, doc))


def test_max_pages_must_be_whole_number(tmp_path: Path) -> None:
    doc = dict(VALID)
    doc["maxPages"] = 1.5
    with pytest.raises(CapsError, match="'maxPages' must be a whole number"):
        load_caps(_write(tmp_path, doc))


def test_checked_in_caps_file_is_valid() -> None:
    """The frozen caps file this repo ships (design-os/caps/audit-batch.caps.json) loads clean."""
    repo_caps = Path(__file__).resolve().parents[1] / "caps" / "audit-batch.caps.json"
    caps = load_caps(repo_caps)
    assert caps.max_pages > 0
    assert caps.max_seconds_per_page > 0
    assert caps.total_budget_seconds > 0
