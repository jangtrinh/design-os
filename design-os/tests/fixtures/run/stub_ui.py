"""Stand-in `ui` for the run-conductor tests: canned envelopes keyed on the subcommand.

A brief whose JSON has "blocked": true lints BLOCKED (exit 2); an HTML file containing
RED-GATE fails the gate; a ruling-candidates file containing DEAD-ANCHOR lints with an error.
"""
import json, sys
from pathlib import Path

a = sys.argv[1:]
def out(cmd, data, rc=0):
    print(json.dumps({"ok": True, "command": cmd, "data": data})); sys.exit(rc)

if a[:2] == ["brief", "lint"]:
    brief = json.loads(Path(a[2]).read_text())
    blocked = bool(brief.get("blocked"))
    q = [{"id": "q1", "field": "surface", "question": "Which surface is this?"}] if blocked else []
    d4 = {"B": 3 if blocked else 0, "R": blocked, "L": 0, "decision": "BLOCKED" if blocked else "CONTINUE",
          "blocking": ["surface"] if blocked else []}
    Path(a[a.index("--questions") + 1]).write_text(json.dumps({"kind": "brief-questions", "d4": d4, "questions": q}))
    out("brief lint", {"d4": d4, "questionCount": len(q)}, 2 if blocked else 0)
if a[0] == "gate":
    red = "RED-GATE" in Path(a[1]).read_text()
    out("gate", {"pass": not red, "errorCount": 1 if red else 0, "warningCount": 0, "advisoryCount": 0}, 1 if red else 0)
if a[:2] == ["trace", "summarize"]:
    out("trace summarize", {"bytesBeforeFirstMutate": 100, "firstMutation": {"kind": "Write"},
                            "esDesignerLoaded": True, "esDesignerChecklistRan": True, "gateRuns": 3})
if a[:2] == ["knowledge", "lint"]:
    bad = "DEAD-ANCHOR" in Path(a[2]).read_text()
    out("knowledge lint", {"findings": [{"severity": "error", "message": "dead anchor"}] if bad else []}, 1 if bad else 0)
if a[:2] == ["method", "lint"]:
    run = json.loads(Path(a[2]).read_text())
    ok = list(run["steps"]) == ["frame", "define", "explore", "decide", "build", "verify"]
    out("method lint", {"findings": [], "errorCount": 0}, 0 if ok else 1)
sys.exit(3)
