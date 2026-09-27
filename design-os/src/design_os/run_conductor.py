"""Drive one feature through the six method steps by calling only the ``ui`` binary.

Order: ``brief lint`` (define) → stop if BLOCKED → ``gate`` per screen, ``trace summarize``,
``knowledge lint`` (verify evidence) → write run.json → ``method lint`` on it. Writes
``run.json``, ``k1.json``, ``timeline.json``, ``gates.json`` and ``questions.json`` into the
out dir. No model call, no network.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from design_os import run_kernel_calls as kc
from design_os.run_k1 import build_k1
from design_os.run_steps import STEPS, build_run

_SKIP_DIRS = {"node_modules", ".git", ".venv", "dist"}


@dataclass
class RunResult:
    status: str  # CONTINUE | BLOCKED
    exit_code: int
    questions: list[dict[str, Any]]
    d4: dict[str, Any] = field(default_factory=dict)
    findings: list[str] = field(default_factory=list)
    files: dict[str, str] = field(default_factory=dict)


def _write(path: Path, doc: Any) -> None:
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def find_candidates(project: Path, depth: int = 4) -> Path | None:
    """First ``ruling-candidates.json`` under ``project`` (sorted walk, bounded depth)."""
    root_depth = len(project.parts)
    for cur, dirs, files in os.walk(project):
        dirs[:] = sorted(d for d in dirs if d not in _SKIP_DIRS)
        if len(Path(cur).parts) - root_depth >= depth:
            dirs[:] = []
        if "ruling-candidates.json" in files:
            return Path(cur) / "ruling-candidates.json"
    return None


def _git_head(project: Path) -> str | None:
    if shutil.which("git") is None:
        return None
    proc = subprocess.run(["git", "-C", str(project), "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
    return proc.stdout.strip() or None if proc.returncode == 0 else None


def _rel(path: Path, start: Path) -> str:
    return os.path.relpath(path, start)


def _under_project(path: Path | None, project: Path) -> Path | None:
    """A relative ``--screens``/``--out`` resolves against ``--project``, never the process cwd."""
    if path is None or path.is_absolute():
        return path
    return project / path


def conduct(
    *, brief_path: Path, project: Path, out: Path, screens_dir: Path | None,
    candidates: Path | None, feature: str | None, clock: kc.Clock = kc.utc_now,
) -> RunResult:
    out = _under_project(out, project) or out
    screens_dir = _under_project(screens_dir, project)
    out.mkdir(parents=True, exist_ok=True)
    started = clock().isoformat()
    spans: dict[str, list[dict[str, Any]]] = {s: [] for s in STEPS}
    findings: list[str] = []

    brief = json.loads(brief_path.read_text(encoding="utf-8"))
    (out / "brief.json").write_text(brief_path.read_text(encoding="utf-8"), encoding="utf-8")
    lint = kc.brief_lint(out / "brief.json", out / "questions.json", clock)
    spans["define"].append(lint.span())
    if lint.envelope is None or not lint.envelope.get("ok"):
        message = ((lint.envelope or {}).get("error") or {}).get("message", "ui brief lint produced no envelope")
        return RunResult("ERROR", 1, [], {}, [f"brief lint failed: {message}"])
    d4 = lint.data["d4"]
    blocked = d4["decision"] == "BLOCKED"
    questions = json.loads((out / "questions.json").read_text(encoding="utf-8")).get("questions", [])

    screens = sorted(screens_dir.glob("*.html")) if screens_dir and not blocked else []
    gate_rows: list[dict[str, Any]] = []
    trace = None
    evidence: list[str] = []
    cand_path = candidates or (find_candidates(project) if not blocked else None)
    if not blocked:
        for html in screens:
            g = kc.gate(html, clock)
            spans["verify"].append(g.span())
            d = g.data
            gate_rows.append({"screen": html.stem, "file": str(html), "pass": bool(d.get("pass")),
                              "errors": d.get("errorCount"), "warnings": d.get("warningCount"),
                              "advisories": d.get("advisoryCount")})
        if gate_rows:
            _write(out / "gates.json", {"screens": gate_rows})
            evidence.append("gates.json")
        if (project / ".design-os" / "trace" / "reads.jsonl").is_file():
            t = kc.trace_summarize(project, clock)
            spans["verify"].append(t.span())
            trace = t.data or None
            _write(out / "trace-summary.json", trace or {})
            evidence.append("trace-summary.json")
        if cand_path is not None:
            k = kc.knowledge_lint(cand_path, project, clock)
            spans["verify"].append(k.span())
            evidence.append(_rel(cand_path, out))
            errs = [f for f in k.data.get("findings", []) if f.get("severity") == "error"]
            findings += [f"ruling candidates: {f.get('message')}" for f in errs]
            if k.envelope is None or not k.envelope.get("ok"):
                findings.append("ruling candidates: knowledge lint produced no result")
    findings += [f"gate red: {r['screen']}" for r in gate_rows if not r["pass"]]

    name = feature or str(brief.get("rawRequest", "unnamed feature"))[:80]
    run_doc = build_run(feature=name, brief=brief, blocked=blocked, questions=questions,
                        screens=[_rel(s, out) for s in screens], evidence=evidence)
    _write(out / "run.json", run_doc)
    m = kc.method_lint(out / "run.json", clock)
    spans["verify"].append(m.span())
    if m.returncode != 0:
        findings.append(f"method lint exit {m.returncode}")

    passing = [r["screen"] for r in gate_rows if r["pass"]]
    _write(out / "k1.json", build_k1(feature=name, base=_git_head(project), screens=[r["screen"] for r in gate_rows] or [s.stem for s in screens],
                                     passing=passing, d4=d4, question_count=len(questions), trace=trace))
    _write(out / "timeline.json", {"started": started, "finished": clock().isoformat(), "steps": [
        {"step": s, "status": run_doc["steps"][s]["status"], "calls": spans[s],
         "start": spans[s][0]["start"] if spans[s] else None, "end": spans[s][-1]["end"] if spans[s] else None}
        for s in STEPS]})
    files = {n: str(out / n) for n in ("run.json", "k1.json", "timeline.json", "questions.json")}
    if blocked:
        return RunResult("BLOCKED", 2, questions, d4, findings, files)
    return RunResult("CONTINUE", 1 if findings else 0, questions, d4, findings, files)
