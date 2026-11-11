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
  ds.json                  the Figma scan (figma-agent scan-design-system), read by the ontology
  conventions.json         measured conventions in machine form (ui synthesize-conventions), emitted
  knowledge/
    rulings.json           case law; the ONLY place supersession is recorded
    ontology.json          the design ontology (ui ontology build), emitted, never hand-edited
    screens.meta.json      optional: apps, features and screen metadata supplied by the project
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

## The design ontology

```sh
ui ontology build [--dir <project>] [--out design/knowledge/ontology.json] [--json]
ui ontology lint  [--dir <project>] [--file design/knowledge/ontology.json] [--strict] [--json]
```

`design/knowledge/ontology.json` (`design-os-ontology/1`, `schemas/ontology.schema.json`) is one knowledge graph of the
project, emitted and never hand-edited. It has no timestamp and no absolute path: the same tree gives the same bytes from
any checkout. `ui ontology lint` fails on a link whose target does not exist, a duplicate node id and a stale file (it
re-emits in memory and compares bytes); orphans (no link, not standalone) are warnings and errors under `--strict`;
the kind coverage table (`nodes`, `linked`, `orphan`, `standalone`, `source missing`) and the link reports (`written`,
`unresolved`, `not sensed`, `not checked`, and the owner-ruled pairs no candidate matches; `--json`: `linkReports`) are
always printed. An open question the build depends on is an error that names `ui onboard questions`, for every kind.
`--out` and `--file` must name a file inside the project (real paths are compared, so a symbolic link that points outside is refused). The `screen` source keeps one status per door (`doors`), so a
Figma scan never sensed for frames stays `not-sensed` next to a code door that was read. Project structure is never an
orphan: the `project` node and the `gate` nodes belong to the kernel.

Sources, each read only from its own path under the project:

| Kind | Source | Produced by |
|---|---|---|
| `token` | the sealed token store, `design/design.tokens.json` | `ui ds import`, `ui ingest-figma-ds` |
| `component` | the sealed registry, `design/component-registry.json` | `ui ds import --registry`, `ui ds surface --register` |
| `screen` | Figma: the frames of the pages the `screen-pages` ruling kept, in `design/ds.json`; code: the page files of the surface, built in memory | `figma-agent scan-design-system --out design/ds.json`; `ui ds surface` |
| `rule` | a ratified `design/soul.md` (`## Never`, `## Always`), `design/rules/_adherence.rules.json`, `design/conventions.json` | `ui ds soul`, `ui ds harvest-bans --accept`, `ui synthesize-conventions` |
| `gate` | the gate families and check catalog of the kernel | the kernel |
| `ruling`, `principle`, `term`, `pattern`, `app`, `feature` (optional) | `design/knowledge/rulings.json`, `design/principles.json`, `**Term**:` entries of `CONTEXT.md`, `design/patterns/*.md`, `design/knowledge/screens.meta.json` | the project |

A source that is absent contributes zero nodes and one line of the summary; a source that exists and cannot be read is
refused by name (`ONTOLOGY_BAD_SOURCE`); a store that drifted from its seal is refused (`DS_TAMPERED`). Proposed rules
(`_adherence.proposed.json`, `## Never (proposed)`) and a draft soul are not nodes: the summary counts them.

A node id is `<kind>:<key>` and the key survives a reordering of its source: a token's path, a registry record's name, a
Figma frame's node id, a page file's project-relative path, an adherence rule's own id, a gate family's name. A soul rule
has no id of its own: its key is its section and the first 12 hex characters of the SHA-256 of its text with whitespace
collapsed (`rule:soul:never:2f3642b671e3`). No id and no field holds a line number, an absolute path or a time.

A link is exact or it is asked. `uses-component` resolves by identity: the instances of a frame (an id or a key), closed
over `components[].instances`, against the registry (the registry records a Figma component under the name the ingest
derived from the node, with the ingest's own function and flags, so a component kept as deprecated ties and a node whose
derived name is shared or was renamed ties to nothing); a code screen's imports against the record's code reference. Only
a record the Figma ingest wrote (it writes no provenance, so also one the owner linked to code) takes part in the Figma
bridge: a component found in one door is never linked by name alone to a record of the other door, `component-source-match`
is the question that links them, and an instance that matches only a record registered from code is `unresolved` with its
own count line. Known limits: a component the owner renamed through the duplicate-names ruling does not tie (counted), and
a new component that reuses a retired name ties to the old record until the ingest records a Figma identity. A reference that matches nothing is counted `unresolved`; a link whose source the
host never sensed (a scan without frames or bindings, or with `sensing.status = "skipped"`) is counted `not-sensed`, with
the command that would sense it. `checked-by` comes from one table in `src/core/ontology/gate-table.ts`: only promoted
`token-ban` rules are evaluated by a gate (`ds-usage`); every other rule is counted as not checked. A glossary term named
like a node (the registry's name normalisation: case and spacing, nothing else) raises one `inferred-links` question; only
an owner answer writes the `defines` link, and `standalone` marks the term as not an orphan. An open question blocks the
write (`ONBOARD_BLOCKED_NEEDS_OWNER_RULING`, nothing written, the summary still shown). A node no candidate covers raises
no question and stays an orphan; the summary counts those per kind, and says how many of them had a reference counted as
unresolved or not understood (`withCountedReference` in the file, "see the ruling source line" in the text).

`screens.meta.json` (`screens-meta/1`) is supplied by a project, and the kernel reads these fields and ignores the rest:
`{ "schema": "screens-meta/1", "at", "screens": { "<screen id>": { "name", "app", "feature", "figmaId", "kind", "page",
"purpose", ... } }, "unassigned": [{ "app", "figmaId", "reason" }] }`. `app` nodes are the distinct `app` values and
`feature` nodes are the distinct (`app`, `feature`) pairs, keyed `feature:<app>/<feature>` (`%` and `/` are encoded as `%25` and `%2F` inside each part); `belongs-to` runs feature to
app to project. An entry ties to a screen node only when its `figmaId` equals the node id of a Figma frame that is a
screen node (exact, never by name): the screen then belongs to the entry's feature (to its app when it names no feature)
and the entry's strings `name`, `kind`, `page` and `purpose` become the node's `meta`. An entry that ties to no screen
node is counted `unresolved` under `belongs-to` and still contributes its app and feature. `unassigned` and the entries
without an `app` are counted in the source line; `at` is not copied (the ontology carries no time). A file that declares
the schema and cannot be read in this shape (`screens` not an object, an entry not an object, `unassigned` not a list) is
refused by name (`ONTOLOGY_BAD_SOURCE`), never read as "0 apps".
Every ring-2 source accounts for what it met: each report carries `seen` (entries) and `leftOut` (reason to count; in the
file, in `--json`, and printed under the source line when above 0). A value of the wrong type is counted and never read
as another meaning: `feature: 42` gives the screen no parent, while an entry with no `feature` key at all belongs to its
app. A `figmaId` claimed by more than one entry ties none of them. An unknown key inside a ruling's `scope` is counted. A value that names a target already linked (the same app twice, two
scope names that resolve to one screen, one mention written twice) is one link and is counted under "repeated value"; a
ruling whose `superseded_by` names itself gets no link and is counted under "names itself".

`design/conventions.json` (`design-os-conventions/1`) is written by `ui synthesize-conventions` together with
`CONVENTIONS.md`. The Markdown is a pure render of the JSON, so `ui ontology lint` compares a render of the JSON with the
Markdown on disk (`CONVENTIONS_PAIR_DRIFT`). The `rule` nodes with `origin: "convention"` and the counts they were measured
on are derived from its `totals` by one function; the stored `rules` list is never trusted, and a list that differs from
the derived one is the same drift. Conventions are read only as a consistent pair: while the stored rules or the Markdown
differ from what the totals give, `ui ontology build` refuses with `CONVENTIONS_PAIR_DRIFT` and writes nothing. Known limit:
a pair forged consistently (totals, rules and Markdown edited to agree) cannot be detected without the usage-dna.

## Notes

- Outside a git repository the lint walks the tree and skips the tracked-file check (it says so).
- Staleness compares file modification times against each other, never against the clock, so the
  verdict does not change with the day you run it. A fresh clone resets mtimes; run it where the
  ingest ran.
