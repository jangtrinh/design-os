# The `design/` directory contract

One layout, so an agent, a linter and a person all look in the same place. Check any
project with `ui design lint <project-root>`; the shape of the two JSON files below is
`schemas/design-dir.schema.json`.

## Layout

```text
design/
  tokens.json              the ONE token source, hand-edited
  design-dir.json          optional manifest: derived token files; owner rulings at version 2
  soul.md                  stance: Never / Always / Voice
  principles.md            why: `### <ID> · <title>` with Yields when + Test bullets
  principles.json          machine index of principles.md (emitted, never hand-edited)
  art-direction/           art direction documents (not docs/)
  knowledge/
    rulings.json           case law; the ONLY place supersession is recorded
    ksync/                 Figma ↔ code pins and drift
```

Logs and caches under `design/` (`*.jsonl`, `*.jsonl.N`, `*.changes.*`, `cache/`) are
gitignored — never committed. Ingest outputs (`DESIGN.md`, the component registry) are
re-generated from `design/ds.json`, so they are never older than it by more than 14 days.

## Rules

| Rule | Severity | Fix |
|------|----------|-----|
| Exactly one token source: `design/tokens.json`. Any other `tokens.json` or `*.tokens.json` in the project is a finding (`extra-token-file`) unless declared derived. Once `design/ds.manifest.json` exists, `design/design.tokens.json` is the store `ui ds` sealed and is not reported | error | delete it, or declare it in `design/design-dir.json` |
| `design/design.tokens.json` and `design/tokens.json` both exist and their token sets differ (`two-token-sources`; one finding, with both token counts). A file declared derived is exempt, equal sets are silent | error | answer the source-authority question (`ui onboard questions`), or keep one source: delete one of the two files, or declare `design/design.tokens.json` derived in `design/design-dir.json` |
| Tracked log or cache under `design/` | error | `git rm --cached`, add the pattern to `.gitignore` |
| Art direction outside `design/art-direction/` | error | `git mv` it there |
| Supersession in a decisions file (`supersession-outside-rulings`: any line containing "supersed") | error | set `superseded_by` on the ruling, drop the note |
| A ruling whose text **starts with** a `(SUPERSEDED …)` marker but has no `superseded_by` (`supersession-not-in-field`). The marker is the one `knowledge/ds-guidelines.md` defines (`parseSupersededMarker`): active voice ("this supersedes R-1"), a mention elsewhere in the text, and `(PARTIALLY SUPERSEDED …)` are not markers | error | set `superseded_by` to the replacing ruling id, drop the marker |
| `principles.md` without a current `principles.json` | error | `ui design principles-index` |
| `design/tokens.json` missing | error | create it |
| `soul.md`, `principles.md`, `knowledge/rulings.json` missing | warning | add it |
| Untracked log that is not yet gitignored | warning | add the pattern to `.gitignore` |
| `DESIGN.md` or the registry older than `design/ds.json` by more than 14 days | warning | re-run the ingest |

Exit code 1 means at least one error. Warnings never fail the run.

## Declaring a derived token file

```json
{ "version": 1, "derived": [ { "path": "design/design.tokens.json", "derived_from": "design/tokens.json" } ] }
```

## Owner rulings (manifest version 2)

When a command meets something it cannot resolve on its own (a collision, an ambiguous role, a truncated scan), it writes
nothing, exits 1 and leaves the open questions in `.design-os/onboard/pending.json` (transient, never a ruling). Read them
with `ui onboard questions`; record the owner's answers with `ui onboard answer --file <answers.json> [--now <iso>]`. Each
answer becomes a ruling under `onboard.rulings` in `design/design-dir.json`, which is then version 2:

```json
{ "version": 2,
  "derived": [ { "path": "design/design.tokens.json", "derived_from": "design/tokens.json" } ],
  "onboard": { "rulings": [ { "kind": "scan-budget", "fingerprint": "<64 lowercase hex>", "choice": "skip-generated",
                              "covers": ["generated"], "actor": "owner", "at": "2026-11-10T14:00:00.000Z" } ] } }
```

Version 1 files stay valid and read as "no rulings"; `onboard` is accepted only at version 2. `covers` lists the members the
answer ruled on; a later run asks only about the members no ruling covers, and when two rulings of a kind cover one member
the later ruling in the file governs it. A ruling of a multi-select kind always carries `members`, a keep or drop entry for
every covered member; no reader interprets option ids. `actor` is always `owner`. `ui onboard` shows the state in its
`owner rulings` row.

A multi-select question spends all of its (at most four) option slots on members or groups of members; deciding member by
member is never an option but is always accepted: answer `"choice": ["review-individually"]` with a `members` map of
`keep` or `drop` for exactly the question's members. An option that selects no member may be chosen only on its own. A
single-choice ruling that chose `review-individually` must carry the `members` map, and no member may map to it.

A single-choice question is in one of two modes. In the plain mode every member takes the chosen option id. In the
assigned mode (the Figma ingest's collision, duplicate-name and skipped-variable questions) the question carries
`memberChoices` (per member, the outcomes it may take, each `{ id, label }`) and every option except
`review-individually` carries `assigns` (the outcome each member takes under that option). Choosing such an option records
its `assigns` as the ruling's `members` map; `review-individually` takes a `members` map whose every value is one of that
member's own choices (anything else is `BAD_ANSWER`). A question that mixes the two modes is refused when it is built and
when `pending.json` is read, and a multi-select question carries neither field. A ruling therefore names what it keeps by
id (`keep:<variableId>`, `keep:<nodeId>`), never by position or by a name that can change, and `outcomeOf` stays the only
reader. A question may also carry `labels` (a display name per member): every place that prints a member prints
`label (id)`.

A variable that aliases the variable on its own token path (another collection, same path) is a member of the collision
but can never keep the path: its member offers only the variable it aliases and `keep-none`, its label says what it
aliases, and it does not make two collections collide for the collections question. The ingest does not flatten such a
variable: when it carries other modes, they leave with it, counted and named under the `path-collision` reason.

`ui onboard` does not run the Figma ingest's detectors, so it never reports an ingest ruling as stale; the ingest
replaces its own stored questions on every run.

Each stored question records the command that raised it. Every run of a command that can block replaces the questions
that command raised with what it finds now (a project-level question is replaced by whichever command ran its detector),
and removes the file, and its `onboard/` directory when empty, once nothing is left; a question another command raised
stays, even when both raise the same kind. `ui onboard questions` does the same before it reports that nothing is pending.
`ui onboard` only reads, and reports a detector that throws in its `owner rulings` row (not ready, exit 0); every command
that writes lets such an exception propagate; `ui onboard answer` runs the detectors before it validates or records
anything, so the manifest and the pending file stay untouched. A stored question that names no command is refused like
any other malformed one. An answer file is validated as a whole: the answer check of a kind sees every ruling already
recorded plus every answer of the file, so the order of the answers does not matter.

Writing a ruling means the file is re-serialised as 2-space JSON with a final newline: formatting is not preserved, but key order is,
and every key other than `version` and `onboard` keeps its value. The manifest has one writer at a time; there is no lock,
so do not run two `ui onboard answer` calls against one project at once.

`pending.json` sits in your project next to the manifest and is as trusted as the manifest. It is validated in full against
corruption and accidental hand edits (a malformed file is refused with `BAD_PENDING`, never silently ignored); option ids
are not signed and no digest is kept.

## The principles index

```sh
ui design principles-index design/principles.md --out design/principles.json          # write
ui design principles-index design/principles.md --out design/principles.json --check  # CI: exit 1 on drift
```

Each entry is `{ id, title, yields_when, test }` in document order. Headings without an id
(worked examples, section titles) are skipped. An entry missing either bullet, or a repeated
id, fails the emit with `BAD_PRINCIPLES`.

## Notes

- Outside a git repository the lint walks the tree and skips the tracked-file check (it says so).
- Staleness compares file modification times against each other, never against the clock, so the
  verdict does not change with the day you run it. A fresh clone resets mtimes; run it where the
  ingest ran.
