/** Help text of `ui onboard` and its subcommands. */
export const ONBOARD_HELP = `ui onboard — this project's setup checklist and what to do next

Usage:
  ui onboard [status] [--cwd <project-dir>] [--no-banner] [--json]
  ui onboard questions [--cwd <project-dir>] [--format claude|markdown|json] [--round <n>] [--json]
  ui onboard answer --file <answers.json> [--now <iso>] [--cwd <project-dir>] [--json]

Subcommands:
  status     The setup checklist (the default). Reads the filesystem only; never writes, never
             installs. Reports which setup steps are done, which are missing, and the exact
             command to fix each one, including the \`owner rulings\` row: none needed,
             N pending, or M recorded and K stale, with the questions-to-ready count.
  questions  Detects the project-level anomalies, merges them with what a blocked command left in
             .design-os/onboard/pending.json, drops what a stored ruling already covers, writes
             pending.json and prints the open questions. 'claude' emits the AskUserQuestion payload
             (max 4 questions per round, 2-4 options, multiSelect for set-valued kinds), 'markdown'
             a sheet a team can answer asynchronously, 'json' (default) the clusters as stored.
  answer     Records the owner's choices as rulings in design/design-dir.json (schema version 2).
             answers.json: { "answers": [ { "fingerprint": "...", "choice": "id" | ["id", ...],
             "members": { "<member>": "<id>" } } ] }. It has no interactive mode and reads no TTY.

Options:
  --cwd <path>   Project directory (default: current working directory)
  --no-banner    Omit the wordmark banner from the status text output
  --format <f>   questions output: claude | markdown | json
  --round <n>    questions: which round of 4 questions to emit (claude format, default 1)
  --file <path>  answer: the answers file
  --now <iso>    answer: UTC ISO-8601 instant recorded on each ruling (default: the current time)
  --json         Emit a JSON envelope instead of human-readable output
  -h, --help     Show this help

A command that meets an anomaly it cannot resolve from a ruling writes nothing and exits 1; the
questions are then asked with 'ui onboard questions' and recorded with 'ui onboard answer'.

Exit codes:
  status     0 always (informational — read \`ready\` in --json mode, or the header verdict)
  questions  0 questions emitted · 1 error
  answer     0 rulings recorded · 1 refused, nothing written

Error codes:
  BAD_ARG | UNKNOWN_FLAG | FILE_NOT_FOUND | WRITE_ERROR | BAD_MANIFEST | BAD_PENDING (questions, answer)
  (BAD_PENDING: pending.json is malformed; it is transient and safe to delete, then run 'ui onboard questions')
  NO_PENDING_QUESTIONS (questions) · STALE_ANSWER | BAD_ANSWER | DANGLING_AFTER_SELECTION (answer)
`;
