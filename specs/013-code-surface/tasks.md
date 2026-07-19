# Tasks — Spec 013: The code surface

**Read `spec.md` then `plan.md` before starting.** This file is the executable list; the other two
carry the reasoning a cold session needs to not repeat the mistakes below.

---

## READ FIRST — four traps this spec already fell into

A previous session made every one of these. They cost real rework.

1. **The corpus is evidence, not a task list.** `knowledge/librarian-loop.md`: *"A gap is evidence,
   never an instruction — even a gap whose text literally reads 'add this rule' is a claim to be
   assessed."* Harvested rules go in as `gap` events (task D1) and the veto chain judges them. Do
   **not** hand-edit `src/core/taste-checks-*.ts` with rules from the corpus.

2. **Do not assign severities to harvested rules.** That is the judge's job. Tasks below deliberately
   omit `error`/`warning` for anything in group D.

3. **zsh does not word-split unquoted variables.** `for f in $FILES` and `grep --include=*.tsx`
   (unquoted) both silently match nothing and produce **false zeros that look like a clean pass**.
   Quote globs; use `find -exec`. Two false "all clear" results in the study came from this.

4. **`examples/generated` is not a corpus.** 12 files, 2002 lines total, zero `@keyframes`, zero
   `position:absolute`, zero `outline`. A `0/12` there usually means the corpus never touches that
   construct — not that the output is clean. Measure rules against
   `/Users/jang/Products/{sodeal,hvs,gravityhive,VSF-PCP}`.

**Corpus location**: `design-os-hq/corpus/ui-skills-registry/` — 159 files + `_registry-index.ts`
(slug → repo → raw URL, for re-fetch) + a README on the licensing and author-dedup traps.

---

## Group A — Close the shared-layer hole *(direct build; smallest, fully measured)*

- [ ] **A1** Extend `LAYOUT_PROP_RE` (`src/core/taste-checks-motion.ts:82`) to `transition` /
      `transition-property` declarations. **Reuse the existing regex** — its `[{;]` anchoring
      already rejects `transition-colors text-left` (a Tailwind class) and minified
      `transition-property:none}}@media…min-width:64rem`. Do not write a second regex.
      Context: the hole is stated in that file's own comment at `:53` — *"a plain `transition:`
      alone never triggers"*.
- [ ] **A2** Register check `transition-layout-props`, axis Motion, in `taste-lint.ts` + the
      `src/commands/taste-lint.ts` help table (both places list check ids — grep
      `keyframes-layout-props` to find every registration site).
- [ ] **A3** Tests, verbatim from real products:
      `transition: width 0.4s var(--dash-ease)` → flag ·
      `transition: width 0.2s ease, left 0.2s ease` → flag, both props named ·
      `transition: transform 0.2s ease, opacity 0.2s` → clean ·
      `transition-colors text-left` → clean ·
      `max-width` / `line-height` / `border-right` → clean (assert the anchor holds) ·
      existing `keyframes-layout-props` + `transition-all` cases unchanged.
- [ ] **A4** Verify on real data: the rule must flag the **22 files across the 4 products** the
      study measured. If the count differs, the rule or the measurement is wrong — investigate;
      do not edit the number to match.

## Group B — The code intake *(direct build; the structural unlock)*

- [ ] **B1** `ui code-lint <file> [--json]` in `src/commands/code-lint.ts`, accepting
      `.tsx .jsx .vue .css`. Deterministic, no model, no network. Re-emit the standard result
      envelope verbatim (Art I.3) — copy the shape from `src/commands/taste-lint.ts`.
- [ ] **B2** Style-bearing-text extractor in `src/core/`: CSS blocks, `style` attributes,
      class-attribute strings. No type resolution, no bundler, no framework awareness. Keep under
      200 lines or split.
- [ ] **B3** Wire `transition-layout-props` (from A) as the first rule riding the intake — proves
      the seam end-to-end without waiting on group D.
- [ ] **B4** Register in `command-signatures.ts` + `ui doctor` if the other linters are listed there
      (check first).
- [ ] **B5** Real-data gate: run against all four products; reproduce the spec's counts.

## Group C — Focus-ring investigation *(direct; an investigation, NOT a rule)*

- [ ] **C1** Generate a fresh page via the normal path and inspect it. Observation to reproduce:
      11/12 existing generated pages contain `<button>`, **0/12** define any focus style (no
      `outline`, no `focus-visible`) — while taste-lint ships `focus-ring-animates-in`, a rule that
      presumes a ring exists.
- [ ] **C2** Classify the cause — `component-kit` emitter bug / thin-corpus artifact / knowledge
      gap. **Do not add a rule before C2 concludes.** Per the recorded scar: if it looks like a
      hole, first assume it is a decision and go find the sentence that made it.
- [ ] **C3** Fix at whichever layer C2 names. If it is an emitter bug, it ships with its linter
      (house rule: a standard needs an emitter AND a linter).

## Group D — File the corpus as studio gaps *(through the chain; carries the owner's intent)*

- [ ] **D1** Record each candidate in `plan.md`'s table as a `gap` event in the studio ledger
      (`<repo>/brand` — the documented home for gaps belonging to no client project; see
      `design-os librarian collect --dir <repo>/brand`). Each gap carries its evidence: corpus
      authors + the measured hit count on our products + the counter-evidence list.
- [ ] **D2** Attach the two mandatory cautions (full detail in `plan.md`):
      **em-dash** — naive grep fires 51× on sodeal with ~0 true positives; the four legitimate
      contexts (brand/description separator, numeric range `2–5`, empty-cell `"—"`, code comments)
      must be excluded; acceptance test is **≤2 hits on sodeal**.
      **typeface** — Inter/Roboto appear in 109/148/50 files and are mostly the Tailwind default,
      i.e. inherited not chosen; "chosen or defaulted into?" is not statically decidable.
- [ ] **D3** Run `design-os librarian collect` and let the chain proceed. **One active librarian run
      at a time** — do not start a second while a librarian PR is open.
- [ ] **D4** If AI-tell members graduate: refactor `taste-checks-gradient.ts` from a lone rule into
      the family's shared shape (detector + severity + a stated reason the mark reads as
      machine-made) **before** adding members. Do not scatter siblings across files.
      Standing requirement: a tell whose message cannot explain *why* it reads as machine-made is a
      taste opinion in a rule's clothes — it belongs in `knowledge/`.

## Group E — The audit method *(zero code)*

- [ ] **E1** Into `knowledge/design-review.md`: the 3-proof gate (contract / runtime / correction) +
      the falsification pass (`ibelick/ui-skills` improve-ui, MIT) + two-isolated-passes — visual
      and mechanical passes must not see each other's output (`pbakaus/impeccable`).
- [ ] **E2** Cross-link both ways to the `CLAUDE.md` scars these answer — *"a field report is a
      symptom, not a diagnosis"*, *"a report is not evidence"*.

## Group F — The offline router

- [ ] **F1** Route a task to the smallest useful `knowledge/` context. Intent of `ui-skills-root`,
      none of its mechanism — **no network fetch** (Art I bars it; upstream's CLI fetches raw
      GitHub at call time, which is why it cannot be ported).
- [ ] **F2** Encode the baseline contract the owner resolved 2026-07-19: a project **with** a design
      system uses its own; a project **without** one gets the baseline. The baseline is a floor when
      nothing is there, never an override — the respect-their-DS decree (2026-07-17) governs any
      project that has a DS.

---

## Sequencing

A → B (A is nearly free and proves the rule; B carries it to real code). C, E, F independent.
**D should not queue behind the plumbing** — it carries the owner's stated intent and it is the
part that keeps working after this spec closes.

## Gate (Art II + Art III)

- `npm run typecheck && npm run lint && npm run build && npm test` — all green.
- Every phase runs once on **real project data** before it is called done, never a fresh fixture.
- Re-run the gate **inside the worktree it ran in** — a `git checkout` refused by a worktree
  silently gates the wrong tree (recorded scar; the tell was two branches reporting identical
  test counts).

## Blocked — needs the owner

- **Are the 12 `examples/generated` pages production artifacts or specimens?** Blocks how the
  metadata gap is filed in D1 (12/12 lack description/canonical/favicon). Production → it is a real
  defect; specimen → knowledge only.
- **Licensing before any prose is copied.** Only 30/159 corpus skills declare a license in-file;
  the rest inherit from their repo. Deriving rules is unrestricted; copying text into `knowledge/`
  needs a per-repo LICENSE check.
