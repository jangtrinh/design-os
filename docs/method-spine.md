# Method run: one feature, six steps

`ui method lint <run.json> [--json]` checks a `method-run/1` artifact against
[`method-run.schema.json`](../schemas/method-run.schema.json). The six ordered
steps are `frame`, `define`, `explore`, `decide`, `build`, and `verify`. Each has
`status: done|skipped`, `artifacts[]`, and `needs_humans[]`. A skipped step also
needs `skip_reason: {code, detail}`; use `existing-evidence`, `not-applicable`, `blocked-intake` (the intake receipt is BLOCKED),
or `out-of-scope` with a concrete explanation. `school` is optional vocabulary
(`double-diamond`, `jtbd`, `lean-ux`, `design-sprint`, `none`); it never changes
the steps or their gates.

Each artifact has a `path` and `provenance: observed|synthetic|assumed`.
`define` must reference a readable `brief.json` that passes the installed
`design-brief.schema.json`. Paths resolve relative to `run.json`.
Each human need has a `question` and a D7 `role` (`PM`, `design-lead`, `BA`,
`owner`). When `decide` or `verify` is `done`, each need must also have
`answered_by` and `answered_at` (`YYYY-MM-DD`). An unanswered question is a
blocking finding, not evidence of approval.

## Worked example: LLMGW Usage Management

For the acceptance feature, keep `run.json` beside its validated `brief.json`.
Use the feature's existing evidence to frame the problem. In `define`, link
`brief.json` as `observed`. If the available evidence already covers design
options, record `explore` as skipped with `existing-evidence` and name the
evidence in `detail`; otherwise record the option artifacts. Before marking
`decide` done, capture the real approver's answer and date. Link implementation
evidence under `build` and actual checks under `verify`. Do not mark an
unobserved human review as answered.

```json
{
  "schema": "method-run/1",
  "feature": "EPIC LLMGW Usage Management",
  "school": "none",
  "steps": {
    "frame": { "status": "done", "artifacts": [], "needs_humans": [] },
    "define": { "status": "done", "artifacts": [{ "path": "brief.json", "provenance": "observed" }], "needs_humans": [] },
    "explore": { "status": "skipped", "skip_reason": { "code": "existing-evidence", "detail": "Name the current option evidence here." }, "artifacts": [], "needs_humans": [] },
    "decide": { "status": "done", "artifacts": [], "needs_humans": [] },
    "build": { "status": "done", "artifacts": [], "needs_humans": [] },
    "verify": { "status": "done", "artifacts": [], "needs_humans": [] }
  }
}
```

This is an illustrative shape, not a claim that these steps happened. Replace
the placeholder explanation and empty evidence arrays with the feature's
recorded paths before treating the run as delivery evidence. The text output
shows `✓` for valid done steps, `–` for justified skips, and `✗` for violations;
the command exits 1 when any violation remains. `--json` exposes findings and
counts for automation.
