---
id: ds-guidelines
description: "The design-system guidelines pack — what `ui ds guidelines` compiles, ruling tiers, slots, the seal, and the Figma bundle with its limits."
when: [guidelines, design-guidelines, figma-guidelines, rulings, scenario-slots, upload, ruling-tiers, allow-unsealed]
---

# DS Guidelines Pack — written rules an agent can follow

## Purpose

Explain what `ui ds guidelines build | check | export` produces, which inputs it reads, and the
rules that keep it honest, so a host model (or a person) can run the loop in
`templates/workflows/guidelines.md` without guessing.

## Mental Model

A design system tells an agent **what exists** (tokens, components, variants). It cannot tell
the agent **how the team uses it**: which of two look-alike components to pick, which colour pairs
are forbidden, which owner rulings are not negotiable, what the team's own words mean. The pack is
that missing layer, compiled from evidence the project already owns.

The binary writes **facts** and leaves **questions**. It never calls a model and never writes an
answer. The host answers the questions; the binary checks the answers. Reading the pack as if the
binary had judged anything is the main way to misuse it.

## When to Use / When NOT

**Use** it when an owner wants written design guidelines for a project whose design system is sealed
(`ui ds init` / `ui ds import` / a kit), or wants the Figma guidelines bundle for a library.

**Do NOT** use it to rename or add tokens or components (it only reads them), to claim accessibility
compliance (the colour-pair facts cover declared token pairs only), or to upload anything: Figma
exposes no API for guidelines files during its beta, so upload is a manual step by the owner.

## What the pack contains

`design/guidelines/` after `ui ds guidelines build` (a file appears only when it has content):

| File | Content | Comes from |
|---|---|---|
| `overview.md` | design-system identity, file index, a capped stance summary | manifest, `design/soul.md` |
| `vocabulary.md` | colour roles mapped to the project's OWN token names, colour pairs below AA, every non-colour scale | tokens, baked roles, `ui ds a11y` core |
| `components.md` | components by category with variants and states, look-alike names | registry |
| `rulings.md`, `apps/<app>.md` | owner rulings by tier | rulings file |
| `terminology.md` | canonical terms with definitions and the words to avoid | `CONTEXT.md`, `ontology/glossary.yaml` |
| `grammar.md` | the measured DO/DON'T lines, copied verbatim | `CONVENTIONS.md` |
| `anti-patterns.md` | scenario slots and the measured gaps | rulings, conventions, persona, gaps |
| `guidelines.manifest.json` | every rule with its sources, hashes, counts, skipped sources, stale files, seal | generated |
| `guidelines.answers.json` | the durable copy of every host answer, by slot id (appears with the first answer; never exported) | host answers |
| `guidelines.orphans.md` | answers whose slot no longer exists, and answers that lost to another text (only when there are some) | host answers |

Names are written as **explicit spans** — `` `token:color.surface-base` ``, `` `component:Button/Primary` ``,
`` `term:Space` `` — and the linter reads only those spans. An ordinary code span is never judged;
an unknown span is `UNKNOWN_NAME` with `file:line`. The project's own names always win: the pack
maps roles onto them and never renames anything.

Facts sit inside **generated blocks** (`<!-- ds-guidelines:generated id=… sha=… -->`). Editing a block
is `GENERATED_BLOCK_TAMPERED`: ALLOWED is rebuilding, NOT ALLOWED is hand-editing, because the
block's sha is what proves the facts still come from the sealed store.

## Sources and readers

Every optional input is read by a restricted, deterministic reader. An absent input is listed under
`skippedSources` in the manifest, never an error; an input the reader cannot understand is skipped with
a reason, never half-read.

- **Rulings** — `design/knowledge/rulings.json` or `--rulings <file>`: `{ rulings: [{ id, category,
  text, scope, source[], since }] }`, `scope` being `"global"` or `{ apps: [...] }`. A ruling whose text
  starts with `(SUPERSEDED …)` (any shape: `<date> by <id>`, `<date> — do not follow`, `in part by <id> — <note>`;
  any case; up to its matching `)`) is superseded. The word elsewhere in a text is a mention, not a marker.
  A malformed file is `BAD_RULINGS`.
- **Glossary** — `CONTEXT.md` (entries `**Term**:` in its Language section, an optional `_Avoid_:` line) and
  `ontology/glossary.yaml` in the flat `terms: - term / vi / def / avoid` shape only. `CONTEXT.md` wins on
  a clash and every clash is listed in the manifest. Any other YAML shape is skipped as
  `unsupported glossary shape`.
- **Grammar** — `CONVENTIONS.md` from `ui synthesize-conventions`; absent means `grammar.md` says
  "not measured yet".
- **Soul** — `design/soul.md`, capped in the overview with a pointer to the file.

## Ruling tiers

| Tier | Which rulings | Where they go |
|---|---|---|
| Superseded | text starts with a `(SUPERSEDED …)` marker | never emitted, counted |
| C (process) | categories `figma-scripting`, `workflow-process`, `delivery-gates`, any scope | never emitted, counted, with a pointer to the source |
| B (per app) | any other ruling with `scope.apps` | `apps/<app>.md` |
| A | scope `global`, category one of `shell-chrome`, `component-reuse`, `screen-composition`, `tables`, `forms-inputs`, `status-vocabulary`, `naming-language`, `section-layout` | `rulings.md` |
| A-other | scope `global`, any other category | `rulings.md` under "Other library-wide rulings", counted as `tierAOther` — never dropped |

Order of precedence: superseded, then process, then app scope, then the design categories. The
manifest records `total`, each tier, `byCategory` and the source path of what was excluded. A text
that cites a superseded ruling outside generated text is `SUPERSEDED_CITED`.

## Gap-bound knowledge

General design knowledge enters the pack **only as the answer to a gap measured in this design
system**, never as advice:

- a control that models interaction states but no `disabled` → `knowledge/figma-craft/component-design.md`;
- a canonical colour role no token plays → `knowledge/token-taxonomy.md`;
- a declared colour pair below AA → the check `ui ds a11y`.

Each gap is a generated rule that names the file (or check) and carries its gap id
(`gap.component.<name>-<hash>.<state>`, `gap.role.<role>`, `gap.a11y.<text>.on.<surface>-<hash>`). A citation with no
measured gap is never emitted by `build` and, when a host writes one, `check` warns `UNBOUND_KNOWLEDGE`.

## Slots and answers

A slot is `> QUESTION(<slot-id>): <prompt> — evidence: <ids>`. Slot ids are **always**
`<kind>-<short readable prefix>-<hash of the full raw evidence>`, never a counter, a line number, an index or
the order things arrive in, and never a shortcut such as "the slug already is the name": `## Foo Bar` and
`## foo-bar`, or the rulings `!!!` and `ruling`, stay distinct slots.

| Slot | Id | Hash covers |
|---|---|---|
| ruling | `ap-ruling-<ruling id>-<hash>` | the raw ruling id |
| convention | `ap-conv-<section>-<hash>` | the raw `## heading` line + the raw DON'T line (see below) |
| persona | `ap-persona-<text start>-<hash>` | the full persona text |
| gap | `ap-<gap id>` | gap ids carry their own hash: `gap.component.<name>-<hash>.<state>`, `gap.a11y.<text>.on.<surface>-<hash>`, `gap.role.<role>` |
| look-alike names | `confusable.<first member>-<hash>` | the sorted member set |

Identical evidence has the same id and renders **one** slot whose `evidence:` lists every line it came
from. One deliberate exception to "the full raw line": a DON'T line is hashed with its digits, `%` and `*`
removed (counts are rescanned data that change on every `ui synthesize-conventions` run and would orphan
an answer each time), so two lines of one section that differ only in their numbers are one question.

The host writes `**Do:**`, `**Don't:**` and `**Why:**` directly under the slot, in the `.md` file as always;
all three are required. A slot with none is `OPEN_QUESTION`, with some `SCENARIO_INCOMPLETE`.

### The answers store

Answers used to live only inside generated files that `build` overwrites, so every guard around them left
another way to lose one. They now also live in `guidelines.answers.json`, written by `build`:

```json
{ "version": 1, "answers": { "<slot id>": { "lines": ["**Do:** …", "**Don't:** …", "**Why:** …"], "file": "anti-patterns.md" } } }
```

On every `build`, before anything is rendered, answers are harvested from the previous store and from
**every** `.md` in the pack folder (listed in the manifest or not) and from `guidelines.orphans.md`, then
merged by slot id. For one id with different texts the winner is: the answer in the file this build puts
the slot in, else the stored answer, else any other file (code-unit order of the path). Every different
text that loses is parked in `guidelines.orphans.md` exactly once (the same id and text is never parked
twice). The previous store's text is not a rival when the file's answer replaced it: that is you editing
the answer in place. Then the order of writing is fixed: the **store first** (temp file + rename), the
orphans file second, and only then every other file (staged, then renamed into place), so a failure at any
later step cannot lose an answer.

- An answer whose slot is gone stays in the store and appears in `guidelines.orphans.md` (counted as
  `orphanedAnswers`; `check` warns `ORPHANED_ANSWERS`). It returns to its slot if the slot comes back.
- Editing the `.md` is still how you answer. Because the store is a durable copy, **an answer deleted from a
  `.md` is restored by the next build**. To discard an answer on purpose, delete its entry from
  `guidelines.answers.json` as well as the text from the file. Parked answers likewise cannot be discarded
  by editing the orphans file alone.
- With the store missing, answers are recovered from the files and the orphans file and the store is
  recreated. It appears with the first answer.
- A malformed or wrong-version store (or an entry whose id is `__proto__`, which a build can never generate) is `BAD_ANSWERS_STORE`: `build` writes nothing, `check` reports an error,
  `export` is refused (`PACK_INVALID`). Repair it, or delete it to rebuild it from the markdown.
- `check` otherwise ignores the store, `export` never includes it, and `ds context` does not read it.
- `build` never deletes a file: one it did not produce is listed as `staleFiles`, `check` warns `STALE_FILE`,
  and neither `check` nor `export` lints or exports it (the store and the orphans file are never stale).

Export keeps the previous bundle in `<out>/.figma-guidelines.previous` while the new one is written (a
sibling of the staging folder, so cleaning the staging folder cannot delete it). It is removed only after
the new bundle and `UPLOAD.md` are in place and is put back on any failure; if putting it back fails, both
errors are reported and the backup stays on disk. A backup left by an interrupted export is never
overwritten: the next export stops and names it. After a failure the message says what state the output
folder is in, checked against what it held before, never assumed.

## The seal and `--allow-unsealed`

`build` and `check` load the design system through the same seal as every other `ui ds` command. A store
file that no longer matches its sealed hash is `DS_TAMPERED` and nothing is written. With
`--allow-unsealed` only **hash drift** is tolerated (an unreadable file or a broken kit still fails): the
pack is built, `guidelines.manifest.json` records `seal: { status: "unverified", drifted: [{ file,
expected, actual }] }`, `check` warns `SEAL_UNVERIFIED`, and the Figma `UPLOAD.md` says "Sources
unverified". The flag is a decision for the owner, not a convenience: it means the names were resolved
against a store nobody verified.

## The Figma guidelines bundle

`ui ds guidelines export --target figma --out <dir>` writes `<dir>/figma-guidelines/` and `<dir>/UPLOAD.md`
**beside** it, so it is never uploaded by mistake. It refuses (`OPEN_QUESTIONS (n)`) while any slot is
open — a partial answer is open — and (`PACK_INVALID`) while `check` has errors.

- `components.md` keeps the look-alike names with their answers and the rulings of the component
  categories (`component-reuse`, `tables`, `forms-inputs`); the component inventory is **omitted**,
  because Figma's agent reads components from the library itself. The canonical pack keeps the inventory
  for hosts that cannot see the library.
- `apps/*.md` merge into `apps.md`, one `## <app> (<n>)` heading each.
- Generated-block markers are stripped; rules keep their id and short source reference.
- Scenarios lose their `> QUESTION(<id>)` line and slot id: each reads `### <title>`, one `_Evidence: <refs>_`
  line, then its Do/Don't/Why lines (a look-alike-names question becomes the heading, its member names the
  evidence). The canonical pack is unchanged; `check --profile figma` still finds a scenario without an answer.
- Limits (one profile constant in the code, with this article and its check date): 3 to 8 files, only
  `.md`, `.txt` and `.json`, at most 200,000 bytes in total (`BUDGET_EXCEEDED` with per-file bytes), a
  warning above 100,000. **Nothing is trimmed by default.** `--budget <n>kb` (n at most 200) trims by
  priority — grammar, terminology, the overview stance, apps (largest app first, oldest ruling first),
  then rulings oldest first; anti-patterns, vocabulary and components are never trimmed — and every drop
  is reported with its ids (text, JSON and `UPLOAD.md`).
- `ui ds guidelines check --profile figma --bundle <dir>/figma-guidelines` validates the limits and
  open slots of an exported bundle.

Upload (manual, by the owner): open the library file → Library → Manage guidelines… → Upload → select
every file in `figma-guidelines/` → Apply changes. Source of the limits and steps: Figma Help,
"Add guidelines files to a design library"
(https://help.figma.com/hc/en-us/articles/43509372175511), limits checked 2026-10-15; the feature is in
beta, so re-check the article before relying on a limit.

## Context for other hosts

`ui ds context --include guidelines` (opt-in, never in the default set) emits the pack's file index,
the scenario titles with their status and the tier-A rulings inside `--max-bytes`, dropping rulings from
the tail first and then scenario titles, and stating what it dropped. No pack means no section.

## Failure Modes

- **Placeholder answers to open the gate.** A slot filled with text that decides nothing passes
  `check` but teaches nothing. Look for `**Why:**` lines that restate the `**Do:**` line; a slot the
  evidence cannot decide must stay a QUESTION and be reported to the owner.
- **A name from memory.** An answer that names a token or component not in the store is `UNKNOWN_NAME`;
  one written without a span is not judged at all. Look for backticked names without `token:` or
  `component:` prefixes in `**Do:**` lines. `AVOIDED_TERM` never judges a backtick span (a mention, e.g. a
  rejected synonym being forbidden or a `component:` name); only bare prose in an answer.
- **`--allow-unsealed` used silently.** The pack looks identical to a verified one. Look for
  `seal.status` in the manifest and for the "Sources unverified" section of `UPLOAD.md`.
- **Reading a trimmed bundle as complete.** A `--budget` export drops rules. Look at the `trimmed`
  report; the canonical pack still holds every rule.
- **Stale files mistaken for the pack.** A file the last build did not produce can look current. Look for
  `STALE_FILE` warnings and `staleFiles` in the manifest.
- **Claiming the upload.** The binary and the host cannot upload to Figma. Any report that says the
  guidelines were uploaded is wrong.
