# Tasks — Spec 028: Canvas UI external-effect adoption

**Read `spec.md` then `plan.md` before starting.** This file is the executable list; those two
carry the reasoning a cold session needs. Where they disagree, `spec.md` wins; where `spec.md`
and the verdicts disagree, the verdict wins. **Verdict precedence:**
`docs/research/canvas-ui/FABLE-VERDICT-reopen-260725.md` (2026-07-25, **read it first**) →
`FABLE-VERDICT.md` (superseded only where they conflict) → this spec. The constitution outranks
all of them.

**REOPENED — this is a CORRECTION list.** A first implementation landed and was revoked at stage
4. Groups A–E below are amended in place; the corrections are marked **[R]**. Do not redo work
already correct, and do not skip a **[R]** because "the tests are green" — they are green on this
machine *because* of the bug (see Group G).

**The six corrections, in one screen:**

| # | Correction | Where |
|---|---|---|
| R1 | Ledger moves `references/canvas-ui/` → **`knowledge/canvas-ui/`** (tracked, packaged) | A1–A2, D-retarget |
| R2 | `family` enum → 2 values; **required `overlayFallback: boolean`** | A3, D2b, E1/E6b, E7 |
| R3 | T6a + package-audit **rationale reversed** (the ledger ships on purpose) | E7, E7c |
| R4 | Benchmark = **three capabilities**, not three families | F1–F2 |
| R5 | Browser note sourced to **official Chrome docs + checked date** | B10 |
| R6 | Shared-layer rule: no tracked ref through a machine-local symlink (+ its linter) | D7, E10 |

**AMENDMENT 2 — the stage-4 review of the executed corrections returned REVISE. Five more, marked
[R2]:**

| # | Correction | Where |
|---|---|---|
| C1 | **`effect-catalog-row-drift`** — the matrix's machine columns are checked against the ledger, and **Draco gates on the LEDGER family**. Today: relabel an `object` row `live-html`, delete its Draco clause → **zero findings** | D2d, E1b |
| C2 | Purge upstream **API identifiers** + **verbatim quotations** from the three *packaged* canvas files (the ledger README is packaged and **no gate reads it**); keep URL, `checked:` date, milestones, revision | A9, B13, C11, E7d |
| C3 | Ledger evidence at the granularity actually checked; **the B4 excuse deleted** (B4 forbids vendoring, never *reading*) | A8 |
| C4 | Tracked G-now record: `docs/research/canvas-ui/implementation-evidence-260725.md` | G6b |
| C5 | `ui knowledge check` stops walking `references/` to resolve refs; one defect → one finding | D9 |

**All five survived a fully green suite.** That is the signature of this task: the gates that
exist pass, and the gap is a gate nobody wrote. Do not read "tests are green" as evidence for any
of C1–C5.

And the proof that decides all six: **Group G — the clean-clone proof, in two halves.** **G-now
(G1–G6)** runs in this session with no commit and gates *implementation-complete*; **G-CI (G7)**
is GitHub CI on the pushed branch, exists only after the owner commits, and gates *release*.
Neither substitutes for the other, and **nothing in this file authorizes a commit or a push.**

---

## READ FIRST — seven ways this task goes wrong

0. **You work in `/Users/jang/Products/ease-design`, the current tree, on the current branch.**
   Edits go through `apply_patch` into the Group 0 allowlist. No branch, no worktree, no copy,
   no stash, no reset, no checkout, no `git add`, no commit, no push. The tree is dirty with
   four other sessions' live work, so isolation is *measured* (Group 0 baseline → post-run
   comparison), not promised.
0b. **A handwritten matrix is not an emitter.** Art II wants *code that emits* the convention
   plus *a check that fails without it*. Group D ships `ui knowledge effect-matrix` (emitter)
   AND the `effect-catalog-*` findings (linter). Shipping only the second is the exact failure
   the repo's own scar records — and M6 is the test that proves the two agree.
0c. **[R] Almost nothing here is greenfield. Seven artifacts ALREADY EXIST in the working tree,
   untracked, from the revoked first implementation — AMEND them, never re-create them.**
   `knowledge/canvas-effect-direction.md` (157 lines) · `templates/skills/canvas-effect.md` (78) ·
   `src/core/knowledge-effect-catalog-check.ts` (198) · `src/core/knowledge-effect-matrix-emit.ts`
   (86) · `tests/knowledge-effect-catalog.test.ts` (140) ·
   `tests/knowledge-effect-matrix-emit.test.ts` (171) ·
   `tests/adapters-canvas-effect-routing.test.ts` (232). Group 0.5 lists all seven under
   **MODIFY**, and that is correct; where a task below still reads "Create"/"New" it means
   *bring this file to the amended contract*. **Writing one from scratch silently discards correct
   work the reopen did not touch** — the reopen corrected a location, a schema, a benchmark
   scoping, a rationale, and a shared-layer rule. It did not reopen the adoption.
   **Only THREE paths are genuinely created:** `knowledge/canvas-ui/README.md` ·
   `knowledge/canvas-ui/catalog.json` · `src/commands/knowledge-effect-matrix.ts`.

1. **The upstream API is not knowledge.** A parameter table, a prop list, or a code snippet in
   `knowledge/`, `templates/`, or `src/` is a **port-by-proxy** and breaches the same license
   boundary as vendoring (spec B2/B4). If an artifact seems to need one, that is a **STOP**,
   not a judgement call.
2. **`family` is derived, never guessed.** `object` = exactly the three `three`-dependent
   effects; `live-html` = the rest (confirmed at the pin: 22). **[R]** The enum has **two**
   values — `overlay` is gone, it had zero members. The derived field that replaces it is
   **`overlayFallback: boolean`**, and it is equally underivable-by-guess: benchmark capability
   (b) picks its subject by that field, so a guess mis-scopes the entire proof. Cannot derive it
   at the pin → **BLOCKED**.
3. **Do not convert a hardcoded count into a dynamic assertion.** The `28` totals are a
   deliberate tripwire that a skill was added without review. Update the number; keep the
   tripwire. (Repo scar: `ds-round-trip.test.ts` asserted a bug as correct behavior for
   months, and every green CI run certified it.)
4. **Do not soften a check to make the tree green.** The checks *are* the deliverable (Art II).
   A green `ui knowledge check` bought by weakening a rule is a failed task wearing a pass.
5. **Never run `playwright install --force chrome`.** It has already destroyed a user Chrome
   install on this machine (recorded scar `gui-chrome-cant-launch-from-agent-sandbox`). GUI
   Chrome does not launch from the agent sandbox at all — Phase F items needing a real GPU are
   owner-run.
6. **[R] `references/` and `taste/` are gitignored symlinks into a private repo. Nothing tracked
   may write, read, or ref through them.** That is the bug that revoked the last
   implementation-complete: a tracked knowledge file, a `ui` subcommand, and three test files
   depended on a ledger the repository did not contain, and every gate was green because this one
   machine happens to have the symlink. **Do not "fix" a path by pointing it back there, and do
   not update the legacy mirror to match.** Writing under `references/**` is a STOP.
7. **[R] A green suite on this machine proves nothing about this bug class.** The decisive
   implementation gate is **G-now (G1–G6)** — the whole suite run in a temp tree with no
   `design-os-hq` sibling, by copy-in, with **no commit and no push**. Report it, or report
   BLOCKED — never report done on a same-machine green. **G7 (G-CI) is a separate, later,
   owner-side gate** and its absence today is expected, not a failure.

8. **[R2] A machine column a human can hand-edit is not a generated column, and an evidence
   sentence is not audited by any test.** Two of Amendment 2's five defects are invisible to every
   gate in this repo: the linter trusts the matrix's `family` cell (C1) and the ledger README's
   evidence prose overclaims (C3). The fix for the first is a new check; the fix for the second is
   **wording, verified by reading** — grep the ledger README for `B4` and for `not performed`
   before you call C3 done.

**Read-only evidence** (never edit): `docs/research/canvas-ui/**` — **one carve-out (C4):
`docs/research/canvas-ui/implementation-evidence-260725.md` is CREATED by this change; no
pre-existing file in that directory is modified.**
**Machine-local, never touched:** `references/**` · `taste/**` (the previously written
`references/canvas-ui/**` stays put as the owner's **non-canonical legacy mirror**).
**Protected, out of scope** (other sessions' in-flight work — do not stage, do not touch):
`feedbacks/**` · `figma-agent/plugin/**` · `specs/015-**` · `specs/021-**` · `.agents/` ·
`.codex/`.

---

## Group 0 — Current-tree hygiene *(first; and the step most likely to silently poison the rest)*

**All work happens in `/Users/jang/Products/ease-design`, the current tree, on the current
branch.** The spec and its research are already here at their real paths — nothing to relocate,
nothing to reproduce elsewhere. Edits go through `apply_patch`.

**Forbidden for the entire task** (other sessions' uncommitted work is live in this tree, and
this session has no commit authorization): `git branch` · `git worktree` · `git checkout` ·
`git switch` · `git stash` · `git reset` · `git clean` · `git add` · `git commit` · `git push` ·
copying/moving/renaming the input trees. Read-only git (`status`, `diff`, `rev-parse`, `log`)
only.

- [ ] **0.1** `git rev-parse --show-toplevel` returns `/Users/jang/Products/ease-design`.
      Anything else → **BLOCKED**; every path below is wrong for that tree.
- [ ] **0.2** **Record the baseline before any edit** — save as text, do not eyeball:
      `git status --porcelain` (full list) **and** `git diff` scoped to each protected modified
      path (`feedbacks/README.md`, `figma-agent/plugin/manifest.json`,
      `figma-agent/plugin/src/ui/ui-relay.ts`, `figma-agent/plugin/ui.html`,
      `specs/015-world-class-learning-loop/research/higgsfield-reference-ledger.md`).
- [ ] **0.3** Confirm the four gates green **here, before any edit** — the baseline any later
      "pre-existing failure" claim is measured against. Scar: an executor reported "4
      pre-existing failures" while the reference tree was clean.
- [ ] **0.4** Read `spec.md` / `plan.md` / `tasks.md` and `docs/research/canvas-ui/**` **in
      place**. Confirm `docs/research/canvas-ui/FABLE-VERDICT.md` opens. One copy of the
      contract exists; keep it that way.
- [ ] **0.5** **Destination allowlist — edit nothing outside it, via `apply_patch` only:**
      **[R] CREATE:** `knowledge/canvas-ui/README.md` · `knowledge/canvas-ui/catalog.json` ·
      `src/commands/knowledge-effect-matrix.ts` ·
      **[R2] `docs/research/canvas-ui/implementation-evidence-260725.md`** (C4 — the only
      permitted write under `docs/research/canvas-ui/`) · **[R2] the Art IX split module carved
      out of `src/core/knowledge-effect-catalog-check.ts`** (C1 — 199 lines today; the drift check
      crosses 200, so name and create the second module).
      **MODIFY:** `knowledge/canvas-effect-direction.md` · `knowledge/README.md` ·
      **`knowledge/authoring-standard.md`** · `templates/skills/canvas-effect.md` ·
      `templates/workflows/{generate,refine,redesign}.md` · `src/adapters/templates.ts` ·
      `src/adapters/skill-refs.ts` · `src/core/knowledge-effect-catalog-check.ts` ·
      `src/core/knowledge-effect-matrix-emit.ts` · `src/core/knowledge-lint.ts` ·
      **`src/core/knowledge-link-check.ts`** ·
      `src/core/command-signatures.ts` · `src/commands/knowledge.ts` ·
      **`src/adapters/claude.ts`** · **`src/adapters/antigravity.ts`** ·
      **`src/commands/init.ts`** ·
      `tests/knowledge-effect-catalog.test.ts` · `tests/knowledge-effect-matrix-emit.test.ts` ·
      `tests/adapters-canvas-effect-routing.test.ts` · the knowledge-lint test file covering
      `provenance-*` findings (**grep for it — do not guess the filename**) ·
      the six test-count sites in spec §9
      (`tests/adapters-antigravity.test.ts` · `tests/adapters-claude.test.ts` ·
      `tests/cmd-init-built-binary.test.ts` · **`tests/cmd-init.test.ts`**) · plus whatever the
      `knowledge.ts` split or the second subcommand breaks (grep the suite).
      **[R] REMOVED from the allowlist: `references/canvas-ui/**`** — machine-local symlink; do
      not write it, do not delete it, do not read it.
      A path outside this list — even one that merely *looks* related — is a **STOP**.
- [ ] **0.5b** **Narrow permit on the three new `src/` entries: comments and help-string text
      ONLY** (E8c). `src/adapters/claude.ts` `:6` `:8` `:75` · `src/adapters/antigravity.ts`
      `:6` `:8` `:74` · `src/commands/init.ts` `:78` `:81`. Numerals only — no statement,
      expression, import, or export. A code change in those three files is a **STOP**, exactly
      like an unlisted path, and 0.6's diff comparison is where it gets caught.
- [ ] **0.6** **Prove isolation after implementation, before reporting:** re-run
      `git status --porcelain` and the same scoped diffs from 0.2, compare against the recorded
      text. Every protected path byte-identical; status delta only allowlisted paths. Scar
      `guard-skip-is-a-silent-noop` — a step that quietly did nothing still exits 0; verify the
      artifact, never the exit code. Do not substitute "I only edited allowlisted files" for the
      comparison.
- [ ] **0.7** If 0.1 or 0.6 fails → **BLOCKED**, stop, report. A moved protected path is not
      yours to repair: you cannot commit, revert, or check out, and improvising a fix destroys
      another session's uncommitted work.

## Group A — The reference ledger, at its corrected home *(blocks B and D)*

- [ ] **A1 [R]** Create **`knowledge/canvas-ui/README.md`** — tracked, in this repo: upstream URL,
      pinned revision `728550d4523e1b8bef834b64b3e936c215cad630`, capture month, MIT + Commons
      Clause summary, the **`family` AND `overlayFallback` derivation rules**, the refresh
      procedure, the **browser-note discrepancy record** (B10 below), and an explicit sentence
      that **no upstream source is stored here**. Reuse the existing prose behind the symlink as
      the starting point; retarget every path. Precedent for machine-data-under-`knowledge/`:
      `knowledge/benchmarks/` and `knowledge/personas/personas.json`.
- [ ] **A2 [R]** Create **`knowledge/canvas-ui/catalog.json`** in the amended shape (spec §4):
      `{upstream, revision, captured, license, effects:[{slug, name, family, overlayFallback}]}`.
      Roster and revision carry over unchanged (25 effects: 22 `live-html` + 3 `object`).
- [ ] **A3 [R]** Migrate the schema. `family` ∈ **`live-html` | `object`** — the `overlay` value
      is **deleted**, not deprecated: it had zero members at the pin, and an enum value with no
      members that the release benchmark depends on is a modeling error. **Delete the ledger
      README's "recorded discrepancy for the benchmark owner" paragraph** about it — that
      paragraph was the tell, and the model, not the note, is what needed fixing.
- [ ] **A4 [R]** Derive **`overlayFallback: boolean` for every effect** at the pinned revision:
      does the implementation ship a WebGL overlay path that does **NOT** read the live DOM?
      `object` rows are `false` by construction. Write the derivation rule into the README beside
      the `family` rule, in reproducible form. **Underivable for any effect → BLOCKED** (plan
      § Deviation 1b) — capability (b) of the benchmark selects its subject by this field.
- [ ] **A5** Verify the roster count at the pinned revision (25). **If it differs, the ledger is
      right and the research note is stale** — record the discrepancy in
      `knowledge/canvas-ui/README.md`; never edit the ledger to match prose.
- [ ] **A6** Confirm no upstream description text, API name, or code appears in either file
      beyond the display name. **This matters MORE now, not less** — `knowledge/` is a *published*
      tree (T6b is the fail-closed key allowlist).
- [ ] **A8 [R2]** **Fix the ledger README's evidence claims (C3 — spec B12).** Two rewrites and
      one deletion, all in `knowledge/canvas-ui/README.md`:
      (a) **`family`** — `:39-42` says `object` was "checked against each effect's own source
      tree" and then supports it with a documentation statement about the three 3D effects. Write
      the act that actually happened. **Class-level is acceptable and is written as class-level.**
      (b) **`overlayFallback`** — `:62-75` is **one** architectural fact at the pin applied to the
      22 `live-html` rows **as a class**. Say exactly that, in one paragraph, with its source and
      the pin, and **keep the falsification condition** (one upstream-documented opt-out flips
      that row to `false` and is recorded as a discrepancy) — that is what makes a class claim
      checkable instead of merely broad.
      (c) **DELETE the B4 clause** at `:76-83` ("that per-file confirmation is not performed in
      this repository (B4 — no vendoring, no porting…)"). **B4 forbids vendoring, porting, and
      redistribution; it has never forbidden READING upstream source** — this spec's entire
      research is reading. State the real reason (not performed at this pin) and stop. An invented
      constraint is worse than an overclaim: it teaches the next reader a rule that does not exist.
      **Verify by grep**: no `B4` and no boundary id appears as the reason a check was skipped.
- [ ] **A9 [R2]** **Purge the ledger README of upstream API identifiers and verbatim upstream
      prose (C2 — spec B2).** It is a **packaged** file that **no gate reads** — which is how it
      came to carry: the html-in-canvas draw-API names (`:44`, `:104-105`), the WebGPU variant
      (`:105`), the `chrome://flags/` switch (`:103`), and three **quoted** upstream README/docs
      blocks (`:64-66`, `:68-72`, `:108-112`). Paraphrase every quotation into DESIGN:OS's own
      words; delete every API identifier — the capability is describable without one ("redraws the
      live DOM into a canvas surface").
      **PRESERVE, and do not treat as collateral:** the official Chrome URL (`:99`), the
      `checked:` date (`:100`), the milestone numbers, the pinned revision, and the whole
      discrepancy record. **A URL is a citation, a date is a fact, a milestone number is a fact —
      none is expression.** Deleting the citation to satisfy B2 breaks B11 and fails this task;
      T6e (E7d) asserts both directions.
- [ ] **A7 [R]** **Do not write, delete, or read `references/canvas-ui/**`.** The previously
      written copies stay as the owner's non-canonical legacy mirror, outside every gate. Two
      hand-maintained rosters is the failure mode; one canonical + one abandoned mirror that
      nothing reads is the decided outcome. Writing there is a STOP.

## Group B — The knowledge file *(depends on A)*

- [ ] **B1** **Amend** `knowledge/canvas-effect-direction.md` (exists, 157 lines, untracked — see
      READ FIRST 0c) so it holds authoring-standard shape:
      `Purpose → Mental Model → When to Use / When NOT → Content → Failure Modes`
      (Failure Modes **mandatory**). Naming precedent: `knowledge/gsap-motion-direction.md`.
- [ ] **B2** Write the gate at the top **and again at the matrix**: reachable ONLY after
      `knowledge/motion-craft.md`'s ladder selects T6 *and* the persona cap allows T6
      (`High / expressive`). Authoring-standard rule (d) — a reader arriving mid-file never
      saw the preamble.
- [ ] **B3** Write the T6 floor (spec §5.2): narrative intent · complete
      static/reduced-motion/unsupported fallback preserving content, controls, focus order,
      and contrast — **not merely paused** · visual verification · teardown · provenance note
      with the upstream revision, re-checked at use time.
- [ ] **B4** Write the one-effect-per-viewport cap and the **Tenant Law binding** for embedded
      use (`knowledge/motion-craft.md` § Tenant contract): `ui tenant-lint` passes; off-screen
      pause must actually **disarm**; an upstream visibility observer counts only when
      evidenced at page level.
- [ ] **B5** Write the Draco clause once in doctrine and once per `object` row: the default
      Google-hosted decoder is **NOT ALLOWED** in generated output; self-host or an explicit
      per-destination permit. State the WHY (an undisclosed third-party CDN dependency in the
      user's shipped page).
- [ ] **B6** Write the matrix — one row per ledger slug:
      `| Effect | slug | family | Narrative job | Anti-use | Required fallback |`.
      Seed `Narrative job` + `Required fallback` from
      `docs/research/canvas-ui/integration-brief.md` (already DESIGN:OS's own words — no
      upstream prose copied); **re-verify every row against the pinned revision**.
- [ ] **B6b [R]** Rewrite the family paragraph above the matrix (currently
      `knowledge/canvas-effect-direction.md:75-85`) to the **2-family + overlay-as-MODE** model:
      `family` is `live-html` or `object`; the WebGL-overlay behaviour is per-effect
      `overlayFallback`, not a family. **Delete every sentence about a reserved/empty `overlay`
      family** — including the line at `:79` (`no effect in the current 25-name roster is
      overlay`). **The matrix stays SIX columns** — `overlayFallback` is a required *ledger* field,
      never a matrix column (spec §8.1, decided at stage 2; an earlier draft left this as "the
      emitter's call", which was a fork across five files). So this paragraph is where a reader
      learns the mode exists and that the ledger is where to read it per effect.
- [ ] **B7** Write `Anti-use` **per row**. This is the field that stops novelty-first
      selection. A generic platitude is not an anti-use — if a row has no honest one, report
      BLOCKED (plan § Deviation 2).
- [ ] **B8** Add the install-handoff section **inside the marker pair**, exactly:
      `<!-- ease:install-handoff:start -->` … `<!-- ease:install-handoff:end -->`.
      Primary = the emitted **direct upstream CLI command**; shadcn MCP is opportunistic
      convenience when the host exposes it — never a requirement, never in `ui`.
- [ ] **B9** Add the provenance marker under the matrix heading:
      **[R]** `<!-- ease:source ref="knowledge/canvas-ui/catalog.json" captured="YYYYMM" url="https://canvasui.dev/components" -->`
      (`provenance-bad-grammar` fails a dead ref; the new `provenance-machine-local-ref` fails a
      ref into `references/**` or `taste/**` **even where the symlink makes it resolve**).
- [ ] **B9b [R]** Retarget the file's other five `references/canvas-ui` mentions (`:6`, `:43`,
      `:80`, `:83`, `:129` — `:74` is the marker, handled by B9; six in the file all told)
      **and** the `knowledge/README.md:18` index-row description, which also names the old path.
      **The grep is the authority, not this line list** — spec §8.4 carries the full 31-site
      inventory, and the two sites outside this group are `templates/skills/canvas-effect.md:54`
      (C7b) and the routing test (E6c).
- [ ] **B10 [R]** Rewrite the origin-trial note (`:47`). Note that trial expiry degrades
      `live-html` effects to their static baseline — a **designed-for outcome**, not a defect,
      because B6 already requires that baseline to be complete. **The milestone facts come from
      CURRENT OFFICIAL Chrome origin-trial documentation, with the source URL and a
      `checked: YYYY-MM-DD` date inline** (B11) — fetch it yourself. The bare relayed
      "Chrome 148–150" does **not** stand; official material surfaced during the reopen already
      reports an extension beyond it (leads, not evidence:
      `FABLE-VERDICT-reopen-260725.md` §5). Record the delta vs. the upstream README as a
      discrepancy in `knowledge/canvas-ui/README.md`. **No browser or upstream API identifier
      enters `knowledge/`** — B2 binds regardless of who published the name.
- [ ] **B11** Write Failure Modes — observable, not platitudes. Minimum set: effect chosen for
      novelty with no narrative sentence · a "fallback" that is a paused animation · two
      effects in one viewport · an object effect shipping the default Draco CDN · a stale
      revision note.
- [ ] **B12** Add the index row to `knowledge/README.md` § The files, or `ui knowledge check`
      fails `index-missing-row`.
- [ ] **B13 [R2]** **Purge `knowledge/canvas-effect-direction.md` (C2 — spec B2).** Two sites in
      the current file: the bare API identifier at **`:160`** (Failure Modes — "two
      `drawElement`-driven surfaces") → paraphrase to "two live-DOM-into-canvas surfaces"; and the
      **quoted** upstream milestone phrase at **`:50`** → state the upstream claim in our own
      words. **The official URL and `checked:` date at `:47-49` STAY** — they are the B11 evidence
      trail, and T6e asserts their presence. **The grep is the authority**: re-sweep the whole file
      for API identifiers before ticking this, since `:160` was not in any earlier site list.

## Group C — The selective skill and its routing *(depends on B)*

- [ ] **C1** **Amend** `templates/skills/canvas-effect.md` (exists, 78 lines, untracked) to mirror
      `templates/skills/gsap-motion.md`: frontmatter `description:` then
      `## Read → ## Direct → ## Implement → ## Verify`.
- [ ] **C2** The description is a **hard gate** —
      `tests/adapters-template-descriptions.test.ts:38-47` requires **> 40 characters** and a
      match on `/Use /`. It must also carry a when-NOT clause and name the **web-only**
      boundary, or a host model reading only the description will pull it into
      `design` / `to-figma`.
- [ ] **C3** `## Read`: `knowledge/motion-craft.md` FIRST, and **stop there when T1–T5
      suffices**; `knowledge/canvas-effect-direction.md` only after T6 is justified.
- [ ] **C4** `## Direct`: **build and verify the complete static baseline BEFORE selecting an
      effect** (spec B6). This ordering is the skill's main divergence from gsap-motion; do
      not reorder it into a post-hoc fallback step.
- [ ] **C5** `## Implement`: the install handoff **inside the same marker pair as B8**; one
      effect per viewport; tenant contract when embedded; the Draco decision for `object`
      effects; teardown ownership.
- [ ] **C6** `## Verify`: normal + reduced-motion + unsupported captures, clean console,
      unmount leak check, WebGL context-loss recovery to the static fallback, and — for
      `object` — asset load **and error** states.
- [ ] **C7** The skill body contains **no** Canvas UI API surface, parameter table, prop name,
      or code snippet. It points at upstream docs *at use time*; it never caches them.
- [ ] **C7b [R]** **Retarget `templates/skills/canvas-effect.md:54`** —
      `Resolve <slug> from references/canvas-ui/catalog.json` → `knowledge/canvas-ui/catalog.json`.
      **This site is in NEITHER the reopen verdict's known-site list NOR any earlier task list**;
      it surfaced in the stage-2 grep (spec §8.4). It sits inside the install-handoff block in a
      **published** tree (`templates/` is one of `package.json.files`'s four entries), so a
      shipped skill would point users at a machine-local symlink — the same bug as the knowledge
      file's, one tree over. T7 (E10) sweeps `templates/` and fails until this is fixed.
- [ ] **C11 [R2]** **Sweep the skill for the same two classes (C2 — spec B2).** No upstream or
      browser API identifier and no quoted upstream span over 12 words anywhere in
      `templates/skills/canvas-effect.md`. `templates/` is packaged; T6e covers this file too.
      C7 already forbids an API *table* — C11 is the identifier-and-quotation half, which is what
      the ledger README slipped through.
- [ ] **C8** Register in `src/adapters/templates.ts` § `SKILL_NAMES`: append `"canvas-effect"`.
- [ ] **C9** Route in `src/adapters/skill-refs.ts` § `VERB_SKILL_REFS`: add to `generate`,
      `refine`, `redesign` — **and nothing else** (the exact three verbs already routed to
      `gsap-motion`).
- [ ] **C10** Add one routing sentence to `templates/workflows/{generate,refine,redesign}.md`,
      mirroring `generate.md` §5's existing `design-os-gsap-motion` sentence: invoke the skill
      **after** the ladder selects T6, never to satisfy a motion-intensity number.
      **Do not paste any effect name or matrix content into a workflow file** — that is
      exactly what test T3 fails on.

## Group D — The emitter AND the checks *(depends on A + B; the Art II obligation)*

**Both halves or neither.** A handwritten matrix is not an emitter — that was the flaw in the
reviewed draft. D0a–D0d ship the emitter; D1–D6 ship the linter.

- [ ] **D0a** **Amend** `src/core/knowledge-effect-matrix-emit.ts` (exists, 86 lines, untracked;
      its `FAMILIES` set at `:20` and its `BAD_LEDGER` message at `:70` still carry the
      three-value enum) — pure, **FS-free**, under 200
      lines (Art IX), exporting
      `emitEffectMatrix(catalogJson, { captured }) → { ok: true; markdown } | { ok: false; code; message }`
      (spec §8.1). No clock, no fs, no network — `captured` is passed in, never read from
      `Date` (Art I.2).
- [ ] **D0b** Emit, in order and nothing else: the `ease:source` marker (once) · the matrix
      header + separator · one row per ledger effect **in ledger order**, with
      `Effect`/`slug`/`family` from the ledger and `Narrative job`/`Anti-use`/`Required
      fallback` **EMPTY**. **[R] SIX columns — `overlayFallback` is ledger-only and is NOT
      emitted as a seventh column** (spec §8.1, decided; the header, the linter's row parser, T6b,
      the M-fixtures and the knowledge matrix all stay six-wide together). The empty cells are
      deliberate: they fail `effect-catalog-field-empty` until a human writes them. **Never emit a
      default or placeholder into those three cells** — `Anti-use` is precisely the field whose job
      is honest refusal, and an invented one is worse than a missing one.
- [ ] **D0c** Wire the `effect-matrix` subcommand:
      `ui knowledge effect-matrix [--dir <repo-root>] [--json]`, reads
      **[R]** `knowledge/canvas-ui/catalog.json` — one
      `join(<dir>, "knowledge", "canvas-ui", "catalog.json")`, **never** a `references/` probe —
      and **prints to stdout; it never writes into `knowledge/canvas-effect-direction.md`** (it
      would clobber the hand-written prose cells).
      Codes: `BAD_ARG` · `UNKNOWN_FLAG` · `NO_LEDGER` · `BAD_LEDGER` · `READ_ERROR`.
      Precedent for the emit-a-canonical-artifact shape: `ui tenant-scaffold`.
      **[R] The IO lands in `src/commands/knowledge-effect-matrix.ts`, NOT in `knowledge.ts`** —
      `knowledge.ts` is already 212 lines, so "add it here, split it in D0c2" would knowingly widen
      an Art IX breach and then undo it. `knowledge.ts` keeps the `check` IO and the dispatch;
      the new module owns `runEffectMatrix` and its help/error text. D0c and D0c2 are **one** edit
      sequenced as two checkboxes, not two states of the file.
- [ ] **D0c2 [R]** **Complete the split of `src/commands/knowledge.ts` (212 lines — over Art IX's
      200 ceiling).** After D0c, `knowledge.ts` holds dispatch + `check` and
      `src/commands/knowledge-effect-matrix.ts` holds the `effect-matrix` IO. **No observable
      behavior change**: same subcommand names, help text, error codes, JSON envelopes. Verify
      **both** files `< 200` with `wc -l` — measured, not eyeballed — and re-run the
      subcommand/help/signature-parity grep afterwards (a split that drops a case from the switch
      is the same drift, one refactor later). Any test importing from `src/commands/knowledge.js`
      still resolves, or is updated in this same change.
- [ ] **D0d** Register in `src/core/command-signatures.ts` (`knowledge.effect-matrix`) **and**
      in `KNOWLEDGE_HELP`'s `Subcommands:` block, **and** in the `run()` switch. All three are
      hand-maintained — **verify parity across the three**; present-in-one/absent-in-another is
      exactly the drift Art II exists to stop. Then grep the suite for tests asserting the
      `knowledge` subcommand set or help text and update what the second subcommand breaks.
- [ ] **D1** **Amend** `src/core/knowledge-effect-catalog-check.ts` (exists, **198 lines**,
      untracked; `FAMILIES` at `:15` still carries the three-value enum) — pure, **FS-free**, under
      200 lines (Art IX), exporting `effectCatalogChecks(input): KnowledgeFinding[]`. Model on
      `src/core/knowledge-link-check.ts`. **Do not read files from this module** (Art IV — the
      command owns IO).
- [ ] **D2** Implement all **eight** checks from spec §8 (seven original + `effect-catalog-row-drift`, D2d):
      `effect-catalog-missing-ledger` (error) · `effect-catalog-revision-drift` (error) ·
      `effect-catalog-slug-unknown` (error) · `effect-catalog-slug-missing` (error) ·
      `effect-catalog-field-empty` (error) · `effect-catalog-draco-missing` (error) ·
      `effect-catalog-stale` (warning, 6-month cadence — reuse the `STALE_MONTHS` shape at
      `src/core/knowledge-lint.ts:56`).
- [ ] **D2b [R]** Migrate the ledger validation with the schema: `family` accepts exactly
      `live-html` | `object`; **`overlayFallback` is REQUIRED and must be boolean**. A ledger
      missing it, or carrying `family: "overlay"`, fails — in the **linter** and in the emitter's
      `BAD_LEDGER` path (M5), same change. Module is 198 lines today: **crossing 200 means split,
      not merge** (Art IX).
- [ ] **D2d [R2]** **The machine-column drift contract (C1) — the defect the stage-4 review
      found, and the one that silently disarms B8.** Today `parseMatrixRows` reads `family` from
      the matrix (`knowledge-effect-catalog-check.ts:63-83`) and `effect-catalog-draco-missing`
      gates on that cell (`:170`). **Relabel an `object` row `live-html`, delete its Draco clause,
      and the linter reports nothing.**
      (a) Add **`effect-catalog-row-drift` (error)**: for every row whose slug **is** in the
      ledger, compare the matrix's `Effect` cell to `name` and the `family` cell to `family`.
      Slugs stay covered by `slug-unknown` + `slug-missing`; **say so in the module header
      comment** — together the three checks close all three machine columns, and that closure is
      the contract.
      (b) **Deterministic output (Art I.2), specified — do not invent an order:** findings in
      **matrix row order**, and within a row **`name` before `family`**. Message shape, fixed:
      `matrix row '<slug>' <field> '<matrix value>' does not match knowledge/canvas-ui/catalog.json's '<ledger value>'`.
      (c) **Key `effect-catalog-draco-missing` on the LEDGER entry's family**, never on
      `row.family`. A row whose slug is not in the ledger makes **no** Draco claim (`slug-unknown`
      already fires). **`row.family` may be read for exactly one purpose: reporting drift.**
      (d) **Art IX: the module is 199 lines — this crosses 200. SPLIT it** (matrix parsing +
      row comparison into their own module). Do not merge into the emitter, do not delete comments
      to buy room; `wc -l` decides, both files under 200.
      (e) Add the checkId to `KNOWLEDGE_HELP`'s `Checks:` block, `knowledge-lint.ts`'s header
      comment, and the `knowledge.check` signature `summary` — the same three-site parity D0d warns
      about.
- [ ] **D9 [R2]** **Stop resolving refs against `references/` (C5).**
      `src/commands/knowledge.ts:124-129` builds `repoFiles` from `knowledge/**` **plus a walk of
      `references/**`** behind an `existsSync` — a tracked gate reading through the private
      symlink (B10), whose guard turns CI's absence into silence (scar
      `guard-skip-is-a-silent-noop`). The walk exists to let an `ease:source` ref target the
      private corpus, which `provenance-machine-local-ref` now makes an **error**: the resolver and
      the rule contradict each other.
      (a) **Grep first, then delete** — confirm **zero** `ease:source` markers under `knowledge/`
      target `references/` or `taste/` (record the output); a hit is a finding to fix at its
      source, never a reason to keep the walk.
      (b) Delete the walk **and** the `:124` comment naming `references/**` as a legal ref target;
      `repoFiles` becomes `knowledge/**` only.
      (c) **One defect, one finding — decided, not the implementer's call:** a ref matching the
      machine-local prefix emits **`provenance-machine-local-ref` ONLY**; suppress
      `provenance-bad-grammar`'s dead-ref finding for that same marker. Without this, removing the
      walk makes every such ref fire twice and the second message points at the wrong fix (making
      it resolve). Cover both halves in the knowledge-lint suite: machine-local ref → exactly one
      finding with the right checkId; an ordinary dead ref → still `provenance-bad-grammar`.
- [ ] **D2c [R]** Retarget every path literal and message string in **this group's** files:
      `knowledge-effect-catalog-check.ts` **×7** (`:5`, `:109`, `:128`, `:147`, `:148`, `:157`,
      `:193`); `knowledge-effect-matrix-emit.ts:76` (the emitted `ease:source` ref);
      `command-signatures.ts:879,882`; `knowledge-lint.ts:41` (doc comment);
      `commands/knowledge.ts` **×6** (`:31`, `:41`, `:47`, `:67`, `:155`, `:168` — four in
      `KNOWLEDGE_HELP`, one doc comment, one `NO_LEDGER` message). **Sites outside this group are
      covered elsewhere:** `knowledge/canvas-effect-direction.md` ×6 + `knowledge/README.md:18`
      (B9b) · `templates/skills/canvas-effect.md:54` (C7b) · the routing test ×4 (E6c) · the
      matrix-emit test ×2 (E6b). **Spec §8.4 is the full 31-site inventory; the grep at execution
      time outranks it.** **End state: zero occurrences of `references/canvas-ui` in the WORKING
      TREE under `knowledge/`, `templates/`, `src/`, `tests/`** — not "in tracked files": these
      files are untracked, so `git grep` reads none of them. A finding that points at a path which
      does not exist is worse than no finding.
- [ ] **D3** Wire into `src/core/knowledge-lint.ts`: call inside `lintKnowledge()`; extend
      `KnowledgeLintInput` with `canvasCatalogJson: string | null`.
- [ ] **D4** Wire IO in `src/commands/knowledge.ts`: read
      **[R]** `knowledge/canvas-ui/catalog.json` when present — one
      `join(knowledgeDir, "canvas-ui", "catalog.json")`, inside the tree the command already
      walks; the feature's separate `references/` probe **disappears**. **Both absent = silent** (nothing
      adopted yet); knowledge file present with no ledger = `effect-catalog-missing-ledger`.
- [ ] **D5** Extend the `knowledge.check` `summary` in `src/core/command-signatures.ts` to
      name catalog drift. No new flags.
- [ ] **D6** **Art III — run against the real tree**, not only fixtures. All eight of this
      repo's dogfood findings came from real data and zero from fixtures.
- [ ] **D7 [R]** **The shared-layer fix (spec §8.3, Artifact F) — both halves, this change:**
      (a) add the machine-local-ref rule to `knowledge/authoring-standard.md` § provenance
      markers (`:90`): a `ref` must point to a file **tracked in this repo**; a ref into
      `references/**` or `taste/**` is invalid **even when it resolves locally**;
      (b) add **`provenance-machine-local-ref` (error)** to `provenanceChecks()` in
      `src/core/knowledge-link-check.ts` — **matching on the ref's PREFIX, never on resolution**
      (a resolution test is green exactly where the bug lives, because this machine has the
      symlink); (c) list it in `KNOWLEDGE_HELP`'s `Checks:` block and `knowledge-lint.ts`'s header
      comment. Art IV — the fix goes at the shared layer, not at the site where it surfaced.
- [ ] **D8 [R]** **Sweep for other consumers of the same blind spot** (Art IV): any tracked gate,
      test, script, or knowledge ref that reads through `references/**` or `taste/**`. Two are
      already known — the canvas `ease:source` marker (D7 covers it) and
      `tests/adapters-canvas-effect-routing.test.ts:57`'s `references` walk root (E6c). **Record
      the sweep's output**; finding a third is the sweep working, not a scope breach.

## Group E — Tests

- [ ] **E1** **Amend** `tests/knowledge-effect-catalog.test.ts` (exists, 140 lines, untracked):
      one case per checkId firing, one
      clean-catalog case with zero findings, one both-absent case with zero findings.
      **[R]** Every fixture ledger carries `overlayFallback` on every effect and only the
      two-valued `family` enum; add cases for a `family: "overlay"` ledger and a missing/
      non-boolean `overlayFallback` (both must fail).
- [ ] **E1b [R2]** **Drift cases (C1) — five, and the first one IS the correction:**
      (a) **The relabel case.** Ledger carries an `object` effect; the matrix row writes
      `family` = `live-html` **and drops the Draco clause** from `Required fallback`. Assert
      **both** `effect-catalog-row-drift` (on `family`) **and** `effect-catalog-draco-missing`.
      **This fixture yields ZERO findings against today's linter — run it before the fix and
      record that**; a version of this test that passes pre-change has been written wrong.
      (b) **Display-name drift** — `Effect` cell ≠ ledger `name`, same slug → drift on `name`.
      (c) **Both fields** — exactly two findings, order asserted: `name` then `family` (Art I.2;
      the order is specified in spec §8.2, not incidental).
      (d) **Unknown slug makes no Draco claim** — a row absent from the ledger fires
      `slug-unknown` and **no** `draco-missing`, whatever its family cell says.
      (e) **No false positives on a clean matrix** — backtick-wrapped slugs, spacing, and case are
      the traps; normalise the way the row parser already does.
- [ ] **E2** **Amend** `tests/adapters-canvas-effect-routing.test.ts` (exists, 232 lines,
      untracked; see E6c for its four retarget sites) — T1: `VERB_SKILL_REFS`
      `generate` / `refine` / `redesign` each contain `"canvas-effect"`.
- [ ] **E3** T2: **every other verb** does not contain it — iterate `Object.keys`, do **not**
      hardcode the exclusion list, so a future verb fails closed.
- [ ] **E4** T3 (**release-blocking, catalog leakage**): no file under `templates/workflows/**`
      contains any ledger slug or the string `canvas-effect-direction.md`.
- [ ] **E5** T4: `templates/skills/canvas-effect.md` is the only file under `templates/**`
      referencing `knowledge/canvas-effect-direction.md`.
- [ ] **E6** T5 (**adverse-branch cut line**): the `ease:install-handoff:start/end` pair
      appears in exactly the two files from spec §7, and the upstream install command string
      appears in **no other file under the walked roots** — the roots being exactly `knowledge/`,
      `templates/`, `src/` (E6c). **[R] Not "no other file in the repo"**: an earlier draft claimed
      repo-wide scope while walking three trees, which is an Art VIII overclaim. **Walk the working
      tree**, not the git index — this task commits nothing, so every file it adds is untracked and
      a tracked-files scan would skip exactly the new files the check polices.
- [ ] **E6c [R]** **Four sites in `tests/adapters-canvas-effect-routing.test.ts`, not one.**
      (a) **Drop `references` from the walked roots** — `walkDistributionRoots()` at **`:55`**
      (earlier drafts cited `:57`; `:57` is blank — **the grep is the authority**). Roots become
      exactly `knowledge/`, `templates/`, `src/`. `readdirSync` on an absent directory throws
      `ENOENT`, so **this test CRASHES on a clean clone today, independently of the ledger move** —
      it would turn Group G red even after a correct migration. Coverage is retained: the ledger
      now lives under `knowledge/`.
      (b) `:60` — the `LEDGER` read path → `knowledge/canvas-ui/catalog.json`.
      (c) `:142`–`:143` — T6b's directory assertion → `knowledge/canvas-ui`.
      (d) The `LEDGER` **type declaration** (`:65` area) gains **`overlayFallback: boolean`** with
      the schema; a type omitting a required field lets T6b's "exactly these keys" assertion be
      written against the wrong shape.
      **Consequence for T5's claim:** with three roots, the assertion is "the install command
      appears in no other file **under the walked roots**" — not "in the repo" (Art VIII; spec §9
      T5). `tests/` is covered by T7, not by T5.
- [ ] **E6b** **Amend** `tests/knowledge-effect-matrix-emit.test.ts` (exists, 171 lines,
      untracked) — M1 determinism (identical
      bytes on repeat) · M2 roster fidelity (row per ledger effect, ledger order, columns match)
      · M3 the three prose cells are empty for every row · M4 one `ease:source` marker carrying
      the ledger `captured` · M5 bad-ledger paths return `{ok:false}` with the documented code,
      never a partial matrix · **M6 round-trip: emit → splice into a minimal knowledge fixture →
      `lintKnowledge` → exactly N `effect-catalog-field-empty` findings and ZERO of every other
      checkId.** M6 is the Art II pair-coherence proof; without it the emitter and linter can
      disagree about the row shape and both stay green.
      **[R]** M4 asserts `ref="knowledge/canvas-ui/catalog.json"` (`:89` and `:159` assert the old
      path today); M5 adds the `family: "overlay"` and missing-`overlayFallback` cases; all
      fixtures migrate to the new schema in this same change.
- [ ] **E7** T6 (**release-blocking, no source**) — four assertions, spec §9. The reviewed draft
      claimed "prevents all Canvas UI source in packaged files" while checking only fenced
      imports; that is an Art VIII overclaim and is now split:
      - **T6a [R]** `package.json.files` equals exactly `["dist","knowledge","schemas","templates"]`.
        **The assertion is unchanged; the RATIONALE is reversed.** It proves **no new tree can be
        published silently** — it does *not* prove the ledger is unpublished. `knowledge/` **is**
        published, and the ledger now ships there **on purpose**, so the `ease:source` ref
        resolves inside the tarball. **Delete every "`references/` is not published ⇒ the ledger
        cannot ship" sentence** from this file, the spec, the test header comment, and any code
        comment — surviving ones are an Art VIII overclaim and a release blocker.
      - **T6b [R]** ledger allowlist, **fail-closed**: **`knowledge/canvas-ui/`** holds exactly
        `README.md` + `catalog.json`; every `effects[]` object has exactly
        `slug`,`name`,`family`,**`overlayFallback`**; `family` ∈ the **two** values;
        `overlayFallback` is boolean; top level exactly
        `upstream`,`revision`,`captured`,`license`,`effects`. Extra key, missing key, or extra
        file = fail, whatever it contains.
      - **T6c** content gate on the two packaged files this spec adds
        (`knowledge/canvas-effect-direction.md`, `templates/skills/canvas-effect.md`): the ONLY
        permitted fence is inside the `ease:install-handoff` markers (info string empty/`bash`/
        `sh`, body = the single install command); no `import `/`from "`/`require(`/`export `/
        `<Capitalised`/`useEffect`/`useRef`/`new THREE.`/`=>`; no table header containing
        prop/param/type/default/option (the matrix header is the exact-match exception); the
        upstream package identifier only inside the handoff blocks.
      - **T6d** `src/**` contains the upstream package identifier nowhere — a substring check,
        labelled as such, closing the compiled `dist/` path.
- [ ] **E7d [R2]** **T6e — packaged upstream-content gate (new; C2).** A **separate describe
      block**, not an extension of T6c's `FILES` (T6c asserts exactly-one-fence and handoff-marker
      containment; the ledger README has neither and would fail for the wrong reason). Over the
      **three packaged canvas files**: `knowledge/canvas-effect-direction.md`,
      **`knowledge/canvas-ui/README.md`** (in **no** existing gate today — that is how the API
      names and the quoted paragraphs shipped), `templates/skills/canvas-effect.md`.
      (a) **No upstream/browser API identifier** — the html-in-canvas draw-API names (2D, WebGL,
      WebGPU variants), `chrome://flags/`, and `THREE.`/`three` as a code identifier. **List the
      banned strings explicitly** — a named list is auditable; a clever regex over API-shaped
      words is not.
      (b) **No verbatim upstream quotation** — no quoted span (straight or curly double quotes)
      longer than **12 words** in any of the three. Our own words need no quotation marks.
      (c) **Preservation, asserted positively** — the official Chrome URL, a `checked: YYYY-MM-DD`
      date, and the pinned revision are **present** in both `knowledge/canvas-effect-direction.md`
      and `knowledge/canvas-ui/README.md`. **A test that only forbids rewards deleting the
      evidence trail**; this half is what stops B2 from eating B11.
      (d) **State its limits in the test header** (Art VIII): substring + quotation-shape only —
      it cannot catch an unquoted copy, a renamed identifier, or upstream prose reflowed into our
      voice. The diff audit closes what T6e narrows.
- [ ] **E10 [R]** **T7 — symlink-independence sweep (new).** Over `knowledge/`, `templates/`,
      `src/`, `tests/`: **zero** files contain the string `references/canvas-ui`, and **zero**
      `ease:source` markers under `knowledge/` carry a `ref` beginning `references/` or `taste/`.
      This is the regression test for the bug that revoked the last implementation; the
      `provenance-machine-local-ref` linter (D7) covers future knowledge files this spec never
      touches.
- [ ] **E7b** **State the limits in the test file header and in any report** (Art VIII): these
      are substring/structure checks. They cannot detect a paraphrase, a renamed identifier, an
      algorithm in prose, or source pasted into a file this spec does not touch. **Never claim
      static detection proves "no upstream source".**
- [ ] **E7c** **Residual risk is closed by two human audits, both release gates, both recorded:**
      (1) **diff audit** — under `knowledge/**`, `templates/**`, `src/**`, `references/**`: read
      the FULL `git diff` of every *changed* file **and the FULL contents of every *added*
      file** (nothing is committed, so added files have no diff — a `git diff`-only audit reads
      zero of the new artifacts, which are the whole risk surface), stating per file that no
      upstream implementation content is present (a grep is not a substitute for reading it);
      **[R] the four trees are now `knowledge/**`, `templates/**`, `src/**`, `tests/**`** —
      `references/**` is machine-local and outside the tracked surface;
      (2) **package audit [R] — the expectation is INVERTED**: `npm pack --dry-run`, read the file
      list, confirm the tarball **CONTAINS** `knowledge/canvas-ui/README.md` **and**
      `knowledge/canvas-ui/catalog.json` (**both read in full during the audit**), **no other new
      file**, and no file carrying effect implementation. A ledger *absent* from the tarball now
      means a published knowledge file whose `ease:source` ref dangles. Record the list in release
      evidence. **Missing audit blocks ship exactly as a failing test does.**
- [ ] **E8** Update the six hardcoded-count sites — **numbers only, keep the tripwire**:
      `tests/adapters-antigravity.test.ts:16-17` (28→29, "9 craft"→"10 craft") ·
      `tests/adapters-claude.test.ts:16` (title) ·
      `tests/adapters-claude.test.ts:40` + `tests/adapters-antigravity.test.ts:37`
      (titles "12 artifacts (9 craft + 3 journey)" → 13 / 10 craft) ·
      `tests/cmd-init-built-binary.test.ts:87-88` and `:144` (28→29) ·
      `tests/cmd-init.test.ts:178` (title "…paths has 28 entries") and `:186` (`toBe(28)`→29).
- [ ] **E8b** `tests/cmd-init.test.ts` is the **sixth** site and was absent from the first
      survey — it asserts the same `data.adapters[0].paths.length` for `--runtime claude` as
      `tests/cmd-init-built-binary.test.ts:88` (in-process vs. built binary), and
      `src/commands/init.ts:402` makes that length the adapter artifact count
      (`WORKFLOW_VERBS + SKILL_NAMES + JOURNEY_NAMES`). A tenth skill moves it 28→29. Same rule
      as E8: change the number, **never** rewrite it as `SKILL_NAMES.length`.
- [ ] **E8c** **Source-file count prose — comments and help strings only, numerals only.**
      Nothing fails when these rot, which is why they rotted. Exact sites, read in the current
      tree:
      - `src/adapters/claude.ts:6` — `12 skill files` → `13 skill files`;
        `(9 craft + 3 journey)` → `(10 craft + 3 journey)`
      - `src/adapters/claude.ts:8` — `Total: 28 artifacts` → `Total: 29 artifacts`
      - `src/adapters/claude.ts:75` — `// ── Skill files (9 craft skills)` → `(10 craft skills)`
      - `src/adapters/antigravity.ts:6` · `:8` · `:74` — the identical three edits
      - `src/commands/init.ts:78` and `:81` (inside `INIT_HELP`) —
        `(12 skills: 9 craft + 3 journey)` → `(13 skills: 10 craft + 3 journey)`

      **Preserve behavior.** The artifact set is built from `SKILL_NAMES` / `WORKFLOW_VERBS` /
      `JOURNEY_NAMES` at runtime; these strings are read by humans only. Change no statement,
      no expression, no export. **Do not interpolate `SKILL_NAMES.length`** — same tripwire
      rule as E8. Only observable delta: two substrings of `ui init --help`.
      **Verify** (before and after) that no test asserts these strings; if one does, update its
      number, never its shape, and add it to the allowlist.
- [ ] **E8d** **Standing survey — the closing step of count reconciliation, not a follow-up.**
      Before ticking E8/E8b/E8c done, grep the **working tree** (not the index) for hardcoded
      adapter/skill/artifact counts in prose **and** assertions, then reconcile every hit or
      state why it stays. Record the output in the report.
      ```
      rg -n -i '[0-9]+ +(craft|journey|skill|slash-?command|workflow|artifact)s?\b' \
         -g '!node_modules' -g '!dist' -g '!.git'
      rg -n '(toBe|toHaveLength)\(\s*2[89]\s*\)' tests
      rg -n 'Total: *[0-9]+ +artifacts' src
      ```
      **The site lists in `spec.md` are one survey's snapshot; the grep is the authority.** Both
      prior surveys came back incomplete on this task — the first missed
      `tests/cmd-init.test.ts` (six sites, not five), the second surfaced
      `src/adapters/claude.ts:8` + `src/adapters/antigravity.ts:8` (`Total: 28 artifacts`).
      A stale count found after reconciliation closes is a **reconciliation failure**.
- [ ] **E9** Confirm the already-dynamic suites pass **without edits** —
      `tests/adapters-templates.test.ts` (fs↔registry parity) and
      `tests/adapters-template-descriptions.test.ts`. If either needs an edit, something in
      Group C is wrong; fix Group C, not the test.

## Group G — The clean-clone proof, in two halves *(runs LAST among implementation groups; gates them all)*

**This group was referenced four times above and did not exist. It does now.** Spec §9 splits the
evidence because the two halves run on different clocks and prove different things; reporting one
as the other is the failure this group exists to prevent.

| | **G-now (G1–G6)** | **G-CI (G7)** |
|---|---|---|
| Runnable | **now, no commit, no push** | only after the owner commits + pushes |
| Proves | nothing reads through the private symlink | additionally: the files are in the repository |
| Gates | **implementation-complete** (spec §11.8b) | **release** (spec §11.13b) |

- [ ] **G1** `git clone` this repo into `$(mktemp -d)` with **no `design-os-hq` sibling**. From
      *that* directory verify `references` and `taste` do **not** resolve. A local `git clone` is
      read-only against the source tree and the temp tree is disposable — this is the **one**
      carve-out to Group 0's no-copy rule, and it is **not** a carve-out to no-commit/no-push.
- [ ] **G2** **The clone carries only committed content and this session commits nothing** — so
      copy the working-tree files (the Group 0.5 allowlist paths) into the temp tree. This is the
      only method available. **Do not commit or push to make the gate easier**, and do not treat
      "the owner could authorize a commit" as a path this session may take (Group 0's forbidden
      list is unconditional). If copy-in is impossible → **BLOCKED**, everything else complete.
- [ ] **G3** **`ls knowledge/canvas-ui/` BEFORE reading any exit code** — `README.md` and
      `catalog.json` must both be there. Scar `guard-skip-is-a-silent-noop`: a run that silently
      lacked the new files exits 0 too, and that is precisely how this bug shipped last time.
- [ ] **G4** In the temp tree: `npm ci` → `npm run typecheck && npm run lint && npm run build &&
      npm test` → `node dist/cli.js knowledge check`. **All green; record the FULL output.**
- [ ] **G5** **Grep proofs, recorded** — run over the working tree, not the git index:
      `grep -rn 'references/canvas-ui' knowledge templates src tests` → **0 hits** (31 today, spec
      §8.4); `grep -rn 'ease:source ref="references/' knowledge` and the same for `taste/` →
      **0 hits**.
- [ ] **G6** **Trackability proxy, recorded** — the one thing G-now cannot otherwise see. For
      every new path: `git check-ignore -v <path>` exits **non-zero** (not ignored) and
      `git status --porcelain` lists it as `??`. A file that is on disk, passes every gate, and is
      silently `.gitignore`d reproduces the exact bug this correction undoes. This is a **proxy**
      for "it will reach the repository", not a proof — say so.
- [ ] **G6b [R2]** **Write the run into the tree (C4) — create
      `docs/research/canvas-ui/implementation-evidence-260725.md`.** G-now ran last time and its
      commands, outputs, and limits died with the session report; a claim whose conditions are not
      in the repository is the reopen's own failure shape, one layer up. Contents, in this order
      (spec §9.7): the temp-tree path + the verification that `../design-os-hq` is absent and
      `references`/`taste` do not resolve there · **every command verbatim with its exit code**, in
      run order (clone, copy-in with the paths listed, `ls knowledge/canvas-ui/` **before** any
      exit code was read, `npm ci`, the four gates, `node dist/cli.js knowledge check`) · the grep
      proofs with real output and the count they came down from · the trackability proxy per new
      path · the Group 0.6 isolation result · **G-CI's read-only status today, marked *pending —
      blocked on owner*** · and a mandatory **"What this does not prove"** section carrying all
      six items: files not committed (copy-in; G6 is a proxy) · G-CI has not run · T6a–T6e and T7
      are substring/structure checks and do not prove "no upstream source" · the §10 benchmark has
      not run · owner-run items (mobile GPU, context-loss) open · the §12.1 license call open.
      **Every number in the file traces to a command recorded in it.** A "does not prove" section
      shorter than that list is a defect. This is a **create**; the seven pre-existing files in
      that directory stay read-only.
- [ ] **G7 — G-CI, NOT this session's to run and NOT an implementation gate.** GitHub CI on this
      branch *is* a clean clone (`.github/workflows/ci.yml`, verified: `checkout` + `npm ci` + the
      four gates + `node dist/cli.js knowledge check`, no symlink anywhere). Record **what CI does
      on this branch TODAY**, read-only (`gh run list` / `gh run view`, or the checks page). The
      green-after half exists **only after the owner commits and pushes**; **nothing here
      authorizes that.** Report G7 as **pending — blocked on owner**: never passed, never failed.
- [ ] **G8** In the report, state in one sentence **what G-now does not prove**: that the files
      are committed. It proves only that nothing reads through the private symlink. **G-now green
      + G7 unrecorded is an incomplete report; G-now red or absent is a failed task.**

## Group F — Benchmark and release *(owner-gated; NOT declarable by the implementer)*

- [ ] **F1 [R]** **Scope the benchmark to the THREE CAPABILITIES of spec §10 — not one per
      family.** The old wording ("one per family: `live-html`, `overlay`, `object`") named a
      zero-member family and is **unexecutable**; shipping evidence under it is a release blocker
      (reopen verdict §7.4). Select each subject **mechanically from the ledger**:
      | # | Capability | Subject | Selected by |
      |---|---|---|---|
      | a | live-html rendering via html-in-canvas | any `family: "live-html"` effect | ledger `family` |
      | b | **WebGL overlay-FALLBACK rendering** | a `live-html` effect with **`overlayFallback: true`**, run with the **origin trial ABSENT** | ledger `overlayFallback` |
      | c | three.js object rendering | any `family: "object"` effect | ledger `family` |
      **(b) is a MODE run, never a membership claim.** Supplying it as "the overlay-family effect"
      re-introduces the falsified model in prose and is a release blocker. **If no ledger effect
      carries `overlayFallback: true`,** capability (b) has no subject → report it as a **BLOCKED
      benchmark item with the ledger as evidence**; do not silently drop it and do not resurrect
      an `overlay` family to describe it.
- [ ] **F2 [R]** Agent-runnable evidence **per capability** (all three get the full original
      floor, unchanged): desktop + mobile captures (normal motion) · `prefers-reduced-motion`
      capture · **unsupported-browser capture proving the static baseline is COMPLETE** (content,
      controls, focus order, contrast — not paused) · clean console · unmount/teardown leak check.
      **Capability (b) additionally needs its trial-absent run — and that run is ADDITIONAL
      evidence of graceful degradation, never a substitute for the static baseline**, which is the
      WebGL-fully-absent case. Both are required for (b).
- [ ] **F3** Capability (c) — the `family: "object"` effect — additionally: asset load **and
      error** states + the Draco decision evidenced.
- [ ] **F4** **OWNER-RUN** — at least one real low-power / mobile-GPU device, and WebGL
      context-loss recovering to the static fallback. Headless Chromium renders WebGL in
      software; a headless capture **cannot** substantiate either claim.
- [ ] **F5** Coexistence evidence: two effects, or one effect + a scrub section, on one page
      under the tenant contract.
- [ ] **F6** Deterministic gates green on the generated pages: `ui taste-lint` (including
      `animation-no-reduced-motion`) and `ui tenant-lint` where embedded.
- [ ] **F7** **OWNER** — license interpretation of MIT + Commons Clause for the upstream-install
      handoff. **If adverse:** delete the two `ease:install-handoff` blocks, re-run the suite,
      and the adoption ships inspiration-only. Nothing else changes.
- [ ] **F8** Post-merge protocol (`CLAUDE.md`): this merge is **STORY-CHANGING** → dated
      `CHANGELOG.md` entry + README recent-wave row **and** the README marketing body. The
      marketing body is **Opus-edited, Fable-audited** — never Sonnet, never mixed with
      changelog noise.

---

## Sequencing

```
0 ─→ A ─→ B ─┬─→ D ─→ gates ─→ G(now) ─→ F ─→ G7 (owner, post-commit)
             └─→ C ─→ E ─┘
```

A blocks everything. B and C are independent after A. D needs real content from A + B. E rides
with C. **G-now (G1–G6) runs LAST among the implementation groups and gates them all** — it is the
only group that distinguishes a correct repo from a lucky machine. **G7 (G-CI) sits after the
owner's commit, on F's clock, and gates release only.** **F never blocks A–G6** — that separation
is the whole point of the adverse branch.

## Gate (Art II + Art III + Art VI)

- `npm run typecheck && npm run lint && npm run build && npm test` — all four green, run in
  `/Users/jang/Products/ease-design` (the tree the 0.2/0.3 baseline was taken in).
- **The 0.6 isolation proof is part of the gate**, not a courtesy: protected diffs
  byte-identical to baseline, status delta only allowlisted paths. A green suite over a tree
  that also moved someone else's file is a failed task wearing a pass.
- **G1–G6 (G-now) are part of THIS gate, not a follow-up.** Green on this machine plus red or
  absent in the temp tree = a failed task, because "green on this machine" is exactly the
  condition that hid the original bug. **G7 (G-CI) is NOT part of this gate** — no commit exists,
  so it cannot; it is recorded as pending and gates release.
- **Art IX ceilings, measured with `wc -l`, never estimated:** `src/commands/knowledge.ts` ·
  `src/commands/knowledge-effect-matrix.ts` · `src/core/knowledge-effect-catalog-check.ts` ·
  `src/core/knowledge-effect-matrix-emit.ts` each **under 200**. `knowledge.ts` is **212 today** —
  a green suite over a 212-line file is still a breach.
- **Zero occurrences of `references/canvas-ui` in the WORKING TREE under `knowledge/`,
  `templates/`, `src/`, `tests/`** (31 today, spec §8.4), and zero `ease:source` refs into
  `references/` or `taste/` under `knowledge/` — recorded grep output (G5). **Scope it to the
  working tree, not "tracked files"**: every file this task adds is untracked, so `git grep` reads
  none of them.
- **[R2] The four Amendment-2 gate items, each proved rather than assumed:** the **relabel
  fixture fails** with both `effect-catalog-row-drift` and `effect-catalog-draco-missing`, and is
  recorded as having produced **zero** findings pre-change (C1) · **T6e green**, including its
  preservation half — URL, `checked:` date, pinned revision still present (C2) · the ledger
  README's evidence claims read at the granularity checked, **grep clean for `B4` as an excuse**
  (C3) · `docs/research/canvas-ui/implementation-evidence-260725.md` exists with every command,
  its exit code, and the full "does not prove" list (C4) · **`references` appears in no resolver
  path in `src/commands/knowledge.ts`** (C5). All five were green-suite-invisible; a green suite
  is not evidence for any of them.
- **E8d's survey has been run and its output recorded.** Count reconciliation is closed by the
  survey, never by the site lists. An unreconciled hit is a failed gate.
- **Scope proof on the three comment-only files:** `git diff src/adapters/claude.ts
  src/adapters/antigravity.ts src/commands/init.ts` shows changed numerals inside comments and
  `INIT_HELP` and **nothing else**. A behavior change there is a scope breach even with a green
  suite.
- Nothing staged, committed, or pushed. `git diff` is read as evidence, never as a prelude to
  `git add`.
- `tests/zero-runtime-deps.test.ts` stays green; no network call anywhere in `src/`.

## Report BLOCKED — do not improvise

Per Art V and plan § Deviation protocol: an unestablishable `family`; **[R] an `overlayFallback`
that cannot be derived at the pin for some effect** (name the effect — benchmark capability (b)
selects its subject by that field, so a guess mis-scopes the proof); a row with no honest
anti-use; a check that cannot go green without being weakened; a hardcoded count that tempts a
dynamic rewrite; any artifact that would need an upstream API surface; an install-handoff
string that would land outside the two marked blocks; **[R] anything that would need to be
written to, read from, or deleted under `references/**` or `taste/**`** (B10 — including "just
updating the mirror so the two copies agree"); **[R] G-now (G1–G6) unrunnable** — report BLOCKED
with everything else complete and say exactly what is unproven; **never** commit or push to make
it runnable, and **never** substitute a same-machine green. **G7 (G-CI) being unavailable is NOT a
BLOCKED condition** — it is the expected state when no commit exists. **[R2] An evidence claim
that cannot be written honestly without falling below what the benchmark needs** (e.g. the
class-level `overlayFallback` basis turns out not to cover some `live-html` effect) — a finding
about the pin: report BLOCKED with the effect named, never repair it with a per-file claim nobody
made, and **never cite a boundary (B1–B12) as the reason a check was skipped** (if the reason is
scope, write scope). **[R2] A purge that would remove the official URL, the `checked:` date, the
milestone numbers, or the discrepancy record** — that is B11 evidence, not upstream expression:
stop and report rather than trading one blocker for another. Any deviation from a named
path, checkId, or test name in `spec.md` is **reported, not made**.

## Blocked — needs the owner

- **G7 — the G-CI clean clone.** Needs a commit + push, which this session neither makes nor is
  authorized to request as a workaround. Blocks **release** (spec §11.13b), never
  implementation-complete. Record it as *pending*, not as passed and not as failed.
- **License interpretation** (F7) — blocks release only; implementation proceeds.
- **Catalog refresh ownership and cadence** — the 6-month `effect-catalog-stale` warning is a
  placeholder until set. An unowned cadence rots.
- **Whether the one-effect-per-viewport cap may relax for specific expressive personas** —
  this spec assumes NOT relaxed.
