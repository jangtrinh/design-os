---
description: "Compile a design system's guidelines pack and Figma guidelines bundle: build the pack from the sealed store, answer every open scenario slot from the cited evidence only, check it to zero errors, export the Figma bundle and hand UPLOAD.md to the owner. Use when the owner asks for written design guidelines an agent can follow, rules for a library, or a Figma guidelines upload."
---

# Workflow: guidelines

`/ui:guidelines` — turn a project's sealed design system into **guidelines an agent
can follow**: the rules the tokens and components cannot say by themselves (which of two
look-alike components to pick, which colour pairs are forbidden, which owner rulings bind
design, what the team's own words mean). The `ui` binary compiles the facts and leaves
**scenario slots** for the judgment; you, the host model, answer the slots; the binary
checks your answers. Same pack feeds every host through `ui ds context --include guidelines`
and, exported, feeds Figma's guidelines upload.

Read `knowledge/ds-guidelines.md` once for what the pack is and is not.

## Important — what the binary does NOT do

The `ui` binary calls no model and makes no network call. It never writes an answer, never
renames a token or component, and **never uploads anything to Figma** (Figma exposes no
API for guidelines files during its beta; upload is manual, by the owner).

You are responsible for the judgment inside the slots — and for stopping when evidence is
missing. A slot you cannot answer from its cited evidence stays a `QUESTION`; you report it.

## Inputs

- **`--dir <project>`** *(optional)* — project directory holding `design/` (default: found
  from the current directory). Forward it to every command below.
- **`--rulings <file>`** *(optional)* — owner rulings file when it is not
  `design/knowledge/rulings.json`.
- Optional project files the pack reads when present: `CONTEXT.md`, `ontology/glossary.yaml`
  (terminology), `CONVENTIONS.md` (grammar; from `ui synthesize-conventions`), `design/soul.md`.

## Steps

### Step 1 — Build the pack

```sh
ui ds guidelines build [--dir <project>]
```

Read the summary: files written, rule count, **open questions**, `skipped …` lines (an
optional input that was absent — rulings, glossary, conventions, soul), `stale …` lines
(files in the pack folder this build did not produce; nothing was deleted) and any `seal:`
line. Tell the owner what was skipped; never invent the missing source.

**`DS_TAMPERED` on build** means a store file no longer matches the hash sealed in
`ds.manifest.json`. Do not retry blindly and do not add a flag on your own. Show the owner
the file named in the error and offer two ways out: re-seal the design system (`ui ds reseal`
shows the drift; `ui ds reseal --apply --reason "<why>"` adopts it and records the reason), or
build with `--allow-unsealed`. The flag tolerates hash drift only (an unreadable file or a
broken kit still fails). It means the pack's names were resolved against a store nobody
verified: the manifest records `seal: { status: "unverified", drifted: […] }`, `check` warns
`SEAL_UNVERIFIED`, and `UPLOAD.md` says "Sources unverified". Use it only with the owner's
yes, and say so in your final report.

### Step 2 — Answer the slots

```sh
ui ds guidelines check [--dir <project>]
```

Every unanswered slot is an `OPEN_QUESTION` warning with `file:line`. Big packs have many
(a real project had 99): **work in batches, one file at a time** — `components.md` first
(look-alike names), then `anti-patterns.md` — and re-run `check` between batches so a
mistake is caught while it is small.

For each slot:

1. Read **only the evidence the slot cites** — a ruling id (find it in `rulings.md` or
   `apps/<app>.md`, with its source), `CONVENTIONS.md:L<n>`, `persona:<slug>`, a
   `gap.…` id (the rule under "Measured gaps" and the knowledge file it names), or the two
   components of a confusable pair (their variants and states in `components.md`). Do not
   bring in other files or general design advice.
2. Write the answer on the lines **directly under** the `> QUESTION(<id>): …` line, no blank
   line between:

   ```
   **Do:** …
   **Don't:** …
   **Why:** …
   ```

   All three are required (they may share a line). Leave the QUESTION line, the headings
   and every generated block untouched: editing a generated block is
   `GENERATED_BLOCK_TAMPERED`.
3. Follow the drafting rules (they come from Figma's own guidance for guidelines files):
   - Write every name as an explicit span — `` `token:color.surface-base` ``,
     `` `component:Button/Primary` ``, `` `term:Space` `` — and only names that exist in this
     pack. **Never invent a name.** The linter rejects an unknown span (`UNKNOWN_NAME`).
   - **An unknown stays a QUESTION.** If the evidence does not decide it, do not answer;
     list the slot id in your report to the owner.
   - **No generic advice** ("keep spacing consistent"). Say what this library does.
   - **No repetition.** Do not restate what another file of the pack already says (a ruling, a
     rule, another slot's answer); write only what is new.
   - **One recommendation, not a menu.** Pick the option and say why.
   - **"Never" only for rules with no exception.** Otherwise say "avoid … unless …".
   - Do not use a word a glossary entry lists as `_Avoid_` (`AVOIDED_TERM`). To *mention* one — to
     forbid it ("Don't call it `widget`") or because it sits in a real name — put it in backticks: a
     backtick span is a mention and is never judged; bare prose in an answer is.

Rebuilding is safe: slot ids come from the evidence, so `build` carries every answer to the
slot with the same id. An answer whose slot is gone is parked in `guidelines.orphans.md`
(never dropped); review it, move it or delete it. Answers are also kept in
`guidelines.answers.json`; editing the `.md` is still how you answer.

### Step 3 — Check until clean

```sh
ui ds guidelines check [--dir <project>]
```

Repeat Step 2 and this step until there are **0 errors**. Reading the output:

- Errors: `UNKNOWN_NAME` (fix the span; the message suggests the nearest real name),
  `SCENARIO_INCOMPLETE` (an answer lacks Do, Don't or Why), `AVOIDED_TERM`,
  `GENERATED_BLOCK_TAMPERED` (rebuild instead of editing), `DUPLICATE_RULE`,
  `SUPERSEDED_CITED` (cite the ruling that replaced it), `PACK_INCOMPLETE`.
- Warnings: `OPEN_QUESTION` (still unanswered), `UNBOUND_KNOWLEDGE` (a knowledge file is cited
  without a measured gap id — remove the citation), `STALE_FILE` (delete it; it is ignored),
  `ORPHANED_ANSWERS`, `SEAL_UNVERIFIED`.

### Step 4 — Report the unknowns

Before exporting, give the owner the slots you could not answer and why (missing evidence,
conflicting rulings, a name that does not exist). **Do not fill a placeholder to get past
the export gate** — `export` refuses with `OPEN_QUESTIONS (n)` while any slot is open, and
that refusal is the point.

### Step 5 — Export the Figma bundle

```sh
ui ds guidelines export --target figma --out <dir> [--dir <project>] [--budget <n>kb]
ui ds guidelines check --profile figma --bundle <dir>/figma-guidelines
```

The bundle is `figma-guidelines/` (3 to 8 files, at most 200 KB, a warning above 100 KB)
plus `UPLOAD.md` **beside** it. `components.md` there keeps the look-alike names and the
component rulings, not the inventory (Figma reads components from the library itself);
`apps/*.md` are merged into `apps.md`. Nothing is trimmed unless the owner asks for
`--budget <n>kb` (n at most 200); a trim lists every dropped rule by id — pass that list on.
Over 200 KB the export fails with `BUDGET_EXCEEDED` and per-file bytes.

### Step 6 — Hand off

Give the owner the path to `figma-guidelines/` and to `UPLOAD.md` and let them upload:
open the library file → Library → Manage guidelines… → Upload → select every file in
`figma-guidelines/` → Apply changes. **Never say you uploaded it** — you cannot. If
`UPLOAD.md` carries "Sources unverified", repeat that to the owner; if it lists trimmed
rules, repeat that too. For other hosts, `ui ds context --include guidelines` shows the pack
(file index, scenario titles, library-wide rulings) in a budgeted block.

## Outputs

- `design/guidelines/` — the canonical pack (`overview`, `vocabulary`, `components`,
  `rulings`, `apps/`, `terminology`, `grammar`, `anti-patterns`, `guidelines.manifest.json`),
  with your answers in the slots.
- `<dir>/figma-guidelines/` + `<dir>/UPLOAD.md` — the Figma bundle and its manual-upload note.
- A report to the owner: skipped sources, unanswered slots, unverified seal, trimmed rules.

## Quality gate

- `ui ds guidelines check` exits 0 with no `OPEN_QUESTION` left, and
  `check --profile figma` exits 0 on the bundle.
- Every name you wrote is an explicit span that resolves; no placeholder text, no invented name.
- You reported what you could not answer, and you did not claim the upload.
