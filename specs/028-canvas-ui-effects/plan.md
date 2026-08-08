# Plan — Spec 028: Canvas UI external-effect adoption

**Spec:** `spec.md` · **Domain:** MODERATE (knowledge + routing + one linter module; no kernel
behavior change) · **Reversibility:** two-way door — knowledge/template/routing only, no user
data migration, no published artifact.

**Grounded in:** `docs/research/canvas-ui/` (7 files, one pinned upstream revision) and this
repo's existing GSAP routing precedent. **Not yet grounded in:** a single executed effect —
see § Risks.

**REOPENED 2026-07-25 — this plan is now a CORRECTION plan, not a greenfield one.** The first
implementation landed and was revoked at stage 4:
`docs/research/canvas-ui/FABLE-VERDICT-reopen-260725.md`. Read it before this file. The work
ahead is (i) move the ledger from the machine-local `references/canvas-ui/` to the tracked
`knowledge/canvas-ui/`, (ii) migrate the schema to a 2-value `family` + required
`overlayFallback`, (iii) reverse the T6a/package rationale honestly, (iv) fix the shared-layer
rule that allowed a tracked gate to read through a private symlink, (v) source the browser note
officially, and (vi) prove all of it **from a clean clone**. Nothing already correct is redone.

**The "move" deletes nothing — say that plainly, because the phrasing keeps inviting the wrong
mental model.** `references/canvas-ui/{README.md,catalog.json}` supply the *content* for the new
ledger (the roster and prose are reused; the location is the bug), but the copies behind the
symlink are **left exactly where they are** — the owner keeps them as a non-canonical legacy
mirror outside this repo. So this plan **creates** `knowledge/canvas-ui/**` and **removes no file
from the repository**, because the old ledger was never in the repository to begin with. There is
no deletion step anywhere in this plan; that absence is the whole shape of the bug.

**AMENDMENT 2 — 2026-07-25, after the stage-4 REVISE on the corrected implementation.** The
reopen corrections were executed and reviewed; the review returned **REVISE**. Five defects
survived a fully green suite, and this plan now carries them. See `spec.md` § *Amendment 2* for
the table; in plan terms:

| # | Requirement | Phase |
|---|---|---|
| C1 | `effect-catalog-row-drift` + Draco keyed on the **ledger** family (the matrix's machine columns are ledger-owned, and today a hand-edit silently disarms B8) | D |
| C2 | Purge upstream API identifiers + verbatim upstream quotations from the three **packaged** canvas files (incl. the ledger README, which no gate reads today); keep URL, `checked:` date, milestones, revision | A + B + C, gated in E |
| C3 | Ledger evidence stated at the granularity actually checked; the **B4 excuse deleted** | A |
| C4 | A **tracked** G-now evidence file, `docs/research/canvas-ui/implementation-evidence-260725.md` | E2a |
| C5 | `ui knowledge check` stops walking `references/` to resolve refs | D |

**Almost nothing here is greenfield, and the file lists must say so.** The revoked first
implementation left its artifacts in the working tree, **untracked but present**:
`knowledge/canvas-effect-direction.md` (157 lines) · `templates/skills/canvas-effect.md` (78) ·
`src/core/knowledge-effect-catalog-check.ts` (198) · `src/core/knowledge-effect-matrix-emit.ts`
(86) · `tests/knowledge-effect-catalog.test.ts` (140) · `tests/knowledge-effect-matrix-emit.test.ts`
(171) · `tests/adapters-canvas-effect-routing.test.ts` (232). **All seven are AMENDED IN PLACE, not
created** — see § Files this spec DOES touch. Only three paths are genuinely new:
`knowledge/canvas-ui/README.md` · `knowledge/canvas-ui/catalog.json` ·
`src/commands/knowledge-effect-matrix.ts`.

---

## The split that organizes this plan

| | Ships now (Sonnet, no external decision) | Ships at release (blocked on owner) |
|---|---|---|
| **What** | ledger · knowledge · skill · routing · linter · tests | license verdict · real-browser benchmark · README marketing |
| **Why separable** | all four artifacts are inert without a T6 decision; none installs or executes anything | Fable put the license at the ship gate, not the planning gate |
| **If the external decision is adverse** | delete two marked blocks (spec §7) — everything else stands | catalog becomes inspiration-only |

Conflating these is the one way this spec stalls: waiting on a lawyer to write a Markdown
matrix. The adverse branch exists precisely so the work proceeds.

---

## Phases

### Phase 0 — Current-tree hygiene *(do first; the one step that can silently ruin everything after it)*

**Where the work happens: `/Users/jang/Products/ease-design`, the current tree, on the current
branch.** No other location exists for this task. The tree already carries this spec and its
research at their real paths; there is nothing to relocate and nothing to reproduce elsewhere.

**Why a copy-in strategy is not on the table.** This environment edits files through
`apply_patch` against the shared workspace, and the owner has not authorized a commit or a push.
A second checkout would be a tree `apply_patch` does not address and a history nobody is allowed
to create — the setup cost is real and the payoff is zero. The tree is also dirty with four
other sessions' in-flight work (§ Protected files), so hygiene here is *isolation inside one
tree*, not escape to another.

**Forbidden for the whole task, not just this phase.** No `git branch`, `git worktree`,
`git checkout`, `git switch`, `git stash`, `git reset`, `git clean`, `git add`, `git commit`,
`git push`, and no copying/moving/renaming of the input trees. Every one of these either
rewrites work this session does not own or manufactures state the owner did not authorize.
Read-only git (`status`, `diff`, `rev-parse`, `log`) is the only git permitted.

**The strategy: record the baseline, edit inside an allowlist, then prove nothing else moved.**

1. **Confirm the location.** `git rev-parse --show-toplevel` returns
   `/Users/jang/Products/ease-design`. If it returns anything else, **STOP** — the rest of this
   plan's paths are wrong for that tree.
2. **Record the baseline, verbatim, before any edit:**
   - `git status --porcelain` — the full list, saved as text;
   - `git diff` scoped to each protected modified path (§ Protected files), saved as text;
   - the four gates green (typecheck · lint · build · test), run **here**. This is the baseline
     that any later "pre-existing failure" claim is measured against. Scar: an executor reported
     "4 pre-existing failures" while the reference tree was clean.
3. **Read the contract in place** — `specs/028-canvas-ui-effects/` and
   `docs/research/canvas-ui/` at their existing paths. One copy of a spec exists; keep it that
   way. Confirm `docs/research/canvas-ui/FABLE-VERDICT.md` reads before proceeding.
4. **Edit only the destination allowlist**, and only via `apply_patch`:
   **Create:** `knowledge/canvas-ui/README.md` · `knowledge/canvas-ui/catalog.json` ·
   `src/commands/knowledge-effect-matrix.ts` (the Art IX split of `knowledge.ts`) ·
   **`docs/research/canvas-ui/implementation-evidence-260725.md`** (Amendment 2 C4 — the tracked
   G-now record; a **create**, and the ONLY permitted write under `docs/research/canvas-ui/`,
   whose seven pre-existing files stay read-only) · **the Art IX split module the
   `effect-catalog-row-drift` addition forces** out of
   `src/core/knowledge-effect-catalog-check.ts` (199 lines today — name it when you split it;
   it joins the allowlist as the split's other half).
   **Modify:** `knowledge/canvas-effect-direction.md` · `knowledge/README.md` ·
   **`knowledge/authoring-standard.md`** (Artifact F, the machine-local-ref rule) ·
   `templates/skills/canvas-effect.md` · `templates/workflows/{generate,refine,redesign}.md` ·
   `src/adapters/templates.ts` · `src/adapters/skill-refs.ts` ·
   `src/core/knowledge-effect-catalog-check.ts` · `src/core/knowledge-effect-matrix-emit.ts` ·
   **`src/core/knowledge-link-check.ts`** (the `provenance-machine-local-ref` check) ·
   `src/core/knowledge-lint.ts` · `src/core/command-signatures.ts` ·
   `src/commands/knowledge.ts` · **`src/adapters/claude.ts`** ·
   **`src/adapters/antigravity.ts`** · **`src/commands/init.ts`** ·
   `tests/knowledge-effect-catalog.test.ts` ·
   `tests/knowledge-effect-matrix-emit.test.ts` ·
   `tests/adapters-canvas-effect-routing.test.ts` · the knowledge-lint suite site covering
   `provenance-*` findings (grep it; do not guess the filename) · the six test-count sites in
   spec §9 (`tests/adapters-antigravity.test.ts` · `tests/adapters-claude.test.ts` ·
   `tests/cmd-init-built-binary.test.ts` · **`tests/cmd-init.test.ts`**) · plus whatever the
   second `knowledge` subcommand and the `knowledge.ts` split break (spec §9 — grep the suite for
   `knowledge` subcommand / help / signature-parity assertions).
   **Removed from the allowlist: `references/canvas-ui/**`.** It is a machine-local symlink into
   a private repo (B10). This task neither writes it nor deletes it; the previously written copies
   stay put as the owner's non-canonical legacy mirror. **Writing there again is a STOP.**
   A path outside this list is a **STOP**, not a judgement call — including a file that merely
   *looks* related.

   **The three newly-added `src/` entries carry a narrower permit than the rest of this list:
   comments and help-string text ONLY** (spec §9 § *Source-file count prose*). `claude.ts`
   lines 6/8/75, `antigravity.ts` lines 6/8/74, `init.ts` lines 78/81 — numerals only.
   A code change in any of those three files is outside the permit and is a **STOP**, exactly
   as an unlisted path is.
5. **Prove isolation after implementation**, before reporting anything: re-run `git status
   --porcelain` and the same scoped diffs from step 2, and compare against the baseline.
   Required result: every protected path's diff is **byte-identical** to its baseline, and the
   status delta contains **only** allowlisted paths. Do not infer this from "I only edited
   allowlisted files" — compare the recorded text. Scar `guard-skip-is-a-silent-noop`: a step
   that quietly did nothing still exits 0; verify the artifact, never the exit code.

**If step 1 or step 5 fails, report BLOCKED.** A protected path that moved is not repairable by
this session — it cannot commit, revert, or check out, and improvising one would destroy another
session's uncommitted work.

**These spec files are untracked and this session does not commit them.** Committing them is the
owner's call and a separate authorization; leaving them untracked changes nothing about their
authority as the contract.

### Phase A — The ledger, at its corrected home *(no dependencies; blocks B and D)*

Build **`knowledge/canvas-ui/README.md` + `catalog.json`** (spec §4) — tracked, packaged, and the
single canonical roster. The existing content behind the symlink is the starting point, not the
destination: reuse the roster and the prose, retarget every path, migrate the schema.

**The schema migration is the substance of this phase:**

- `family` becomes a **two-value** enum (`live-html` | `object`). Every `overlay` mention as a
  *family* is deleted from the ledger README — including the "recorded discrepancy for the
  benchmark owner" paragraph, which was the tell that the model was wrong, not a footnote to keep.
- **`overlayFallback: boolean` is added to every effect**, derived at the pin: does the
  implementation ship a WebGL overlay path that does **not** read the live DOM? `object` rows are
  `false`. Record the derivation rule in the README next to the `family` rule, in the same
  reproducible form. **If it cannot be derived by reading the pin, report BLOCKED** — a guessed
  value now mis-scopes benchmark capability (b), which selects its subject by this field.
- The README also carries the **browser-note discrepancy record** (B11): what the upstream README
  claims about the origin trial vs. what the official Chrome documentation says, with the URL and
  the checked date.

**Count before you target.** The pin yielded 25 (22 `live-html` + 3 `object`) and the research
note agrees; re-confirm rather than copy forward. If a value differs, the ledger is right and the
prose is stale — record the discrepancy. (Repo scar: "a headline number is a hypothesis".)

**Do not write to `references/canvas-ui/` — at all.** The copies there are the owner's legacy
mirror; a second hand-maintained roster is exactly what the reopen forbids.

**Amendment 2 work in this phase — the ledger README is where two of the five defects live.**

- **C3, evidence honesty (B12).** The README as written claims more than was done. `family` says
  `object` was "checked against each effect's own source tree" and then supports it with a
  documentation statement; `overlayFallback`'s "Limitation" paragraph says the per-file read "is
  not performed in this repository **(B4 — no vendoring, no porting)**". **B4 has never forbidden
  reading upstream source** — it forbids vendoring, porting, and redistribution — so that clause
  invents a constraint to explain a scope decision. Rewrite both: `overlayFallback` is **one
  architectural fact at the pin applied to the 22 `live-html` rows as a class**, written as
  class-level and keeping its falsification condition; `family` states the act that actually
  happened. **Delete the B4 clause.** Nothing here weakens the values — a class claim with its
  basis named is stronger than a per-file claim nobody made.
- **C2, the packaged-content purge.** `knowledge/canvas-ui/README.md` is a **published** file that
  **no gate reads** (T6c covers only the two authored files) — which is exactly how it came to
  carry the html-in-canvas draw-API names (`:44`, `:104-105`), the WebGPU variant, the
  `chrome://flags/` switch (`:103`), and three blocks of **quoted** upstream README/docs prose
  (`:64-66`, `:68-72`, `:108-112`). All of it comes out under B2. **What stays, and must not be
  collateral damage: the official Chrome URL, the `checked:` date, the milestone numbers, the
  pinned revision, and the discrepancy record** — paraphrased into our own voice. Deleting the
  citation instead of the quotation fails B11 while appearing to satisfy B2.

**Done when** the ledger parses at `knowledge/canvas-ui/`, every entry has all **four** fields,
the three `object` entries are exactly the three `three`-dependent effects with
`overlayFallback: false`, both derivation rules are written down, **each field's evidence is
stated at the granularity it was obtained with no boundary cited as an excuse, and T6e is green
over the README** (no API identifier, no long quotation, citation intact).

### Phase B — The knowledge file *(depends on A)*

`knowledge/canvas-effect-direction.md` per spec §5, plus the `knowledge/README.md` index row.

**This file EXISTS (157 lines, untracked) — amend it, do not rewrite it from scratch.**

**Reopen-specific edits, on top of what already exists:** retarget all six `references/canvas-ui`
mentions (`:6` `:43` `:74` `:80` `:83` `:129`; `:74` is the `ease:source` marker) to
`knowledge/canvas-ui`; rewrite the family paragraph (`:75-85`) to **2 families + overlay-as-mode**,
keeping the matrix at **six columns** (`overlayFallback` is ledger-only — spec §8.1, decided);
rewrite the origin-trial note (`:47`, currently the bare relayed "Chrome 148–150") with the
**official** source URL and a `checked:` date, plus the upstream delta; fix the
`knowledge/README.md:18` description cell, which also names the old path. **Full 31-site
inventory: spec §8.4 — and the grep at execution time outranks it.**

Seed the matrix from `docs/research/canvas-ui/integration-brief.md` — its `Narrative job` and
`Required fallback / caution` columns are already DESIGN:OS's own words, so no upstream prose
is copied. `Anti-use` is **new per row** and is the field doing the real work: it is what
stops novelty-first selection, and a row whose anti-use is a generic platitude has not been
written (authoring-standard: empty WHY-clauses).

**Done when** `ui knowledge check` exits 0 — which, after Phase D, means the revision and
every slug match the ledger mechanically, **and no marker refs a machine-local path**
(`provenance-machine-local-ref`, Phase D).

### Phase C — The skill and its routing *(depends on B)*

`templates/skills/canvas-effect.md` + the three registration sites + the three workflow
sentences (spec §6).

**This file EXISTS (78 lines, untracked) — amend it.** It carries a **reopen retarget the
verdict's known-site list did not name**: `templates/skills/canvas-effect.md:54` resolves
`<slug>` from `references/canvas-ui/catalog.json` inside the install-handoff block →
`knowledge/canvas-ui/catalog.json`. `templates/` is a published tree, so a skill pointing at a
machine-local symlink is the same bug as the knowledge file's, one tree over (spec §6, §8.4).

The skill is a **copy of gsap-motion's shape, not of its content**. Two structural
divergences the gsap skill does not have, both from Fable:

- **baseline-first is a hard ordering constraint** — the complete static baseline is built and
  verified *before* an effect is selected, not after;
- **web-only** must appear in the description's when-NOT clause, or the skill will be pulled
  into `design` / `to-figma` by a host model reading only the description.

**Done when** the adapter generators emit it for both runtimes and the routing tests pass.

### Phase D — The emitter AND the checks *(depends on A + B; the Art II obligation)*

Two modules, one obligation (spec §8):

- **Emitter** — `src/core/knowledge-effect-matrix-emit.ts` + the new `ui knowledge
  effect-matrix` subcommand (§8.1). Emits the matrix's machine columns from the ledger with the
  three prose cells **empty**.
- **Linter** — `src/core/knowledge-effect-catalog-check.ts` + the wiring in `knowledge-lint.ts`,
  `commands/knowledge.ts`, `command-signatures.ts` (§8.2). Fails on exactly those empty cells,
  plus drift, plus the Draco clause.
- **Shared-layer rule (reopen, §8.3)** — the machine-local-ref rule in
  `knowledge/authoring-standard.md` **and** `provenance-machine-local-ref` in
  `src/core/knowledge-link-check.ts`. Same Art II obligation, one layer down: it fires on the
  ref's **prefix**, never on resolution, so it stays red on the very machine where the symlink
  would otherwise hide the bug.

**Reopen-specific work in this phase:** retarget every path literal and message string
(`knowledge-effect-catalog-check.ts` ×7, `knowledge-effect-matrix-emit.ts:76`,
`command-signatures.ts:879,882`, `knowledge-lint.ts:41`, `commands/knowledge.ts` ×6 — spec §8.4
carries the full 31-site inventory including the two sites outside this phase); migrate the
enum + `overlayFallback` validation in emitter **and** linter together — **the emitter keeps SIX
matrix columns** (spec §8.1: `overlayFallback` is a required *ledger* field, never a matrix
column); **split `src/commands/knowledge.ts`** (212 lines — already over Art IX's ceiling) by
moving the `effect-matrix` IO into `src/commands/knowledge-effect-matrix.ts`, with no observable
behavior change. **`knowledge.ts` keeps the `check` IO and the dispatch; the new module owns the
`effect-matrix` IO** — there is no intermediate state in which `knowledge.ts` holds both and
stays under 200 lines.

This is the phase that makes the whole adoption a *standard* rather than prose. The repo's own
scar is explicit: **a standard needs an emitter AND a linter** — our own compiler violated the
paired convention the knowledge already taught.

**An earlier draft of this plan said "the matrix is the emitter". It is not, and that sentence
was the failure the scar warns about.** A human typing a Markdown table is not code that emits
a convention; it is the prose Art II exists to distrust. Two hand-maintained copies of one
roster (ledger + matrix) diverge — the only question is when. The emitter makes the copy
*generated*; the linter makes the divergence *loud*. Phase D ships both or ships neither.

The pair is proved coherent by one test, not by inspection: M6 in spec §9 — emit, lint, and
assert exactly N `effect-catalog-field-empty` findings and zero of any other checkId.

Design note — **fix at the shared layer** (Art IV): the check module is pure and FS-free, the
command owns IO, matching `knowledge-link-check.ts`. Do not read files from the check module.

**Amendment 2 work in this phase — the two defects that live in code.**

- **C1, the machine-column drift contract.** The linter reads `family` **out of the matrix** and
  gates the Draco check on it (`knowledge-effect-catalog-check.ts:63-83,153-177`). Relabel an
  `object` row `live-html`, delete its Draco clause, and the tree is **green** — the one check
  standing between generated output and B8 is switched off by editing the cell the check reads.
  Add **`effect-catalog-row-drift`** (compares the matrix's `Effect` and `family` against the
  ledger for every known-slug row, deterministic order: row order, then `name` before `family`),
  and **key the Draco gate on the ledger entry's family**. `row.family` may be read for one
  purpose only: reporting drift. The module is **199 lines** — this crosses Art IX's ceiling, so
  **split it**; merging into the emitter to dodge a second file is the move §11.10 forbids.
- **C5, the resolver that contradicts the rule.** `src/commands/knowledge.ts:124-129` still walks
  `references/**` so an `ease:source` ref can target it — the thing `provenance-machine-local-ref`
  now makes an error. It is a tracked gate reading through the private symlink (B10), guarded by
  an `existsSync` that turns CI's absence into silence. **Grep first** (zero machine-local refs
  under `knowledge/`), then delete the walk and its comment; `repoFiles` becomes `knowledge/**`.
  **Decided, so nothing drifts downstream:** a machine-local ref emits
  `provenance-machine-local-ref` **only** — `provenance-bad-grammar` is suppressed for that marker,
  because "dead ref" would point the reader at making it resolve, which is the wrong fix.

**Done when** each of the **eight** checks fires on its own fixture *and* the real tree is clean.
(Nine, with `provenance-machine-local-ref`.) The relabel fixture — `object` row written
`live-html` with its Draco clause deleted — **fails**, and is confirmed to produce zero findings
against the pre-amendment linter, so the test is known to be load-bearing rather than decorative.

### Phase E — Count reconciliation *(depends on C)*

Two mechanical passes and one survey. Mechanical does not mean unsupervised — this phase is
where a tenth skill either becomes visible everywhere or leaves lies behind in three trees.

**E-i — the six hardcoded test-count sites** (spec §9). Numbers only.

**E-ii — the source-file count prose** (spec §9 § *Source-file count prose*): `src/adapters/
claude.ts:6,8,75` · `src/adapters/antigravity.ts:6,8,74` · `src/commands/init.ts:78,81`.
9 craft → 10, 12 skills → 13, `Total: 28 artifacts` → 29. **Comments and the `INIT_HELP`
template literal only** — the permit in Phase 0.4 does not extend to a line of code in those
three files. Nothing here is load-bearing: the adapters emit from `SKILL_NAMES` at runtime,
which is precisely why the prose drifted unnoticed to begin with.

**E-iii — the standing survey (the closing step, not a courtesy).** Run the greps in spec §9
§ *Standing survey rule* over the working tree and reconcile every hit or state why it stays;
record the output in the report. **The site lists in `spec.md` are a snapshot of a survey, not
the authority.** Two surveys have already come back incomplete on this exact task — the first
missed `tests/cmd-init.test.ts`, the second surfaced the two `Total: 28 artifacts` header
lines. Closing E without running E-iii is closing on a list already known to have been wrong
twice.

`tests/cmd-init.test.ts:178` · `:186` is the sixth, and it was **not** in the original survey —
it asserts the same `data.adapters[0].paths.length` expression as the already-listed
`tests/cmd-init-built-binary.test.ts:88` (in-process rather than built binary), so a tenth skill
breaks it identically. Read `src/commands/init.ts:402` if that chain is not obvious.

**Do not weaken a hardcoded count into a dynamic assertion.** Those totals are a deliberate
tripwire that a skill was added without review; converting them to `SKILL_NAMES.length`
disarms the tripwire to save one edit. The repo has already been bitten by a test that
enshrined a bug (`ds-round-trip.test.ts` asserted `DS_TAMPERED` as correct behavior).

### Phase E2 — The clean-clone proof, in TWO halves *(depends on A–E; the reopen's decisive evidence)*

**This phase is why the reopen exists.** Every other gate runs where the private symlink
resolves — the condition under which the first implementation went green while the repository did
not contain its own ledger. Spec §9 splits the evidence; this phase runs **only the half this
session can run**, and records the other half's status honestly.

**E2a — G-now, the symlink-independence run. Runnable NOW, no commit, no push.**

1. `git clone` this repo into a temp dir (`$(mktemp -d)`) with **no `design-os-hq` sibling**;
   verify from *that* directory that `references`/`taste` do not resolve. A local `git clone` is
   read-only against the source tree — it is not a commit, and the temp tree is disposable.
2. **The clone carries only committed content, and this session commits nothing** — so it will
   not contain the corrected artifacts. **Copy the working-tree files in.** That is the only
   method available here. **Do not commit to make the gate runnable, and do not treat "the owner
   could authorize a commit" as a path this session may take** — Deviation 8 covers what to do if
   copy-in is impossible.
3. **`ls knowledge/canvas-ui/` BEFORE reading any exit code** — it must list `README.md` and
   `catalog.json`. Scar `guard-skip-is-a-silent-noop`: a run that silently lacked the new files
   exits 0 too.
4. `npm ci` → `typecheck · lint · build · test` → `node dist/cli.js knowledge check`. Record the
   **full** output.
5. Record the grep proofs (0 hits: `references/canvas-ui` over `knowledge templates src tests`,
   which is 31 today per spec §8.4; and `ease:source ref="references/` / `taste/` under
   `knowledge/`).
6. Record the **trackability proxy** — `git check-ignore -v` exits non-zero for every new path and
   `git status --porcelain` lists each as `??`. This is the only thing standing in for "the file
   will actually reach the repository" before a commit exists.
7. **[Amendment 2, C4] Write it down in the tree, not just in the report.** Create
   `docs/research/canvas-ui/implementation-evidence-260725.md` (spec §9.7) holding: the temp-tree
   path and its no-`design-os-hq` verification · **every command verbatim with its exit code** in
   run order · the `ls knowledge/canvas-ui/` output taken **before** any exit code was read · the
   grep proofs with real output · the trackability proxy per path · the Phase 0.5 isolation
   result · G-CI's read-only status today, marked *pending — blocked on owner* · and a mandatory
   **"What this does not prove"** section listing all six items of spec §9.7. G-now ran last time
   and the record died with the session; a claim whose conditions are not in the repository is
   the same shape of failure the reopen caught. **Every number in the file traces to a command
   recorded in it.** This is a create — the seven pre-existing files in that directory stay
   read-only.

**E2b — G-CI, the true clean clone. NOT this session's, and not an implementation gate.**
GitHub CI on this branch *is* a clean clone (`.github/workflows/ci.yml` — verified: `checkout` +
`npm ci` + the four gates + `node dist/cli.js knowledge check`, no symlink anywhere). Record
**what CI does on this branch TODAY**, read-only (`gh run list` / `gh run view`, or the branch's
checks page). The green-after half exists **only after the owner commits and pushes**; this plan
does not authorize either, and the report marks E2b **pending — blocked on owner**, never passed
and never failed.

**Done when** E2a is green **and recorded**, and E2b's today-status is recorded with its pending
half named. **E2a green + E2b unrecorded is an incomplete report, not a failed one; E2a red or
absent is a failed task.** State in one sentence what E2a does not prove: that the files are
committed. It proves only that nothing reads through the private symlink.

### Phase F — Benchmark + release *(owner-gated; NOT Sonnet's to declare done)*

Spec §10 and §11 items 11–14. **The benchmark now covers three CAPABILITIES, not three families**
— live-html rendering · WebGL **overlay-fallback** rendering (an `overlayFallback: true` effect
run with the origin trial absent) · a `three.js` object effect. Overlay evidence supplied as a
family-membership claim is a release blocker. Split by who can actually run it:

| Item | Runner | Note |
|---|---|---|
| static/reduced-motion/unsupported captures | agent, headless | `page-shot` hand |
| overlay-fallback capture (trial absent, WebGL present) | agent | **additional** to the static baseline, never a substitute for it |
| `taste-lint` + `tenant-lint` on generated pages | agent | deterministic |
| mobile-GPU / low-power device | **owner** | headless renders WebGL in software — a headless capture cannot substantiate this claim |
| WebGL context-loss recovery | **owner** | same reason |
| coexistence (two effects / effect + scrub) | either | tenant contract binds |
| license interpretation | **owner** | §12.1 — now also covers the packaged display names |

---

## Sequencing

```
0 ─→ A ─→ B ─┬─→ D ─→ (gates) ─→ E2 ─→ F
             └─→ C ─→ E ─┘
```

A blocks everything (families and slugs are the ledger's). B and C are independent of each
other after A. D needs both A and B to have real content to check. E is trivial and can ride
with C. **E2a (G-now) runs LAST among the implementation phases and gates them all** — it is the
only phase that can distinguish a correct repo from a lucky machine. **E2b (G-CI) sits after the
owner's commit and belongs to F's clock, not to the implementation gate.** **F never blocks
A–E2a.**

## Gate (Art II + Art III + Art VI.4)

- `npm run typecheck && npm run lint && npm run build && npm test` — all four green, run in
  `/Users/jang/Products/ease-design` (the same tree the baseline in Phase 0.2 was taken in).
- **Phase E2a (G-now) is part of THIS gate, not a follow-up.** Green here plus red or absent
  there = a failed task, because "green here" is precisely the condition that hid the original
  bug. Its output is recorded in the report. **Phase E2b (G-CI) is NOT part of this gate** — it
  cannot exist before a commit, and this session makes none; it is recorded as pending and it
  gates *release*, not implementation-complete.
- **Art III (real data before "done"):** the checks in Phase D must run once against the
  **real** `knowledge/` tree (which now holds the ledger), not only fixtures. Every one of this
  repo's eight dogfood findings came from real data and zero from fixtures.
- **Art IX line ceilings, measured with `wc -l`, not estimated:** `src/commands/knowledge.ts`,
  `src/commands/knowledge-effect-matrix.ts`, `src/core/knowledge-effect-catalog-check.ts`,
  `src/core/knowledge-effect-matrix-emit.ts` each **under 200**. `knowledge.ts` is 212 today and a
  green suite over a 212-line file is still an Art IX breach.
- **[Amendment 2] The four new gate items, each failing-by-default rather than assumed:**
  **T6e green** over the three packaged canvas files — no upstream/browser API identifier, no
  quoted upstream span over 12 words, **and** the official URL, `checked:` date, and pinned
  revision still present (C2) · **the relabel fixture fails** with both
  `effect-catalog-row-drift` and `effect-catalog-draco-missing`, and is confirmed to have produced
  **zero** findings against the pre-amendment linter (C1) · **`docs/research/canvas-ui/
  implementation-evidence-260725.md` exists** with every command, its exit code, and the full
  "What this does not prove" section (C4) · **`references/` appears in no resolver path in
  `src/commands/knowledge.ts`** (C5). A green suite with any of these absent is the same
  green-wearing-a-pass the reopen caught.
- **Zero occurrences of `references/canvas-ui` in the WORKING TREE under `knowledge/`,
  `templates/`, `src/`, `tests/`** (31 today — spec §8.4), **and zero `ease:source` refs into
  `references/` or `taste/` under `knowledge/`** — recorded grep output, and mechanised by T7 plus
  `provenance-machine-local-ref`. **Scope it to the working tree, not "tracked files":** this
  session's artifacts are all untracked, so a `git grep` reads none of the files that matter.
- **Isolation proof (Phase 0.5) is part of the gate, not a courtesy:** post-run `git status
  --porcelain` + scoped diffs compared against the recorded baseline; protected paths
  byte-identical; the status delta only allowlisted paths. A green suite over a tree that also
  moved someone else's file is a failed task wearing a pass.
- **Count reconciliation is closed by the Phase E-iii survey, not by the site lists.** Its grep
  output is part of the gate evidence; an unreconciled hit is a failed gate, not a follow-up.
- **The three comment-only `src/` files are diff-audited for scope**: `git diff
  src/adapters/claude.ts src/adapters/antigravity.ts src/commands/init.ts` must show changed
  numerals inside comments and `INIT_HELP` and nothing else. A behavior change there is a
  scope breach even if every test is green.
- Nothing is staged, committed, or pushed. `git diff` is read as evidence, never as a prelude
  to `git add`.

## Protected — files this spec must NOT touch

The working tree is dirty with other sessions' work. **None of these is in scope.** These are
also the exact paths whose `git diff` is recorded in Phase 0.2 and re-compared in Phase 0.5 —
the protection is a measurement, not an intention.

Modified, unrelated: `feedbacks/README.md` · `figma-agent/plugin/manifest.json` ·
`figma-agent/plugin/src/ui/ui-relay.ts` · `figma-agent/plugin/ui.html` ·
`specs/015-world-class-learning-loop/research/higgsfield-reference-ledger.md`.

Untracked, unrelated: `.agents/` · `.codex/` · `feedbacks/260724-hermes-agent-onboarding.md` ·
`specs/021-scrollworld-gflow-video-track/**`.

Read-only inputs (this spec's evidence — **never edited by the implementation**):
`docs/research/canvas-ui/**` — including `FABLE-VERDICT.md` (the original verdict is preserved
unedited; the reopen is a **separate dated addendum**, `FABLE-VERDICT-reopen-260725.md`, because
the record of being wrong is part of the record).
**One carve-out, and it is a CREATE, not an edit** *(Amendment 2, C4)*:
`docs/research/canvas-ui/implementation-evidence-260725.md` is added by this change. **No
pre-existing file in that directory is modified** — the read-only protection on all seven of them
is unchanged, and the same rule that keeps the verdicts unedited is why the new evidence goes in
its own dated file rather than into one of theirs.

**Machine-local, and deliberately untouched:** `references/**` and `taste/**` — gitignored
symlinks into the private `design-os-hq` corpus. This task does not write, delete, or read them,
and the previously written `references/canvas-ui/**` stays as the owner's non-canonical legacy
mirror.

## Files this spec DOES touch

**New — five paths under Amendment 2** (nothing else in this plan is created from nothing):
`knowledge/canvas-ui/README.md` · `knowledge/canvas-ui/catalog.json` ·
`src/commands/knowledge-effect-matrix.ts` (the Art IX split of `knowledge.ts`) ·
**`docs/research/canvas-ui/implementation-evidence-260725.md`** (C4) · **the Art IX split module
carved out of `src/core/knowledge-effect-catalog-check.ts`** when `effect-catalog-row-drift`
pushes it past 200 lines (C1 — 199 today; name it at the split).

**Amended in place — present in the working tree, untracked, from the revoked implementation.**
An earlier draft of this section listed these as *New* while Phase 0.4 listed them as *Modify*;
Phase 0.4 was right. Writing one of them from scratch would silently discard correct work the
reopen did not touch:
`knowledge/canvas-effect-direction.md` · `templates/skills/canvas-effect.md` ·
`src/core/knowledge-effect-catalog-check.ts` (linter) ·
`src/core/knowledge-effect-matrix-emit.ts` (emitter) ·
`tests/knowledge-effect-catalog.test.ts` · `tests/knowledge-effect-matrix-emit.test.ts` ·
`tests/adapters-canvas-effect-routing.test.ts`.

Each `src/` module stays under 200 lines **on its own** (Art IX) — do not merge emitter and
linter to dodge a second file. Measured today: `knowledge-effect-catalog-check.ts` 198 (adding
`overlayFallback` validation will likely cross 200 → split, do not merge),
`knowledge-effect-matrix-emit.ts` 86, `src/commands/knowledge.ts` 212 (**already breaching**).

**Not touched, and asserted so:** `package.json` — `files` stays
`["dist", "knowledge", "schemas", "templates"]` (spec §9 T6a). **What that assertion means is
corrected:** it proves no new tree ships silently. It does **not** prove the ledger is unshipped —
the ledger now lives under `knowledge/` and **ships on purpose**, so the `ease:source` ref
resolves inside the published tarball. Any comment or rationale still saying "`references/` is not
published, therefore the ledger cannot ship" is an Art VIII overclaim and a release blocker.

**Modified:** `knowledge/README.md` (index row) · `src/adapters/templates.ts` ·
`src/adapters/skill-refs.ts` · `src/core/knowledge-lint.ts` · `src/commands/knowledge.ts` ·
`knowledge/authoring-standard.md` (Artifact F) · `src/core/knowledge-link-check.ts`
(`provenance-machine-local-ref`) ·
`src/core/command-signatures.ts` · `templates/workflows/{generate,refine,redesign}.md` ·
the six test-count sites in spec §9 (`tests/adapters-antigravity.test.ts` ·
`tests/adapters-claude.test.ts` · `tests/cmd-init-built-binary.test.ts` ·
`tests/cmd-init.test.ts`).

**Modified — comment/help text only (no code):** `src/adapters/claude.ts` (`:6` `12 skill
files`→13 · `(9 craft`→10 · `:8` `Total: 28`→29 · `:75` `(9 craft skills)`→10) ·
`src/adapters/antigravity.ts` (`:6` · `:8` · `:74`, identical edits) ·
`src/commands/init.ts` (`:78` · `:81`, `(12 skills: 9 craft + 3 journey)`→`(13 skills: 10
craft + 3 journey)`, inside `INIT_HELP`). These emit nothing — `SKILL_NAMES` does — so the
edit is documentation catching up with the roster. The only observable delta is two substrings
of `ui init --help`.

**Release-only (Phase F, after the owner decision):** `README.md` · `CHANGELOG.md`.

## Deviation protocol (Art V — Sonnet stops, never improvises)

Sonnet reports **BLOCKED** and stops, rather than choosing, when any of these occurs:

1. **The pinned revision's roster or family split cannot be established** — a guessed `family`
   mis-scopes the benchmark and is worse than no ledger.
1b. **`overlayFallback` cannot be derived for some effect** at the pinned revision — same rule,
   same reason: benchmark capability (b) selects its subject by that field, so a guess mis-scopes
   the proof. Report BLOCKED with the effect named; do not infer it from a name or a screenshot.
2. **A ledger slug has no honest `Anti-use`** — writing a platitude to fill the cell defeats
   the field's only purpose.
3. **`ui knowledge check` cannot be made green without weakening a check** — the check is the
   deliverable; softening it to pass is inverting the task.
4. **A hardcoded-count test tempts a dynamic rewrite** — see Phase E.
5. **Any artifact would require an upstream API surface to be useful** — that is B2/B4, the
   port-by-proxy line, and it is a stop, not a judgement call.
6. **The install-handoff string would need to appear outside the two marked blocks** — that
   breaks the adverse branch's single-diff property.
7. **Anything would need to be written to, read from, or deleted under `references/**` or
   `taste/**`** — that is B10, the exact bug the reopen caught, and it is a stop, not a judgement
   call. This includes "just updating the mirror so the two copies agree".
8. **Phase E2a (G-now) cannot be run** — no way to stand up a temp tree with the corrected files
   in it. Report BLOCKED **with everything else complete**, stating precisely what is unproven.
   Do not substitute a same-machine green run, and **do not commit or push to make the gate
   runnable** — that authorization does not exist and is not yours to assume. E2b (G-CI) being
   unavailable is **not** a BLOCKED condition: it is expected, because no commit exists.

9. **[Amendment 2, C3] An evidence claim cannot be written honestly without weakening it below
   what the benchmark needs** — e.g. the class-level `overlayFallback` basis turns out not to
   cover some `live-html` effect. That is a **finding about the pin**, not a wording problem:
   report BLOCKED with the effect named, and do not paper it over with a per-file claim nobody
   made. **Never cite a boundary (B1–B12) as the reason a check was not performed** — if the real
   reason is scope, write scope.
10. **[Amendment 2, C2] The purge would remove the official URL, the `checked:` date, the
   milestone numbers, or the recorded discrepancy.** That is B11 evidence, not upstream
   expression; if a reading of B2 seems to require deleting it, the reading is wrong — stop and
   report rather than trading one blocker for another.

Any deviation from a named path, checkId, or test name in `spec.md` is reported, not made.

## Risks

- **No effect has been executed.** Every lifecycle claim (reduced-motion, visibility pause,
  teardown) is a *static source reading* at one revision — upstream's own code, read, not run.
  `fable-thinking-review.md` says so explicitly. The benchmark is where this becomes knowledge;
  until then the matrix's fallback column is a hypothesis with a good provenance.
- **Catalog drift.** The upstream roster moves; the ledger pins one revision. Mitigated
  mechanically by `effect-catalog-revision-drift` + `effect-catalog-stale`, but the *refresh
  owner* is an open decision (spec §12.2). An unowned cadence rots.
- **Origin-trial expiry.** html-in-canvas is a time-boxed Chrome origin trial. If it lapses, the
  `live-html` family degrades to its static baseline — which B6 already requires to be complete,
  so this is a designed-for outcome, not a break. State that in the knowledge file so a future
  reader does not treat expiry as a defect. **No milestone range is stated here on purpose**
  (B11): "Chrome 148–150" is a RELAYED upstream claim, official Chrome material surfaced during
  the reopen already reports an extension beyond it, and repeating the number in a planning
  document is how a stale fact re-enters the tree. The knowledge file states what the **official**
  registry says, with a URL and a `checked:` date, and records the delta against the upstream
  README. The degradation argument stands regardless of the numbers.
- **A second hand-maintained roster.** The legacy mirror behind `references/` still exists on this
  machine and still parses. The mitigation is social, not mechanical: it is declared
  non-canonical, nothing tracked reads it, and T7 + `provenance-machine-local-ref` make a
  re-wiring fail loudly. If the owner later wants a single copy, deleting the mirror is a
  one-line, zero-consumer change.
- **Headless WebGL is software-rendered.** A green headless capture is not performance
  evidence. This is why the mobile-GPU item is owner-run; do not let a headless screenshot
  stand in for it.
- **Sandbox / Chrome hazard.** Recorded scar `gui-chrome-cant-launch-from-agent-sandbox`:
  GUI Chrome cannot launch from the agent sandbox, and `playwright install --force chrome`
  has already destroyed a user Chrome install on this machine. **Never run it.**

## Still open (blocks release, not implementation)

- License interpretation (spec §12.1) — **now explicitly including the packaged display names**:
  the tarball carries the 25 upstream names under `knowledge/canvas-ui/`. Nominative use, no
  upstream expression, one question, not two.
- Catalog refresh ownership and cadence (spec §12.2).
- Whether B7's one-effect cap may relax for specific expressive personas (spec §12.3).
- Whether the private hq mirror is eventually deleted (spec §12.4). Owner has decided **not now**;
  nothing depends on it either way.

## What the reopen did NOT change

Say this in the report so the reviewer does not re-litigate settled ground: **B1** offline,
deterministic `ui` · **B2** no implementation detail in `knowledge/` · **B3** effects are never
catalog components · **B4** no vendoring or ports · **B5** web-only · **B6** static baseline first,
nothing load-bearing · **B7** one effect per viewport · **B8** Draco · the **adverse-branch** cut
line and its single-diff property · both **human audits** · the **T3 leakage** gate · the count
reconciliation work (Phase E) · every §12 owner decision. The reopen corrected a location, a
schema, a benchmark scoping, a rationale, and a shared-layer rule. It did not reopen the
adoption.
