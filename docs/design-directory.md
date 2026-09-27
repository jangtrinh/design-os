# The `design/` directory contract

One layout, so an agent, a linter and a person all look in the same place. Check any
project with `ui design lint <project-root>`; the shape of the two JSON files below is
`schemas/design-dir.schema.json`.

## Layout

```text
design/
  tokens.json              the ONE token source, hand-edited
  design-dir.json          optional manifest: token files generated from tokens.json
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
| Exactly one token source: `design/tokens.json`. Any other `tokens.json` or `*.tokens.json` in the project is a finding unless declared derived | error | delete it, or declare it in `design/design-dir.json` |
| Tracked log or cache under `design/` | error | `git rm --cached`, add the pattern to `.gitignore` |
| Art direction outside `design/art-direction/` | error | `git mv` it there |
| Supersession in a decisions file, or prose that says "superseded" without `superseded_by` | error | set `superseded_by` on the ruling, drop the note |
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
