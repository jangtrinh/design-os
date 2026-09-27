"""Every kernel call the run conductor makes, each returned as a timed record.

The conductor never re-implements a check: each function shells out to one ``ui``
subcommand through :func:`design_os.kernel.run_ui` and keeps the parsed envelope. A
missing or crashing kernel surfaces as a record with ``envelope=None`` so the caller can
report it instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from design_os.kernel import run_ui

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Call:
    """One ``ui`` invocation: what ran, when, its exit code and parsed envelope."""

    name: str
    argv: list[str]
    start: str
    end: str
    returncode: int
    envelope: dict[str, Any] | None

    @property
    def data(self) -> dict[str, Any]:
        env = self.envelope or {}
        return env.get("data") or {} if env.get("ok") else {}

    def span(self) -> dict[str, Any]:
        return {"call": self.name, "argv": self.argv, "start": self.start,
                "end": self.end, "exit": self.returncode}


def _call(name: str, argv: list[str], clock: Clock) -> Call:
    start = clock()
    result = run_ui(argv)
    end = clock()
    return Call(name, argv, start.isoformat(), end.isoformat(), result.returncode, result.envelope)


def brief_lint(brief: Path, questions_out: Path, clock: Clock) -> Call:
    return _call("brief lint", ["brief", "lint", str(brief), "--questions", str(questions_out), "--json"], clock)


def gate(html: Path, clock: Clock) -> Call:
    return _call("gate", ["gate", str(html), "--json"], clock)


def trace_summarize(project: Path, clock: Clock) -> Call:
    return _call("trace summarize", ["trace", "summarize", str(project), "--json"], clock)


def knowledge_lint(candidates: Path, project: Path, clock: Clock) -> Call:
    return _call("knowledge lint", ["knowledge", "lint", str(candidates), "--root", str(project), "--json"], clock)


def method_lint(run_json: Path, clock: Clock) -> Call:
    return _call("method lint", ["method", "lint", str(run_json), "--json"], clock)
