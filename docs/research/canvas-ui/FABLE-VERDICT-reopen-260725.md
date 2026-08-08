# Fable 5 reopen addendum — Spec 028 (2026-07-25)

**This file does not replace `FABLE-VERDICT.md`.** The original gate stands as the record of
what was ruled on 2026-07-25 with the facts then available, including where it was wrong.
This addendum records the reopen, the corrected direction, and what the stage-2 amendment
(Opus 4.8) did with it. Source of truth for the reopen: Fable's decision document
`~/.claude/plans/you-are-fable-5-parsed-piglet.md`, transcribed here, not interpreted.

**Status:** implementation-complete is **REVOKED** for spec 028 until the corrections below
land. Pipeline re-entry: stage 2 (this amendment) → Codex 5.6 sol review → Sonnet executes →
Opus + Codex review → Fable final audit **against this document**.

---

## 1. What the original gate did not know

Facts surfaced by the stage-4 review, verified in the tree on 2026-07-25:

1. `ease-design/references` is a **gitignored symlink** into the private
   `../design-os-hq/corpus/references` (`.gitignore:66-69`, `references -> ../design-os-hq/corpus/references`).
   The ledger the implementation wrote to `references/canvas-ui/` is therefore **not tracked in
   ease-design**: a clean clone or CI checkout does not have it, while the tracked
   `knowledge/canvas-effect-direction.md`, `ui knowledge check`, and three test files require it.
2. `package.json.files = ["dist","knowledge","schemas","templates"]` — `references/` was never
   publishable, so "the ledger is under `references/`, therefore it cannot ship" was never a
   property of `references/` being *secret*; it was a property of it being *absent*.
3. At the pinned revision `728550d4523e1b8bef834b64b3e936c215cad630` the roster is 22
   html-in-canvas (`live-html`) engines + 3 `three` object engines. The `overlay` family has
   **zero members**; the ledger README already recorded this as "a discrepancy for the benchmark
   owner".
4. The gates were green **only because the private symlink exists on this machine**.

## 2. The verdict

**Reopen upheld.** The adoption's substance survives review — vocabulary, T6 gating, the
emitter/linter pair, the no-source boundary. Two structural points fail:

1. **The ledger's home is architecturally wrong, not merely misplaced.** A tracked knowledge
   file, a `ui` subcommand, and the test suite depend on a file the repository does not contain.
   Green-on-this-machine is not green — it is the symlink wearing a pass. This is the repo's own
   `guard-skip-is-a-silent-noop` class of failure, now inside the gate itself.
2. **The three-family model is falsified at the pinned revision.** `overlay` has zero members,
   so the "one effect per family" benchmark is unexecutable as worded. An enum value with
   provably no members, on which the release benchmark depends, is a modeling error.

Neither correction touches the license, offline, or no-source boundaries. Both are two-way doors.

## 3. Corrected direction (binding)

1. **Ledger location: `knowledge/canvas-ui/{README.md, catalog.json}` — tracked, in this repo.**
   In-tree precedent: `knowledge/benchmarks/` (machine JSON + README under `knowledge/`) and
   `knowledge/personas/personas.json`. B2 is unaffected — content stays names, slugs, families,
   provenance. `references/` remains what it is: a machine-local private symlink. **Nothing the
   public repo's gates read may live behind it.**
2. **The ledger is packaged, by design.** `knowledge/` is in `files`, so the ledger ships with
   the knowledge file that cites it and the `ease:source` ref resolves inside the tarball.
   `package.json.files` stays exactly the four entries. **T6a's assertion is unchanged; its
   rationale flips** — it no longer "proves the ledger is unpublished" (an Art VIII overclaim
   once the ledger ships); it proves no new tree can be published silently. The display names in
   the tarball are nominative use; that consideration folds into the existing §12.1 owner license
   gate, and is not a new gate.
3. **Families are membership; overlay is a runtime mode.** `family ∈ {"live-html","object"}`,
   both mechanically derived at the pin (`three` import vs the origin-trial live-DOM draw call).
   One required per-effect field is added: `overlayFallback: boolean` — derived, never guessed:
   does the pinned implementation ship a WebGL overlay path that does **not** read the live DOM.
   `object` rows are `false`. The reserved-empty `overlay` family is removed.
4. **The benchmark is re-scoped from "one per family" to three CAPABILITIES:** (a) live-html
   rendering via html-in-canvas in an origin-trial browser; (b) **WebGL overlay fallback
   rendering** — a live-html effect with `overlayFallback: true`, run with the origin trial
   absent; (c) a three.js `object` effect. Each keeps the full original floor (desktop + mobile,
   reduced-motion, unsupported-static, clean console, teardown, context-loss). The
   overlay-fallback capture is **additional** evidence of graceful degradation; it never
   substitutes for the static-baseline capture (WebGL fully absent).
5. **Browser-note adjudication: current OFFICIAL Chrome origin-trial documentation controls
   browser-platform facts.** The pinned upstream README controls only upstream facts (roster,
   per-effect behavior at that revision) — a pin cannot govern a third party's trial status. The
   knowledge note must carry the official source URL and a `checked:` date. "Chrome 148–150" is a
   relayed upstream claim and does not stand until re-verified. Upstream-vs-official disagreement
   is recorded in the ledger README as a discrepancy; the T6 floor's re-check-at-use-time covers
   later drift.
6. **Unchanged and reaffirmed:** B1 offline/deterministic `ui` · B2 no implementation detail ·
   B4 no vendoring/ports · B5 web-only · B6 static-baseline-first · B7 one-effect cap · B8 Draco ·
   the adverse-branch design · both human audits · §12 owner decisions.

## 4. What the stage-2 amendment changed, and what it added

`spec.md`, `plan.md`, and `tasks.md` were amended to the direction above. Three facts were
established **by grep and by reading the code during the amendment** — the verdict's known-site
list is a snapshot, the grep is the authority — and are carried into the artifacts:

1. **Two `references/canvas-ui` sites the verdict's list did not name** exist in tracked files:
   `knowledge/README.md:18` (the index row's description cell) and `src/core/knowledge-lint.ts:41`
   (the `KnowledgeLintInput` doc comment). Both are in the retarget set. End state is unchanged:
   **zero** occurrences of `references/canvas-ui` in tracked files.
2. **`tests/adapters-canvas-effect-routing.test.ts` would CRASH on a clean clone, independently
   of the ledger move.** Its `walkDistributionRoots()` walks `references` as a literal root
   (`:57`), and `readdirSync` on an absent directory throws `ENOENT`. The distribution roots
   become `knowledge/`, `templates/`, `src/` — `references/` is machine-local and is never walked
   by a tracked test. This is the same bug class as the ledger, in a second place; it would have
   turned the clean-clone gate red even after a correct ledger move.
3. **`src/commands/knowledge.ts` is 212 lines** — already over the Art IX 200-line ceiling that
   spec §11.10 imposes on this feature's files. The retarget cannot be done without either
   splitting it or knowingly extending an Art IX breach, so the amendment requires the split
   (`effect-matrix` IO into its own command module).

Additions the amendment made that the verdict authorized but did not spell out:

- **`provenance-machine-local-ref` (error), a new `ui knowledge check` finding** in
  `src/core/knowledge-link-check.ts`. Correction 7 amends `knowledge/authoring-standard.md`; Art
  II says a rule shipped as prose drifts, and this repo's own scar says a standard needs an
  emitter AND a linter. The rule "a tracked knowledge file must not `ease:source`-ref into
  `references/**` or `taste/**`" therefore ships with the check that fails without it. It fires on
  the ref's *prefix*, not on resolution — so it stays red on this machine, where the symlink would
  otherwise make the bad ref resolve.
- **T7, the symlink-independence sweep** (`tests/adapters-canvas-effect-routing.test.ts`): no
  tracked file under `knowledge/`, `templates/`, `src/`, `tests/` contains the string
  `references/canvas-ui`, and no knowledge file carries an `ease:source` ref into `references/` or
  `taste/`. The sweep proves correction 7's "exactly one such ref exists today" stays at zero.

## 5. Browser-note facts surfaced during the amendment (NOT the checked source)

A web search on **2026-07-25** surfaced official Chrome material that already contradicts the
relayed "Chrome 148–150" claim:

- Chrome Status feature entry: `https://chromestatus.com/feature/5172548013916160`
- Chrome for Developers announcement: `https://developer.chrome.com/blog/html-in-canvas-origin-trial`
- Reported there: desktop origin trial **148 → 150 with an extension to 154**; the API surface is
  named `drawElementImage` (2D) / `texElementImage2D` (WebGL); Finch feature `CanvasDrawElement`;
  flag `chrome://flags/#canvas-draw-element`.

**This is a lead, not the evidence.** The implementer fetches the official registry entry itself,
records the URL and a `checked:` date in `knowledge/canvas-effect-direction.md` and the ledger
README, and records the delta against the upstream README's claim. Nothing in this section may be
cited as the checked source, and no API name from it may enter `knowledge/` or `templates/` (B2 —
an API surface is implementation detail regardless of who published it).

## 6. Required proof (unchanged from the verdict, restated as the gate)

1. **Clean-clone gate — the headline proof.** Fresh `git clone` into a temp directory with **no**
   `design-os-hq` sibling → `npm ci` → `typecheck · lint · build · test` + `ui knowledge check`
   all green, full output recorded. Confirm what GitHub CI does today on this branch (it has no
   symlink — it *is* the clean clone) and record red-before / green-after.
2. **Grep proofs, recorded:** `rg 'references/canvas-ui'` → 0 hits in tracked files;
   `rg 'ease:source ref="references/'` under `knowledge/` → 0 hits.
3. **`npm pack --dry-run` file list recorded:** the ledger present under `knowledge/canvas-ui/`,
   nothing else new, `files` unchanged (T6a green).
4. **M1–M6 green under the new schema**; M6 round-trip still exactly-N `effect-catalog-field-empty`
   and zero other findings; T1–T5, T6a–T6d, T7 green **from the clean clone**.
5. **Benchmark evidence per the three capabilities**, including the overlay-fallback run with the
   origin trial absent. Owner-run items (real mobile GPU, context-loss) unchanged.
6. **Browser-note evidence:** the official URL and checked date visible in the diff.

## 7. Release blockers

1. The ledger untracked in ease-design, or ANY gate/test/knowledge ref reading through the
   `/references` (or `/taste`) symlink — **the current state; blocks now.**
2. Clean-clone gate absent, unrecorded, or red.
3. Any surviving "`references/` is not published ⇒ the ledger cannot ship" rationale in spec,
   tests, or comments — an Art VIII overclaim once the ledger is packaged.
4. Benchmark still scoped "one per family" against a zero-member family, or overlay evidence
   supplied as a family-membership claim instead of a mode run.
5. Browser note not sourced to current official Chrome origin-trial documentation with a checked
   date.
6. All original blockers stand: owner license interpretation (§12.1, now noting the packaged
   display names) · the two human audits (diff + package) present and recorded · complete static
   baselines · no load-bearing html-in-canvas · catalog-leakage T3 · T6a–T6d.

## 8. The private hq copy

`../design-os-hq/corpus/references/canvas-ui/{README.md,catalog.json}` is **not deleted** (owner
decision). It is declared a **non-canonical legacy mirror**: outside this repo, outside every
public gate, read by nothing tracked, and not maintained. The canonical ledger is
`knowledge/canvas-ui/`. If the mirror ever disagrees with the canonical ledger, the canonical
ledger is right by definition — a mirror nobody reads cannot be wrong about anything that matters,
which is exactly why it must never be re-wired into a gate.

---

*Recorded by Opus 4.8 at stage 2, 2026-07-25. The original verdict is preserved unedited; the
record of being wrong is part of the record.*
