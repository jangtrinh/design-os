# Spec 028 — Canvas UI external-effect adoption

**Pipeline stage:** Opus 4.8 spec (stage 2) — **REOPENED 2026-07-25**. Fable 5 reopened the
architecture gate after stage-4 review; **implementation-complete is REVOKED** until the
corrections in `docs/research/canvas-ui/FABLE-VERDICT-reopen-260725.md` land. Next: Codex 5.6 sol
reviews this amendment, then Sonnet 5 executes the corrections, then Opus + Codex review, then
Fable 5 final-audits **against the reopen addendum**.

**Fable's direction is binding and is transcribed, not interpreted.** Precedence, highest first:
`.specify/memory/constitution.md` → `FABLE-VERDICT-reopen-260725.md` → `FABLE-VERDICT.md` → this
spec. The reopen addendum supersedes the original verdict **only where they conflict**;
everything else in the original stands.

**Read before doing anything:** `FABLE-VERDICT-reopen-260725.md` **first** · `FABLE-VERDICT.md` ·
`docs/research/canvas-ui/README.md` · `docs/research/canvas-ui/integration-brief.md` ·
`knowledge/motion-craft.md` (T6 + Floors + Tenant contract) · `knowledge/authoring-standard.md`.

**What the reopen changed — the four-line version.** (1) The ledger moves from
`references/canvas-ui/` (a **gitignored machine-local symlink** into a private repo) to
`knowledge/canvas-ui/`, **tracked and packaged**. (2) `family` becomes a two-value enum
(`live-html` | `object`) plus a required derived `overlayFallback: boolean` — the `overlay`
family had zero members at the pin. (3) The benchmark covers three **capabilities**, not three
families. (4) Browser-platform facts are controlled by **official Chrome origin-trial
documentation with a checked date**, never by the pinned upstream README.

**AMENDMENT 2 — stage 2, 2026-07-25, after the stage-4 REVISE.** The corrections above were
executed; the review of that execution returned **REVISE**, not pass. Five defects survived every
green gate, and each is now a binding requirement of this spec. They are **additive** — nothing in
Amendment 1 is withdrawn.

| # | Defect found at stage 4 | Requirement | Where |
|---|---|---|---|
| C1 | The linter reads `family` **from the matrix** and gates Draco on it, and never compares the matrix's machine columns against the ledger — so relabelling an `object` row `live-html` and deleting its Draco clause is **silently green** | `effect-catalog-row-drift` (error) + Draco gating keyed on the **ledger** family | §8.2, §9 |
| C2 | Packaged files carry upstream/browser **API identifiers** (`knowledge/canvas-effect-direction.md:160`; `knowledge/canvas-ui/README.md:43-44,102-107`) and **verbatim upstream prose** (quoted README/docs sentences at `README.md:64-72,108-112`, `canvas-effect-direction.md:50`) — B2 forbids both, and T6c never looked at the ledger README | purge to display names + paraphrase; gate it with T6e | §3 B2, §9 T6e |
| C3 | The ledger's evidence claims overreach: `family` says "checked against each effect's own source tree", `overlayFallback` says the per-file read "is not performed **(B4 — no vendoring, no porting)**" — B4 forbids redistributing source, it has never forbidden **reading** it | say what was actually checked; class-level evidence is allowed **as class-level**; no boundary may be cited as an excuse for an unperformed check | §3 B12, §4 |
| C4 | G-now was run but its commands, outputs, and limits live only in a session report | a **tracked** evidence file: `docs/research/canvas-ui/implementation-evidence-260725.md` | §9, §11.8b |
| C5 | `ui knowledge check` still walks `references/` to resolve `ease:source` targets (`src/commands/knowledge.ts:124-129`) — a tracked gate reading through the machine-local symlink, now that such refs are **errors** by prefix | delete the walk; `repoFiles` is `knowledge/**` only | §8.3 |

**Where this executes:** `/Users/jang/Products/ease-design`, the current tree, on the current
branch, editing via `apply_patch` inside the allowlist in `plan.md` § Phase 0.4. No branch, no
worktree, no stash/reset/checkout, no staging, **no commit, no push**. Phase 0 in `plan.md` is
binding on every phase below.

**The one carve-out, and its exact limits:** the G-now symlink-independence run (§9) creates a
**throwaway temp tree** under `$(mktemp -d)` — a read-only `git clone` of this repo plus a copy of
the working-tree files. It writes nothing back, touches no branch, and stages/commits/pushes
nothing. That is the only place a second tree exists, it is disposable, and it is **not** an
exception to the commit/push prohibition.

---

## 1. The problem

DESIGN:OS has a T6 tier (`knowledge/motion-craft.md`) that names *Lottie* and *WebGL* as
technologies but gives the host model **no named vocabulary** of art-direction effects and
no per-effect anti-use or fallback guidance. Canvas UI publishes exactly that vocabulary.

The failure mode this spec must not create: 25 volatile third-party effects becoming owned
semantic components, or their implementation source entering the DESIGN:OS distribution, or
novelty-first effect selection contaminating ordinary generation.

## 2. What is being built

Five artifacts and their mechanical checks, plus one shared-layer rule fix. Nothing else.

| # | Artifact | Kind |
|---|---|---|
| A | Versioned reference ledger — **`knowledge/canvas-ui/`** (tracked, packaged) | provenance snapshot (names + slugs + families + overlayFallback only) |
| B | `knowledge/canvas-effect-direction.md` — the T6 external-effect direction + matrix | knowledge |
| C | `templates/skills/canvas-effect.md` — one selective, **web-only** T6 skill | template + routing |
| D | Deterministic catalog checks inside `ui knowledge check` | **linter** (Art II) |
| E | `ui knowledge effect-matrix` — deterministic matrix emitter | **emitter** (Art II) |
| F | The machine-local-ref rule: `knowledge/authoring-standard.md` + the `provenance-machine-local-ref` check | standard + **linter** (Art II / Art IV) |
| G | `docs/research/canvas-ui/implementation-evidence-260725.md` — the tracked G-now evidence record *(Amendment 2, C4)* | evidence, tracked |

**G is tracked on purpose, and it is the one file this task adds outside the four gate trees.**
An evidence run whose commands and outputs exist only in a chat transcript is not evidence — the
next reader cannot re-run it, and the reopen happened because a green run was believed without its
conditions being written down. §9 fixes its contents, including a mandatory *what this does not
prove* section.

**F is the reopen's shared-layer fix, and it is not optional.** The bug the reopen caught was not
"the ledger sat in the wrong folder" — it was that a tracked gate could read through a
machine-local symlink and nothing said no. Art IV: fix at the shared layer, not at the site where
it surfaced. Art II: a rule that exists only as prose in `authoring-standard.md` will drift, so
the rule ships with the check that fails without it (§8.3).

**D and E are one obligation, not two features.** Art II requires that a convention ship the
code that *emits* it and the check that *fails without it*. The convention introduced here is
the recipe-metadata row (`Effect · slug · family · Narrative job · Anti-use · Required
fallback` — six columns; `overlayFallback` is ledger-only, decided in §8.1). E emits that row's
machine columns from the ledger with the prose cells
**deliberately empty**; D fails on exactly those empty cells. Neither half is optional and a
handwritten matrix does not satisfy E — see §8.

Everything else named in the research — installation, effect code, benchmarks — happens
**outside** the DESIGN:OS distribution, in the user's application or in evidence files.

## 3. Binding boundaries (verbatim from the verdict)

These are refusals, not preferences. Each names the mechanism it protects.

- **B1 — `ui` stays deterministic and offline.** Zero network, zero registry fetch, zero
  effect code. *Why:* Art I.2 — same input → same bytes, forever; a registry fetch makes the
  kernel's output depend on an upstream server's mood.
- **B2 — `knowledge/` stores names, slugs, narrative job, anti-use, fallback, and provenance
  ONLY.** NEVER implementation detail, API tables, parameter lists, or anything sufficient
  for the host model to reconstruct an effect. *Why:* a regenerated effect is a port-by-proxy
  and breaches the Commons Clause boundary as surely as vendoring. **The reopen moves the ledger
  INTO `knowledge/`; B2 is what makes that safe and B2 is unchanged by the move.** The ledger's
  content is still names, slugs, families, `overlayFallback`, and provenance — a roster, not an
  API. An upstream API identifier is out of bounds in `knowledge/canvas-ui/` exactly as it was in
  `references/canvas-ui/`, and T6b enforces it by exact key allowlist.
  **B2 extension (Amendment 2, C2) — the packaged trees carry ZERO upstream API identifiers and
  ZERO verbatim upstream prose beyond display names.** This binds every file under `knowledge/**`
  and `templates/**`, including **`knowledge/canvas-ui/README.md`**, which T6c never looked at.
  Concretely, and each of these is a real occurrence in the current tree:
  - **API identifiers are out**, whoever published them — upstream or Chrome. The html-in-canvas
    draw-API names (`knowledge/canvas-ui/README.md:44`, `:104-105`), the WebGPU variant (`:105`),
    the `chrome://flags/` switch (`:103`), and the bare API name in
    `knowledge/canvas-effect-direction.md:160` all come out. B2 is about the *class* of fact (a
    call surface a host model could build against), not about who owns the copyright in it.
    Describe the capability in DESIGN:OS's own words — "redraws the live DOM into a canvas
    surface" — and the sentence loses nothing a designer needed.
  - **Verbatim upstream prose is out** beyond the 25 display names: the quoted upstream README and
    docs sentences at `knowledge/canvas-ui/README.md:64-66`, `:68-72`, `:108-112` and the quoted
    milestone phrase at `knowledge/canvas-effect-direction.md:50`. Quoting is what makes it
    upstream *expression*; paraphrase is what makes it ours.
  - **Explicitly PRESERVED, and not to be deleted while purging:** the paraphrased provenance
    record (what upstream documents, and what the official page states, in our own words), the
    official source **URL**, the `checked:` date, the milestone numbers themselves, the pinned
    revision, and the recorded discrepancy. A URL is a citation, a date is a fact, and a milestone
    number is a fact — none of the three is expression. **Purging the citation instead of the
    quotation would destroy B11's evidence trail and is a failure of this correction, not a
    conservative reading of it.**
  Gated by **T6e** (§9). T6e is a substring and quotation-shape check: it cannot detect unquoted
  copying, which is what the human diff audit is for.
- **B3 — effects are art-direction recipes, NEVER entries in the semantic component catalog**
  and NEVER reachable before the motion ladder + persona cap justify T6. *Why:* an effect
  wraps content; a component *is* content. Mixing them contaminates component selection with
  art direction.
- **B4 — no vendoring, no ports, no bundles.** Source ownership stays upstream; copied code
  lives only in the user's application. *Why:* MIT + Commons Clause permits use inside a
  product and prohibits redistributing the components themselves.
- **B5 — web-only for v1.** No Figma static-approximation surface in this spec. *Why:* a
  Figma approximation of a WebGL effect is a different artifact with different failure modes;
  it is a separate future spec if demand appears.
- **B6 — html-in-canvas is experimental progressive enhancement only.** Design the complete
  static baseline FIRST. NO effect may ever be load-bearing for content, controls, or
  navigation. *Why:* it is a Chrome **origin trial** — time-boxed by construction, and the
  implementation may change — so this is the existing T3 `@supports` doctrine applied at T6. **No
  version range appears in this boundary on purpose:** the specific milestones are a
  browser-platform fact governed by B10, not by this spec and not by the upstream README.
- **B7 — max ONE active Canvas UI effect per viewport moment.** *Why:* GPU budget and
  attention budget are both single-occupancy; two simultaneous WebGL surfaces is the
  measured failure mode the coexistence evidence exists to catch.
- **B8 — the three `three`-based object effects must NOT ship the default Google-hosted Draco
  decoder** in generated output. Self-host, or an explicit per-destination permit. *Why:* a
  silent third-party CDN dependency in a user's shipped page is a supply-chain and privacy
  fact the user never agreed to.
- **B9 — every new required recipe-metadata field ships with its deterministic EMITTER and its
  deterministic CHECK in the same change** (Art II — "same commit" in the article; this task
  commits nothing, so the obligation binds at the change, and neither half may be deferred to a
  follow-up). The emitter is `ui knowledge
  effect-matrix` (§8.1) — a named, tested `ui` subcommand, not a human writing a table. The
  check is the `effect-catalog-*` finding set (§8.2). The provenance revision/slug check is
  **mechanical, not prose**. *Why the emitter is not optional:* a handwritten matrix and a
  ledger are two hand-maintained copies of the same roster; the divergence is only a matter of
  time, and Art II exists to make the copy generated rather than remembered.
- **B10 — a tracked gate, test, or knowledge ref may NEVER read through a machine-local path.**
  `references/` and `taste/` are gitignored symlinks into the private `design-os-hq` corpus
  (`.gitignore:66-69`). Anything the public repo's gates read must live in the repo. *Why:* a
  clean clone and CI do not have those trees, so a gate that reads through them passes on one
  machine and is absent everywhere else — green-on-this-machine wearing a pass. This is the repo's
  own `guard-skip-is-a-silent-noop` class, and it is the bug the reopen caught. Mechanised by
  `provenance-machine-local-ref` (§8.3) and swept by T7 (§9).
- **B11 — browser-platform facts are controlled by CURRENT OFFICIAL browser documentation, with
  a checked date.** The pinned upstream revision governs upstream facts only: the roster, and
  per-effect behavior at that revision. A pin cannot govern a third party's origin-trial status.
  Any milestone range, trial window, or availability claim in `knowledge/` carries the official
  source URL and a `checked:` date, and any disagreement with the upstream README is **recorded as
  a discrepancy**, not silently reconciled. *Why:* a relayed claim that has expired reads exactly
  like a current one.
- **B12 — an evidence claim states what was ACTUALLY checked, at the granularity it was checked,
  and never cites a boundary as the reason a check was skipped.** *(Amendment 2, C3.)* Two rules,
  both mechanical enough to audit by reading:
  1. **Granularity is declared.** Evidence read once about a library's architecture and applied to
     a class of effects is **class-level evidence**; it is legitimate, and it is written as such —
     "one architectural statement at the pin, applied to all 22 `live-html` rows as a class." It
     may **not** be written as, or allowed to read as, 22 independent per-effect findings. A
     sentence like "checked against each effect's own source tree" is a per-file claim and is only
     writable if per-file reads happened, listing what was read.
  2. **A boundary is never an excuse.** B4 prohibits vendoring, porting, and redistributing
     upstream source. It has never prohibited **reading** upstream source — the research for this
     spec is entirely reading. Writing "per-file confirmation is not performed in this repository
     (B4 — no vendoring, no porting)" converts a scope decision into a fabricated prohibition, and
     it is the more damaging of the two defects: an overclaim misstates one fact, an invented
     constraint teaches the next reader a rule that does not exist. State the real reason ("not
     performed at this pin") and stop.
  *Why:* the reopen exists because a green result was reported without its conditions. An
  evidence claim that borrows certainty it did not earn is the same failure, one layer up, and no
  linter can catch it — only the wording can.

## 4. Artifact A — the reference ledger

**Path: `knowledge/canvas-ui/` — tracked in this repo, and packaged.** *(Reopen correction 1.
The original spec put it at `references/canvas-ui/`; `references` is a gitignored symlink into
the private `design-os-hq` corpus — `.gitignore:66-69` — so that ledger was never in the
repository at all, while a tracked knowledge file, a `ui` subcommand, and three test files
required it. See B10.)*

**In-tree precedent, not a new pattern:** `knowledge/benchmarks/` is machine JSON + a README
under `knowledge/`, and `knowledge/personas/personas.json` is machine data the kernel reads.
A roster the linter reads belongs exactly there.

| File | Content |
|---|---|
| `knowledge/canvas-ui/README.md` | Human ledger: upstream repo URL, pinned revision, capture month, license summary, the `family` + `overlayFallback` derivation rules, the browser-note discrepancy record (B11), the refresh procedure, and the explicit statement that no upstream source is stored here. |
| `knowledge/canvas-ui/catalog.json` | Machine ledger — the file the linter and the emitter read. |

**The ledger is packaged, by design — say it plainly and stop claiming otherwise.** `knowledge`
is one of `package.json.files`'s four entries, so the ledger ships in the tarball alongside the
knowledge file that cites it, and the `ease:source` ref **resolves inside the published package**.
That is the point: a published knowledge file whose provenance ref dangles is a broken artifact.
`package.json.files` still stays exactly `["dist","knowledge","schemas","templates"]` — no fifth
tree (T6a, whose rationale is corrected in §9). The tarball therefore carries the 25 upstream
**display names** — nominative use, no upstream expression — which is a stated consideration for
the owner's §12.1 license call, **not** a new gate.

`catalog.json` shape (frozen by this spec as amended; the linter and T6b are written against it):

```json
{
  "upstream": "https://github.com/DavidHDev/canvas-ui",
  "revision": "728550d4523e1b8bef834b64b3e936c215cad630",
  "captured": "202607",
  "license": "MIT + Commons Clause",
  "effects": [
    { "slug": "asciify", "name": "Asciify", "family": "live-html", "overlayFallback": true }
  ]
}
```

- **`family` ∈ `"live-html" | "object"` — two values, both with members.** *(Reopen correction 3.
  The original three-value enum reserved `overlay`, and at the pinned revision **no effect
  qualifies** — the previous ledger README recorded that as "a discrepancy for the benchmark
  owner", which was the tell. An enum value with provably zero members, on which the release
  benchmark depends, is a modeling error. It is removed, not documented.)*
- **`overlayFallback: boolean` — REQUIRED on every effect, derived, never guessed.** It answers
  one question about the pinned implementation: **does this effect ship a WebGL overlay path that
  does NOT read the live DOM?** `object` rows are `false` by construction (a `three` scene is not
  a fallback for a live-DOM redraw). Overlay is therefore a **runtime MODE**, not a membership
  class — which is what the zero-member family was trying and failing to express.
- **Both fields are DERIVED at the pinned revision, mechanically.** `object` = the effect's
  implementation imports `three` — a FACT for exactly three effects (Dithered Object, Glass
  Object, Particle Object). `live-html` = it calls the origin-trial live-DOM draw API.
  `overlayFallback` = it ships the no-live-DOM WebGL path. **A guessed value silently mis-scopes
  the benchmark**, which now selects its capability-(b) subject by `overlayFallback: true`. If a
  value cannot be derived by reading the pin, report **BLOCKED** — do not infer it from a name.
  **"Derived" says the value came from reading the pin, not that it was read per file** — the
  evidence bullet below governs how each field's basis is stated (Amendment 2, B12).
- **Record the derivation rule for each field in the ledger README**, in the same
  "how a future refresher reproduces this" form the previous README used. The rule is what makes
  the next refresh mechanical instead of archaeological.
- **Record the derivation EVIDENCE separately from the derivation RULE, at the granularity it was
  obtained** *(Amendment 2, C3 — B12)*. The rule says how a refresher reproduces the value; the
  evidence says what this capture actually read. They are different sentences and the current
  ledger README merges them, which is how the overclaim got in.
  - **`family` — state what was actually checked.** The current README says `object` was "checked
    against each effect's own source tree" and then supports it with a documentation statement
    about the three 3D effects. Those are not the same act. Write the one that happened: if the
    three `object` rows rest on upstream's own architectural statement plus the three names, say
    that; if per-effect import inspection was performed, name the effects and what was read. **A
    class-level `family` derivation is acceptable here** — three named effects against a documented
    3D/non-3D split is a strong class fact — **but it is written as class-level.**
  - **`overlayFallback` — class-level, and legitimate as such.** The evidentiary basis is ONE
    architectural statement about the pinned library (its non-3D components degrade to WebGL
    overlay rendering when the origin trial is unavailable), applied to all 22 `live-html` rows as
    a class. Write it that way, in one paragraph, with the source and the pin. **Delete the
    "Limitation" paragraph's B4 clause outright**: per-effect reads were not performed at this
    pin, and no boundary forbade them. Keep the falsification condition — one upstream-documented
    `live-html` effect that opts out flips that row to `false` and is recorded as a discrepancy —
    because that is what makes a class claim checkable rather than merely broad.
  - **Neither field's evidence may be stated as a per-file inspection that did not occur**, and
    neither may be softened into "derived mechanically" prose that hides which of the two it was.
    A reader deciding whether to trust `overlayFallback: true` for benchmark capability (b) needs
    to know it rests on one class fact, not on 22 confirmations.
- **No API, no parameters, no code, no descriptions copied from upstream** beyond the display
  name. Narrative job / anti-use / fallback are DESIGN:OS's own words and live in artifact B.
- The **roster is the ledger's**, not this spec's. Research captured 25 names
  (`docs/research/canvas-ui/integration-brief.md`), and the pinned revision confirmed 25 (22
  `live-html` + 3 `object`). If a later refresh yields a different count, **the ledger is right
  and the research note is stale** — record the discrepancy in the ledger README, do not adjust
  the ledger to match prose.

**The private hq copy is NOT deleted, and is NOT canonical.** The owner keeps
`../design-os-hq/corpus/references/canvas-ui/{README.md,catalog.json}` where the previous
implementation wrote it. It is hereby declared a **non-canonical legacy mirror**: outside this
repo, outside every public gate, read by nothing tracked, and not maintained. `knowledge/canvas-ui/`
is the single canonical roster. **Never re-wire the mirror into a gate, a test, or a knowledge
ref** — that is precisely the failure this correction exists to undo, and B10 forbids it.

## 5. Artifact B — the knowledge file

**Path:** `knowledge/canvas-effect-direction.md` — **it EXISTS (157 lines, untracked); amend it.**
Shape per `knowledge/authoring-standard.md`:
`Purpose → Mental Model → When to Use / When NOT → Content → Failure Modes` (Failure Modes
mandatory). Sibling and naming precedent: `knowledge/gsap-motion-direction.md`.

Required content, in order:

1. **Purpose + the gate.** This file is reachable ONLY after `knowledge/motion-craft.md`'s
   ladder selects T6 *and* the persona motion cap allows T6 (`High / expressive` only). State
   this at the top and again at the matrix (authoring-standard rule (d) — repeat the core
   constraint at its point of use).
2. **The T6 floor for an external effect** — every use requires ALL of:
   narrative intent · a complete static/reduced-motion/unsupported fallback preserving
   content, controls, focus order, and contrast (**not merely paused**) · visual verification ·
   teardown · a provenance note carrying the upstream revision, **re-checked at use time**.
3. **The one-effect-per-viewport cap (B7)** and the **Tenant Law binding** when an effect is
   embedded as a section among others (`knowledge/motion-craft.md` § Tenant contract —
   `ui tenant-lint` must pass; off-screen pause must actually *disarm*; an upstream visibility
   observer counts only when evidenced at page level).
4. **The Draco clause (B8)** stated once in doctrine and once per `object` row.
5. **The effect matrix** — one row per ledger slug:
   `| Effect | slug | family | Narrative job | Anti-use | Required fallback |`
   Seed content: `docs/research/canvas-ui/integration-brief.md` § Catalog adoption matrix
   (its `Narrative job` and `Required fallback / caution` columns are already DESIGN:OS's own
   words). **Re-verify every row against the pinned revision.** `Anti-use` is new and must be
   written per row — it is the field that stops novelty-first selection.
   **The family paragraph above the matrix is rewritten to the 2-family + mode model**
   (currently `knowledge/canvas-effect-direction.md:75-85`): `family` is `live-html` or
   `object`; **overlay is a runtime MODE, carried per effect by `overlayFallback`, not a family**.
   Delete every sentence describing a reserved/empty `overlay` family and every pointer to the
   old ledger path. **The matrix stays SIX columns** — `overlayFallback` is a ledger field, not a
   matrix column (§8.1, decided) — so this paragraph is where a reader learns the mode exists and
   that the ledger is where to read it per effect.
5b. **The browser note (B11) carries its official source.** The origin-trial paragraph states
   the milestone/trial facts **from current official Chrome origin-trial documentation**, with
   the source URL and a `checked: YYYY-MM-DD` date inline, and records any delta against the
   upstream README as a discrepancy. The bare relayed claim "Chrome 148–150" does **not** stand
   as written — it is an upstream restatement of a third party's trial status and the reopen
   found official material that already contradicts it (leads, not evidence, in
   `FABLE-VERDICT-reopen-260725.md` §5; fetch and date the official page yourself).
   **No upstream or browser API identifier enters this file** — B2 binds regardless of who
   published the name.
6. **The install handoff** — see §7. This section is the adverse-branch cut line and MUST be
   a single contiguous block delimited by the markers in §7.
7. **Provenance marker** under the matrix heading, exactly:
   `<!-- ease:source ref="knowledge/canvas-ui/catalog.json" captured="YYYYMM" url="https://canvasui.dev/components" -->`
   (`ui knowledge check` `provenance-bad-grammar` fails a marker whose `ref` points nowhere;
   the new `provenance-machine-local-ref` — §8.3 — fails a `ref` into `references/**` or
   `taste/**` **even on a machine where the symlink makes it resolve**.) Every other mention of
   the ledger in this file uses the `knowledge/canvas-ui/` path; **zero** occurrences of
   `references/canvas-ui` may survive anywhere in the tracked tree (§9 T7).
8. **Failure Modes** — observable, per the authoring standard. At minimum: an effect chosen
   for novelty with no narrative sentence; a "fallback" that is a paused animation rather than
   a complete static state; two effects in one viewport; an object effect shipping the default
   Draco CDN; a stale revision note.

**Index row required.** `knowledge/README.md` § The files gets one row for this file, or
`ui knowledge check` fails `index-missing-row`. This is a modification to an existing file
and is in scope for implementation.

## 6. Artifact C — the selective skill

**Path:** `templates/skills/canvas-effect.md` — **it EXISTS (78 lines, untracked, from the revoked
implementation); amend it, do not re-create it.** Mirror `templates/skills/gsap-motion.md` shape
exactly: YAML frontmatter `description:`, then the four sections
`## Read` → `## Direct` → `## Implement` → `## Verify`.

**Frontmatter description is a hard gate**, not decoration —
`tests/adapters-template-descriptions.test.ts:38-47` asserts every `SKILL_NAMES` entry has a
description that is **> 40 characters** and **matches `/Use /`**. It must also say when NOT
to use it (the gsap-motion precedent) and must name the web-only boundary.

**Registration (three sites, same change):**

| Site | Change |
|---|---|
| `src/adapters/templates.ts` § `SKILL_NAMES` | append `"canvas-effect"` |
| `src/adapters/skill-refs.ts` § `VERB_SKILL_REFS` | add to `generate`, `refine`, `redesign` — **and nothing else** |
| `templates/workflows/{generate,refine,redesign}.md` | one sentence routing to the skill *after* the ladder selects T6, mirroring generate.md's existing T5/`design-os-gsap-motion` sentence at §5 |

**Routing rationale.** `generate` / `refine` / `redesign` are the three verbs already routed
to `gsap-motion` (`tests/adapters-skill-refs.test.ts:15-19`) — the T6-capable web-generation
paths. Every other verb is excluded, each for a stated reason: `figma` / `to-figma` / `design`
(canvas surface — B5 web-only) · `slides` (not a web page) · `extract` / `learn` / `token-model`
paths (read-only analysis) · `iterate` (prompt-mode edit, no tier decision) · `why` /
`evidence` / `init` / `audit` (no generation) · `from-ref` / `from-url` (reference intake,
tier decided downstream).

**Reopen retarget — this file is a `references/canvas-ui` site the verdict's known-site list did
not name.** `templates/skills/canvas-effect.md:54` resolves `<slug>` from
`references/canvas-ui/catalog.json` inside the install-handoff block; it becomes
`knowledge/canvas-ui/catalog.json`. It is in `templates/`, which T7 (§9) sweeps and which
`package.json.files` publishes — a published skill pointing at a machine-local symlink is the
same bug as the knowledge file's, one tree over. **The grep is the authority, not this line
number.**

**Skill body must contain, and must NOT contain:**

- MUST: read `knowledge/motion-craft.md` first and **stop there when T1–T5 suffices**;
  read `knowledge/canvas-effect-direction.md` only for T6; **build and verify the complete
  static baseline BEFORE selecting an effect** (B6); one effect per viewport (B7); the
  install handoff (§7); tenant contract when embedded; Draco decision for `object` effects;
  the teardown + evidence plan.
- MUST NOT: any Canvas UI API surface, parameter table, prop name, or code snippet (B2/B4).
  The skill points the host at the upstream docs *at use time*; it never caches them.

## 7. The install handoff — and its adverse branch

**Primary = an emitted direct upstream CLI command.** Runtime-neutral, inspectable, works in
every host CLI. **shadcn MCP is opportunistic convenience** when the host exposes it — never
a requirement, never in `ui`. (Verdict, Direction ¶2. This resolves the research's open
question "MCP or CLI primary" — CLI primary.)

The command is **emitted for the host/user to run against the destination app**; `ui` never
runs it and never fetches (B1).

**Adverse branch (Fable: plan it so the door stays two-way).** If the owner's license
interpretation lands adverse, the install handoff is **removed** and the adoption becomes an
inspiration-only catalog — names, narrative jobs, anti-use, fallbacks, no install path.

To make that a single mechanical diff, the handoff lives in **exactly two places**, each
delimited:

```
<!-- ease:install-handoff:start -->
…the emitted command + the MCP-if-available note…
<!-- ease:install-handoff:end -->
```

- `knowledge/canvas-effect-direction.md` § Install handoff
- `templates/skills/canvas-effect.md` § Implement

A test (§9, T5) asserts the marker pair appears in exactly those two files and the upstream
install command string appears nowhere else in the repo. Executing the adverse branch is then:
delete two marked blocks, run the suite. **No other artifact may depend on the handoff.**

## 8. Artifacts D + E — the emitter and the checks

### 8.1 Artifact E — the emitter (`ui knowledge effect-matrix`)

**Precedent:** `ui tenant-scaffold` (`src/commands/tenant-scaffold.ts`) — this repo already has
the "a `ui` subcommand emits a canonical artifact verbatim" shape. `ui knowledge` currently has
exactly one subcommand (`check`, `src/commands/knowledge.ts:133-143`); this adds the second.

- **Module (EXISTS — 86 lines, untracked; amend, do not re-create):**
  `src/core/knowledge-effect-matrix-emit.ts` — pure, FS-free, **under 200 lines** (Art IX). Its
  `FAMILIES` set (`:20`) and `BAD_LEDGER` message (`:70`) still carry the falsified three-value
  enum and migrate with the schema. Exact signature:
  ```
  export function emitEffectMatrix(catalogJson: string, opts: { captured: string }):
    { ok: true; markdown: string } | { ok: false; code: string; message: string }
  ```
- **What it emits**, in this order and nothing else:
  1. the `ease:source` provenance marker of §5.7, with `captured` from the ledger;
  2. the matrix header row + separator, columns exactly
     `| Effect | slug | family | Narrative job | Anti-use | Required fallback |`;
  3. one row per ledger effect, **in ledger order** — `Effect`, `slug`, `family` filled from
     `catalog.json`; `Narrative job`, `Anti-use`, `Required fallback` emitted **EMPTY**.

  **`overlayFallback` stays LEDGER-ONLY — the matrix keeps SIX columns. Decided here, once, so
  no downstream file has to guess.** *(Stage-2 decision. An earlier draft left this as "the
  emitter's call", which is a fork across five files — emitter, linter row parser, T6b key
  expectations, the M-fixtures, and the knowledge matrix — and an unresolved fork in a spec is
  the drift Art II exists to stop, not a delegation.)* The rationale: the matrix is the host
  model's **selection** surface (narrative job / anti-use / fallback), while `overlayFallback` is
  **benchmark-subject-selection machinery** (§10 capability (b) picks its subject by it) and a
  ledger fact. Its home is the ledger, and §5's family paragraph explains overlay-as-mode in
  prose without a column. The field itself remains REQUIRED on every ledger entry (§4), validated
  by the linter (§8.2) and by T6b (§9) — it is *not* optional, it is simply not a matrix column.
  **If a future change adds it as a seventh column, all five sites move in the SAME change**
  (B9 / Art II); that is a spec amendment, not an implementer's choice.
- **The empty cells are the design, not a stub.** The emitter's output is structurally correct
  and deliberately fails `effect-catalog-field-empty` until a human writes the three prose
  cells. That failure *is* the emitter/linter pair closing: the machine owns the roster, the
  human owns the judgement, and neither can ship without the other. An emitter that invented
  prose would be inventing the one field (`Anti-use`) whose entire job is honest refusal.
- **Determinism (Art I.2):** same `catalogJson` → same bytes. No clock, no fs, no network.
  `captured` is passed in from the parsed ledger, never read from `Date`.
- **Command wiring:** `ui knowledge effect-matrix [--dir <repo-root>] [--json]` reads
  **`knowledge/canvas-ui/catalog.json`**, calls the core, and **prints to stdout**. It does
  **NOT** write into `knowledge/canvas-effect-direction.md`: an emitter that rewrites a file
  containing hand-written prose would clobber the very cells it cannot author. Error codes:
  `BAD_ARG` · `UNKNOWN_FLAG` · `NO_LEDGER` (no `knowledge/canvas-ui/catalog.json`) ·
  `BAD_LEDGER` (unparseable / shape violation) · `READ_ERROR`. Every path literal and every
  message string naming the old path is retargeted, not just the `existsSync` call.
- **`src/commands/knowledge.ts` is SPLIT in this change (Art IX).** Measured in the current tree
  it is **212 lines** — already over the 200-line ceiling §11.10 imposes on this feature's files,
  because the first implementation grew it. Move the `effect-matrix` IO (`runEffectMatrix` + its
  help/error text) into its own module — **`src/commands/knowledge-effect-matrix.ts`** — and have
  `knowledge.ts` dispatch to it. Both files end **under 200 lines**, verified by `wc -l`, not by
  eye. Do not "fix" the ceiling by deleting comments; the split is the fix.
- **Signature:** register `knowledge.effect-matrix` in `src/core/command-signatures.ts`
  alongside `knowledge.check`, and add it to `KNOWLEDGE_HELP`'s `Subcommands:` block.
  **Verify signature↔help↔dispatch parity before declaring done** — the three lists are
  maintained by hand in this repo; a subcommand present in one and absent from another is the
  exact drift Art II exists to stop.
- **Refresh procedure (this is what the emitter is *for*):** bump the pinned revision in the
  ledger → re-run `ui knowledge effect-matrix` → diff against the matrix in the knowledge file
  → new slugs arrive as empty rows that the linter refuses to let ship. Record this procedure
  in `knowledge/canvas-ui/README.md`.

### 8.2 Artifact D — the deterministic checks

**Where:** extend `ui knowledge check` — it is already the knowledge-core linter with the
FS-free core + IO-in-command split this needs.

- **Module (EXISTS — 198 lines, untracked; amend, do not re-create):**
  `src/core/knowledge-effect-catalog-check.ts` — pure, FS-free, **under 200 lines** (Art IX),
  exporting `effectCatalogChecks(input): KnowledgeFinding[]`. Modelled on
  `src/core/knowledge-link-check.ts`. Its `FAMILIES` set (`:15`) still carries the three-value
  enum. **At 198 lines it has 2 to spare; the `overlayFallback` validation will almost certainly
  cross 200 → split (Art IX, §11.10), never merge into the emitter to dodge a second file.**
- **Wire:** `src/core/knowledge-lint.ts` — add the call inside `lintKnowledge()` and extend
  `KnowledgeLintInput` with the ledger JSON (`canvasCatalogJson: string | null`).
  **The field's doc comment names the new path too** (`src/core/knowledge-lint.ts:41` currently
  says `references/canvas-ui/catalog.json` — the grep is the authority, and it is a tracked site
  the reopen's known-site list did not name).
- **IO:** `src/commands/knowledge.ts` — read **`knowledge/canvas-ui/catalog.json`** when present,
  pass it through. A **missing ledger with no `knowledge/canvas-effect-direction.md` present
  is silent** (nothing adopted yet); a knowledge file present with no ledger is an error.
  Note the ledger now lives **inside the tree the command already walks**, so the read is one
  `join(knowledgeDir, "canvas-ui", "catalog.json")` — the separate `references/` existence probe
  for this feature disappears. (The unrelated `repoFiles` walk of `references/**` for
  `ease:source` targets is a **different** concern and is not in scope here — but no *tracked*
  ref may target it any more; see §8.3.)
- **Signature:** `src/core/command-signatures.ts` § `knowledge.check` — no new flags; extend
  the `summary` string to name catalog drift.

**Checks (findings shape `{checkId, severity, message}`, Art II):**

| checkId | Sev | Fails when |
|---|---|---|
| `effect-catalog-missing-ledger` | error | `knowledge/canvas-effect-direction.md` exists but `knowledge/canvas-ui/catalog.json` is missing or unparseable |
| `effect-catalog-revision-drift` | error | the revision string in the knowledge file ≠ `catalog.json.revision` |
| `effect-catalog-slug-unknown` | error | a matrix row's slug is not in the ledger |
| `effect-catalog-slug-missing` | error | a ledger slug has no matrix row |
| `effect-catalog-row-drift` | error | a matrix row's `Effect` display name or `family` cell disagrees with the ledger entry for that row's slug *(Amendment 2, C1)* |
| `effect-catalog-field-empty` | error | a matrix row has an empty `Narrative job`, `Anti-use`, or `Required fallback` cell |
| `effect-catalog-draco-missing` | error | a row whose **LEDGER** family is `object` has no Draco clause in its fallback cell |
| `effect-catalog-stale` | warning | `catalog.json.captured` is more than 6 months before `--as-of` (reuse the `benchmark-stale` cadence in `src/core/knowledge-lint.ts:56`) |

**The machine-column drift contract — the emitter's columns are LEDGER-OWNED, and the linter is
what says so** *(Amendment 2, C1; this is the defect the stage-4 review found)*. Three of the
matrix's six columns (`Effect`, `slug`, `family`) are emitted from the ledger by
`ui knowledge effect-matrix`; the other three are human prose. Until this amendment the linter
compared only `slug` (via `slug-unknown` / `slug-missing`) and **read `family` out of the matrix
row**, then gated Draco on that value. Consequence, verified by reading
`src/core/knowledge-effect-catalog-check.ts:63-83,153-177`: **hand-editing an `object` row's
family cell to `live-html` and deleting its Draco clause produces ZERO findings.** The one check
standing between a generated page and B8 is switched off by editing the cell the check reads.
A machine column a human can silently overwrite is not a generated column.

- **`effect-catalog-row-drift` (error) compares the ledger to the matrix for every row whose slug
  IS in the ledger**, on exactly two fields: the `Effect` display name and the `family` cell.
  `slug` itself remains covered by `slug-unknown` (row → ledger) and `slug-missing`
  (ledger → row); together the three checks close all three machine columns, and that closure is
  the contract — **name it in the module header comment**, because the next reader's question is
  why drift does not also check slugs.
- **Deterministic output (Art I.2), specified, not left to the implementer:** findings are emitted
  in **matrix row order**, and within a row in the fixed field order **`name` then `family`** — so
  a row that drifts on both yields two findings, always in that order. Message shape, fixed:
  `matrix row '<slug>' <field> '<matrix value>' does not match knowledge/canvas-ui/catalog.json's '<ledger value>'`.
  Same inputs → same bytes, same order.
- **Draco gating keys on the LEDGER family, never on the row cell.** `effect-catalog-draco-missing`
  looks the row's slug up in the ledger and tests `ledgerEntry.family === "object"`. A row whose
  slug is not in the ledger is already reported by `slug-unknown` and makes **no** Draco claim —
  do not guess from the cell. **`row.family` may be read for exactly one purpose: reporting drift.
  Any other read of it is the bug this check exists to close.**
- **Art IX:** the check module measures **199 lines** in the current tree. This addition crosses
  200 — **split it** (e.g. the matrix parsing and row-comparison helpers into their own module),
  do not merge into the emitter and do not delete comments to buy room. §11.10 binds; `wc -l`
  decides.
- Add the row to `KNOWLEDGE_HELP`'s `Checks:` block, to `knowledge-lint.ts`'s header comment list,
  and to the `knowledge.check` signature `summary` — the same three-site parity §8.1 warns about.

**Every user-visible message in `src/core/knowledge-effect-catalog-check.ts` names the new path.**
Seven occurrences of `references/canvas-ui` live in that module today (header comment `:5`, the
`catalogJson` doc `:109`, and the messages at `:128`, `:147`, `:148`, `:157`, `:193`) — see the
full 31-site inventory in §8.4. A finding that tells the reader to look at a path that does not
exist is a worse bug than no finding.

**Family-enum validation moves with the schema.** The ledger's `family` check accepts exactly
`live-html` and `object`; `overlayFallback` is required and must be a boolean. A ledger missing
`overlayFallback`, or carrying `family: "overlay"`, fails — in the linter *and* in the emitter's
`BAD_LEDGER` path (M5). The check module is 198 lines today; if the added validation crosses 200,
**split it** (Art IX, §11.10) — do not merge it into the emitter to dodge a second file.

`effect-catalog-field-empty` and `effect-catalog-draco-missing` are the mechanical form of
B9's *check* half; `ui knowledge effect-matrix` (§8.1) is its *emitter* half. The pair is
proved coherent by the round-trip test in §9 — emit into an empty knowledge file, lint, and get
exactly N `effect-catalog-field-empty` findings and **zero** findings of any other checkId. A
new required metadata field therefore cannot be added without touching both halves.

### 8.3 Artifact F — the machine-local-ref rule and its check *(reopen correction 7)*

The rule, added to `knowledge/authoring-standard.md` § provenance markers (currently `:90`, the
`ref` paragraph):

> `ref` must point to a file **tracked in this repository**. A ref into `references/**` or
> `taste/**` is invalid even when it resolves locally: those are machine-local symlinks into the
> private corpus (`.gitignore:66-69`), so a clean clone or CI cannot resolve them. Distil the
> fact into `knowledge/` and ref the tracked copy.

**Prose alone is not the fix (Art II).** Ship the check in the same change:

| checkId | Sev | Fails when |
|---|---|---|
| `provenance-machine-local-ref` | error | an `ease:source` `ref` starts with `references/` or `taste/` |

- **Where:** `src/core/knowledge-link-check.ts` § `provenanceChecks()` — the function that
  already parses every marker. Art IV: fix at the shared layer, not at the site where it
  surfaced. No new module, no new IO, no `KnowledgeLintInput` change.
- **It fires on the PREFIX, never on resolution.** A resolution-based check is exactly the trap
  the reopen caught: on this machine the symlink makes the bad ref resolve, so a
  "does it exist?" test is green precisely where the bug lives. Fail on the prefix and the check
  is machine-independent by construction.
- Add the row to `KNOWLEDGE_HELP`'s `Checks:` block and to `knowledge-lint.ts`'s header comment
  list, and cover it in the knowledge-lint suite alongside `provenance-bad-grammar`'s existing
  cases: one firing case, one clean case.
- **Scope note:** the rule binds `knowledge/**` (the tracked, packaged tree the linter walks).
  It does not forbid a *human-readable mention* of `references/` in prose — it forbids a
  **machine ref** that a gate resolves.

**The command must STOP RESOLVING refs against `references/` — the rule and the resolver
currently contradict each other** *(Amendment 2, C5)*. `src/commands/knowledge.ts:124-129` still
builds `repoFiles` from `knowledge/**` **plus a walk of `references/**`**, guarded by
`existsSync`. That walk exists to let an `ease:source` ref target the private corpus — the exact
thing `provenance-machine-local-ref` now makes an **error**. It is therefore a tracked gate
reading through a machine-local symlink (B10), and its `existsSync` guard is textbook
`guard-skip-is-a-silent-noop`: present here, silently absent in CI, and the difference is
invisible in both exit codes.

- **Delete the walk. `repoFiles` becomes `knowledge/**` only**, and the comment at `:124` that
  names `references/**` as a legal ref target goes with it.
- **Verify before deleting, do not assume:** grep every `ease:source` marker under `knowledge/`
  and confirm **zero** target `references/` or `taste/` (T7 asserts this; the grep is what makes
  the deletion safe rather than hopeful). If one exists, it is a `provenance-machine-local-ref`
  error to fix at its source — never a reason to keep the walk.
- **One defect, one finding — decided here so the round-trip tests are not surprised.** When a
  marker's ref matches the machine-local prefix, the linter emits **`provenance-machine-local-ref`
  ONLY** and suppresses `provenance-bad-grammar`'s dead-ref finding for that same marker. Without
  the suppression, removing the walk makes every such ref fire twice, and the second message
  ("dead ref") points the reader at the wrong fix — making it resolve is precisely what must not
  happen. Cover both halves in the knowledge-lint suite: a machine-local ref yields exactly one
  finding with the right checkId; an ordinary dead ref still yields `provenance-bad-grammar`.

### 8.4 The retarget inventory *(one place; every other list in this spec points here)*

Surveyed in the working tree on 2026-07-25 with
`grep -rn 'references/canvas-ui' knowledge templates src tests`: **31 occurrences across 10
files.** End state is **zero**, swept by T7 (§9). The verdict's known-site list named neither
`knowledge/README.md` nor `src/core/knowledge-lint.ts`; this survey additionally found
`templates/skills/canvas-effect.md` and three sites in the routing test that no earlier list
named. **This table is a snapshot dated above; the grep at execution time is the authority** —
if a site here is gone or a new one has appeared, the grep wins and the discrepancy goes in the
report.

| File | Sites | Note |
|---|---|---|
| `knowledge/canvas-effect-direction.md` | `:6` `:43` `:74` `:80` `:83` `:129` (6) | `:74` is the `ease:source` marker (§5.7); `:129` is inside the install-handoff block |
| `knowledge/README.md` | `:18` (1) | index-row description cell |
| `templates/skills/canvas-effect.md` | `:54` (1) | inside the install-handoff block; **published tree** (§6) |
| `src/core/knowledge-effect-catalog-check.ts` | `:5` `:109` `:128` `:147` `:148` `:157` `:193` (7) | header comment, doc comment, 5 user-visible messages |
| `src/core/knowledge-effect-matrix-emit.ts` | `:76` (1) | the emitted `ease:source` ref — M4 asserts it |
| `src/core/knowledge-lint.ts` | `:41` (1) | `KnowledgeLintInput` doc comment |
| `src/core/command-signatures.ts` | `:879` `:882` (2) | subcommand `summary` + `--dir` flag summary |
| `src/commands/knowledge.ts` | `:31` `:41` `:47` `:67` `:155` `:168` (6) | `KNOWLEDGE_HELP` ×4, one doc comment, one `NO_LEDGER` message |
| `tests/adapters-canvas-effect-routing.test.ts` | `:55` `:60` `:142` `:143` (4) | the `references` walk root · the `LEDGER` read path · the T6b directory assertion. **Earlier drafts cited `:57` for the walk root; `:57` is blank — the root is at `:55`.** |
| `tests/knowledge-effect-matrix-emit.test.ts` | `:89` `:159` (2) | M4's marker assertion and an M5 fixture |

Two of these are **not** mechanical string swaps and carry their own tasks:
`tests/adapters-canvas-effect-routing.test.ts:55` (drop the root — §9 T5) and the same file's
`LEDGER` type declaration, which must gain `overlayFallback` with the schema (§4).

## 9. Tests

**`tests/knowledge-effect-catalog.test.ts`** — EXISTS (140 lines, untracked); amend to the
contract below (unit, pure, no fs):
one case per checkId in §8.2 firing, plus one clean-catalog case producing zero findings, plus
a ledger-absent + knowledge-absent case producing zero findings.

**Drift cases — required, and the first one is the exact stage-4 failure** *(Amendment 2, C1)*:

- **The relabel case (this test is the point of the correction).** Take a fixture whose ledger
  carries an `object` effect, write its matrix row with `family` = `live-html` **and the Draco
  clause deleted from its `Required fallback` cell**, and assert the result contains **both**
  `effect-catalog-row-drift` (on `family`) **and** `effect-catalog-draco-missing` for that slug.
  **Against today's implementation this fixture produces zero findings**; a version of this test
  that passes before the linter changes has been written wrong.
- **Display-name drift** — a row whose `Effect` cell differs from the ledger `name` (same slug)
  fires `effect-catalog-row-drift` on `name`.
- **Both-fields drift** — one row, wrong name and wrong family: exactly two findings, in the
  fixed order `name` then `family` (Art I.2 — the order is asserted, not incidental).
- **Unknown slug makes no Draco claim** — a row whose slug is absent from the ledger fires
  `effect-catalog-slug-unknown` and **no** `effect-catalog-draco-missing`, whatever its family
  cell says.
- **Clean case unchanged** — an emitter-shaped matrix filled with prose yields zero findings; the
  drift check must not fire on correct rows (backtick-wrapped slugs, spacing, and case are the
  obvious false-positive traps — normalise the same way the row parser already does).

**`tests/knowledge-effect-matrix-emit.test.ts`** — EXISTS (171 lines, untracked); amend (unit,
pure, no fs) — the Art II emitter proof:

- **M1 determinism (Art I.2)** — two calls on the same `catalogJson` return identical bytes.
- **M2 roster fidelity** — one row per ledger effect, in ledger order; `Effect`/`slug`/`family`
  match the ledger exactly; no row exists that the ledger does not carry.
- **M3 empty prose cells** — `Narrative job`, `Anti-use`, `Required fallback` are emitted empty
  for every row. A future "helpful" default in any of these three fails this test on purpose.
- **M4 provenance marker** — the emitted head is the `ease:source` marker of §5.7 carrying the
  ledger's `captured`, and the marker is emitted exactly once. **Its `ref` is
  `knowledge/canvas-ui/catalog.json`** — `tests/knowledge-effect-matrix-emit.test.ts:89` and
  `:159` assert the old path today and are retargeted in the same change.
- **M5 bad-ledger paths** — unparseable JSON, missing `effects`, a bad `family` value, **a
  `family: "overlay"` value (now invalid — the enum is two-valued), and a missing or
  non-boolean `overlayFallback`** each return `{ ok: false }` with the documented code, never a
  partial matrix.
- **M-fixtures move with the schema.** Every fixture ledger in M1–M6 carries
  `overlayFallback` on every effect and uses only the two-valued `family` enum (B9 / Art II —
  emitter, linter, fixtures, and allowlists move in ONE change).
- **M6 round-trip (the pair-coherence proof — the one test that makes §8 an Art II pair).**
  Emit from a fixture ledger, splice the output into a minimal knowledge-file fixture, run
  `lintKnowledge`, and assert **exactly N `effect-catalog-field-empty` findings (N = ledger
  size) and zero findings of every other checkId**. If the emitter and the linter ever disagree
  about the row shape, this is the test that says so.

**`tests/adapters-canvas-effect-routing.test.ts`** — EXISTS (232 lines, untracked); amend. The
routing proof Fable requires, plus the four retarget sites of §8.4:

- **T1** `VERB_SKILL_REFS.{generate,refine,redesign}` each contain `"canvas-effect"`.
- **T2** every other verb in `VERB_SKILL_REFS` does **not** contain it (iterate over
  `Object.keys`, do not hardcode the exclusion list — a new verb must fail closed).
- **T3 (prompt-context inspection — the leakage gate).** No file under
  `templates/workflows/**` contains any ledger slug or the string
  `canvas-effect-direction.md`. Ordinary generation context provably does not contain the
  catalog. *This is the release-blocking "catalog leakage" check.*
- **T4** `templates/skills/canvas-effect.md` is the only file under `templates/**` that
  references `knowledge/canvas-effect-direction.md`.
- **T5 (adverse-branch cut line).** The `ease:install-handoff:start/end` marker pair appears
  in exactly the two files named in §7, and the upstream install command string appears in **no
  other file under the walked roots**. **Scan the working tree, not the index** — this task
  commits nothing, so every file it adds is untracked and a `git grep`/tracked-files scan would
  skip exactly the new files the check exists to police.

  **The walked roots are exactly `knowledge/`, `templates/`, `src/` — three, and `references/` is
  REMOVED.** *(An earlier draft said "no other file in the repo" and also said "walk the tree
  excluding `node_modules`, `dist`, `.git`". Those are two different scopes and only one of them
  is what the test does. Art VIII: the assertion is scoped to the three roots and claims nothing
  about `tests/`, `specs/`, `docs/`, or the repo root — T7 is the sweep that covers `tests/`.)*
  The current implementation walks `references` as a literal fourth root
  (`tests/adapters-canvas-effect-routing.test.ts:55` — earlier drafts cited `:57`, which is
  blank), and `readdirSync` on a directory that does not exist throws `ENOENT`. **That test
  therefore CRASHES on a clean clone regardless of where the ledger lives** — the same bug class
  as the ledger itself, in a second place, and it would turn the clean-clone gate red even after
  a correct ledger move. No tracked test may walk a machine-local path (B10). Since the ledger is
  now under `knowledge/`, the coverage this root provided is retained, not lost.

  **Two further sites in the same file move with it** (§8.4): the `LEDGER` read at `:60`
  (`references/canvas-ui/catalog.json` → `knowledge/canvas-ui/catalog.json`) and the T6b
  directory assertion at `:142`–`:143`. The file's `LEDGER` type declaration also gains
  `overlayFallback` with the schema (§4) — a type that omits a required field lets T6b's
  "exactly these keys" assertion be written against the wrong shape.
- **T6 (no-source gate) — four assertions, and an honest statement of what they do NOT prove.**

  The earlier draft of this spec claimed T6 "prevents all Canvas UI source in packaged files"
  while checking only fenced imports. That is an Art VIII violation: a static check says
  exactly what it checked. T6 is therefore split into four mechanical assertions plus a named
  residual risk closed by human audit.

  **The packaged surface is a FACT, not an assumption:** `package.json` `files` =
  `["dist", "knowledge", "schemas", "templates"]`. `src/` is **not** published; it reaches users
  only compiled into `dist/`. **`knowledge/` IS published — and after the reopen that is where the
  ledger lives, deliberately** (§4).

  **The T6a rationale is REVERSED here, honestly and in full** *(reopen correction 4)*. The
  original text said `references/` is not published, **therefore** the ledger cannot ship. That
  sentence was true about `references/` and false as a claim about this feature: the ledger was
  not unpublishable because it was protected, it was unpublishable because it was **not in the
  repository at all**. Now the ledger ships on purpose, so any surviving
  "`references/` is not published ⇒ the ledger cannot ship" rationale is an **Art VIII overclaim
  and a release blocker** — in this spec, in test header comments, and in code comments alike.
  **T6a's assertion does not change by one character; only its stated meaning does.**

  - **T6a — packaged-surface invariant.** `package.json.files` equals exactly those four
    entries. *Effect (corrected):* **no new tree can be published silently.** A fifth entry —
    or a quiet swap of one — fails a test. It says nothing about whether any particular file
    ships; `knowledge/canvas-ui/**` ships, by design, and the package audit below is what
    confirms *what* is in the tarball. This is still the single strongest assertion available
    about the packaged *surface*, and it is exact, not heuristic.
  - **T6b — ledger allowlist (fail-closed).** **`knowledge/canvas-ui/`** contains **exactly**
    `README.md` and `catalog.json` — any third file fails, whatever it is. In `catalog.json`,
    every object in `effects` has **exactly** the keys `slug`, `name`, `family`,
    **`overlayFallback`** (extra keys fail, a missing key fails), `family` ∈ the **two** enum
    values `live-html` | `object`, `overlayFallback` is a boolean, and the top level has exactly
    `upstream`, `revision`, `captured`, `license`, `effects`. *Effect:* upstream descriptions,
    parameter lists, or code cannot be smuggled in as an extra field or an extra file — and this
    matters MORE now, not less, because the allowlisted tree is a published one.
  - **T6c — authored-artifact content gate**, over the two files this spec adds to the
    *packaged* trees (`knowledge/canvas-effect-direction.md`,
    `templates/skills/canvas-effect.md`):
    - **No executable code fence.** The ONLY fenced block permitted in either file is the one
      inside the `ease:install-handoff` markers; its info string must be empty, `bash`, or
      `sh`; and its body must be a single line matching the emitted upstream install command.
      Any other fence in either file — any language, any content — fails.
    - **No implementation identifiers** anywhere in either file: `import `/`from "`/`require(`,
      a JSX/TSX element (`<Capitalised`), `export `, `useEffect`/`useRef`/`new THREE.`, or an
      `=>`.
    - **No API/prop table**: no markdown table whose header row contains `prop`, `param`,
      `type`, `default`, or `option` (case-insensitive). The matrix's own header is the
      allowlisted exception, matched exactly.
    - **The upstream package identifier** appears only inside the two handoff blocks; the
      upstream *URL* appears only in the ledger, the `ease:source` marker, and the handoff.
  - **T6d — source-tree sweep (weaker, and labelled as such).** No file under `src/**`
    contains the upstream package identifier at all. `src/` is compiled into the packaged
    `dist/`, so this closes the compiled path; it is a substring check and claims nothing more.
  - **T6e — packaged upstream-content gate (new; Amendment 2, C2).** Over the **three** packaged
    canvas files — `knowledge/canvas-effect-direction.md`, **`knowledge/canvas-ui/README.md`**,
    `templates/skills/canvas-effect.md`. The ledger README is in this set and in **no** existing
    gate, which is how the API names and the quoted upstream paragraphs shipped past T6a–T6d.
    *(T6e is a separate describe block, not an extension of T6c's `FILES`: T6c asserts
    exactly-one-fence and handoff-marker containment, and the ledger README has neither — folding
    it in would fail for the wrong reason.)*
    - **No upstream or browser API identifier.** Fail on the html-in-canvas draw-API names (2D,
      WebGL, and WebGPU variants), on `chrome://flags/`, and on `THREE.`/`three` as a code
      identifier. **List the banned strings explicitly in the test** rather than pattern-matching
      cleverly — a named list is auditable and a regex over API-shaped words is not.
    - **No long verbatim upstream quotation.** No quoted span (straight or curly double quotes)
      longer than **12 words** in any of the three files. DESIGN:OS's own words need no quotation
      marks; a long quoted run is the signature of pasted upstream expression. Short quoted terms
      and the display names are unaffected.
    - **Preservation assertions — the purge must not eat the citation** (§3 B2): the official
      Chrome source URL and a `checked: YYYY-MM-DD` date are **present** in
      `knowledge/canvas-effect-direction.md` **and** `knowledge/canvas-ui/README.md`, and the
      pinned revision string is present in both. A test that only forbids is a test that rewards
      deleting the evidence trail.
    - **What T6e does NOT prove:** it cannot detect an *unquoted* paraphrase-free copy, a renamed
      API identifier, or upstream prose reflowed into our voice. It narrows; the diff audit closes
      (same standing as T6c/T6d — Art VIII).
  - **T7 — symlink-independence sweep (new; the reopen's own regression test).** Over the
    tracked trees `knowledge/`, `templates/`, `src/`, `tests/`: **zero** files contain the string
    `references/canvas-ui`, and **zero** `ease:source` markers under `knowledge/` carry a `ref`
    beginning `references/` or `taste/`. *Effect:* the exact bug the reopen caught cannot come
    back by hand-edit, and correction 7's "exactly one such ref exists today" is held at zero
    mechanically rather than by memory. T7 is the test-suite half; `provenance-machine-local-ref`
    (§8.3) is the linter half that also fires for future knowledge files this spec never touches.

  **What T6 does NOT prove — state this in the test file's header comment and in any report.**
  These are substring and structure checks. They cannot detect a *paraphrase* of upstream
  logic, a renamed identifier, an algorithm described in prose, or source pasted into a file
  this spec does not touch. Static detection of "no upstream source" is undecidable and must
  never be claimed.

  **Residual risk is closed by explicit human audit, not by T6.** Two audits are release
  gates, recorded with their output:
  1. **Diff audit** — the Opus audit stage reads, per file under `knowledge/**`, `templates/**`,
     `src/**`, `references/**`: the FULL `git diff` for every *changed* file and the FULL
     *contents* of every *added* file (nothing is committed, so added files have no diff — a
     `git diff`-only audit would read zero of the new artifacts, which are the entire risk
     surface). State per file that no upstream implementation content is present. A grep is not
     a substitute for reading it.
  2. **Package audit** — run `npm pack --dry-run` and read the emitted file list; confirm the
     tarball **CONTAINS `knowledge/canvas-ui/README.md` and `knowledge/canvas-ui/catalog.json`**
     — both read in full during this audit — and **no other new file**, and no file carrying
     effect implementation. *(Reopen correction 5: the expectation is INVERTED. The old audit
     confirmed the ledger's absence; a ledger absent from the tarball now means a published
     knowledge file whose `ease:source` ref dangles.)* Record the file list in the release
     evidence.

  *T6a–T6e and T7 are release-blocking on failure; the two audits are release-blocking on absence.*

**The clean-clone proof — the reopen's headline evidence. It has TWO halves on two different
clocks, and conflating them is how a partial proof gets reported as a whole one.**

Every gate above runs on a machine where `references` and `taste` resolve. That is exactly the
condition under which the original implementation went green while the repository did not contain
its own ledger. The evidence that answers it splits cleanly:

| | **G-now — symlink-independence run** | **G-CI — the true clean clone** |
|---|---|---|
| What it is | the full suite executed in a temp tree with no `design-os-hq` sibling, holding the corrected files | `.github/workflows/ci.yml` on the pushed branch |
| Runnable | **now, in this session, with no commit and no push** | **only after the owner commits and pushes** — outside this session |
| Proves | the artifacts and gates **do not read through the private symlink** | additionally that the artifacts are **actually in the repository** |
| Status | **implementation-complete criterion** (§11.8b) | **release gate** (§11, release-complete) |

**G-now — what this session can run and must record.**

1. `git clone` this repository into a **temp directory with no `design-os-hq` sibling** (e.g.
   under `$(mktemp -d)`; verify `../design-os-hq` is absent from *that* location before starting,
   and that `references`/`taste` do not resolve there). `git clone` of a local path is read-only
   against the source tree — it is not a commit and not a push.
2. **The clone carries only committed content, and this session commits nothing** — so the clone
   alone will NOT contain the corrected artifacts. **Copy the working-tree files into the temp
   tree** (the allowlisted paths from Phase 0.4, plus a `node_modules`-free `npm ci`). This is the
   only method available to this session; **do not commit to make the gate easier, and do not
   treat "the owner could authorize a commit" as an option this session may take** — it is not
   this session's to take, and §11.8b is written against the copy-in method.
3. **Verify the artifact is present in the temp tree before reading any exit code** —
   `ls knowledge/canvas-ui/` must list `README.md` and `catalog.json`. Scar
   `guard-skip-is-a-silent-noop`: a run that silently omitted the new files exits 0 too.
4. `npm ci`, then `npm run typecheck && npm run lint && npm run build && npm test`, then
   `node dist/cli.js knowledge check`. **All green, full output recorded** in the report.
5. **Grep proofs, recorded** — over the working tree (the new files are untracked, so a
   tracked-files scan reads none of them): `grep -rn 'references/canvas-ui' knowledge templates
   src tests` → **0 hits** (31 today, §8.4); `grep -rn 'ease:source ref="references/' knowledge`
   and the same for `taste/` → **0 hits**.
6. **Trackability proxy, recorded** — the one thing G-now cannot otherwise see. For every new
   path, `git check-ignore -v <path>` exits non-zero (not ignored) and `git status --porcelain`
   lists it as `??`. A file that is present on disk, passes every gate, and is silently
   `.gitignore`d would reproduce the exact bug this correction exists to undo, and only this
   check catches it before commit.

7. **Write the run down, in the repository** *(Amendment 2, C4)*. G-now was run last time and its
   commands, outputs, and limits survived only in a session report — so the next reader cannot
   re-run it and the record of *what was proved* is not in the tree that carries the claim. The
   evidence file is **`docs/research/canvas-ui/implementation-evidence-260725.md`** — created by
   this change, tracked, and the **one** file this task adds to `docs/research/canvas-ui/`
   (every pre-existing file there stays read-only; this is a create, never an edit of a sibling).
   Required contents, in this order:
   - the temp-tree path and the verification that `../design-os-hq` is absent and
     `references`/`taste` do not resolve there;
   - **every command verbatim with its exit code**, in run order: the clone, the copy-in (listing
     the paths copied), `ls knowledge/canvas-ui/` **before** any exit code was read, `npm ci`, the
     four gates, `node dist/cli.js knowledge check`;
   - the **grep proofs** with their actual output (0 hits, and the number they were counted down
     from);
   - the **trackability proxy** — `git check-ignore -v` and `git status --porcelain` per new path;
   - the **isolation proof** result from Phase 0.5 (protected diffs byte-identical, status delta
     allowlisted-only);
   - **G-CI's status TODAY** on this branch, read-only, marked *pending — blocked on owner*;
   - a closing **"What this does not prove"** section, mandatory and specific: the files are not
     committed (G-now is copy-in, item 6 is a proxy) · G-CI has not run · T6a–T6e and T7 are
     substring/structure checks and do not prove "no upstream source" · the §10 benchmark has not
     run · the owner-run items (mobile GPU, context-loss) and the §12.1 license call are open.
   **A number in this file that was not produced by a command recorded in it is a defect.** So is
   a "what this does not prove" section that lists fewer items than the list above.

**What G-now does NOT prove — state this in the report AND in the tracked evidence file; do not
let it be read as G-CI.** A copy-in run proves the *content* is self-sufficient. It does **not**
prove the files reach the repository: only an actual commit does that, and item 6 is a proxy for
it, not a substitute.

**G-CI — the release half, and not this session's to run.** GitHub CI on this branch *is* the
clean clone (`.github/workflows/ci.yml` — `actions/checkout` + `npm ci` + the four gates +
`node dist/cli.js knowledge check`, verified present; no symlink anywhere). This session records
**what CI does on this branch TODAY** (the red-before half, obtainable read-only via `gh run
list` / `gh run view` or the branch's checks page) and states that the green-after half arrives
**only once the owner commits and pushes**. **This spec does not authorize that commit or push,
and nothing in it may be read as authorizing one.**

**G-now absent, unrecorded, or red blocks implementation-complete** (§11.8b), ranking with
T6a–T6e. **G-CI red blocks release** (§11 release-complete). Together they are the only evidence
that distinguishes "this repo is correct" from "this machine is lucky"; separately, each is worth
exactly what its row above says and no more.

**Existing tests that WILL break on the 10th skill — update in the same change:**

| File:line | Current | Required |
|---|---|---|
| `tests/adapters-antigravity.test.ts:16-17` | title "28 artifacts (16 workflows + 9 craft…)", `toHaveLength(28)` | 29 / 10 craft |
| `tests/adapters-claude.test.ts:16` | title "28 artifacts (16 commands + 9 craft…)" | title only — assertion at `:18` is already dynamic |
| `tests/adapters-claude.test.ts:40` · `tests/adapters-antigravity.test.ts:37` | title "12 artifacts … (9 craft + 3 journey)" | title only — assertions dynamic |
| `tests/cmd-init-built-binary.test.ts:87-88` | comment "28 files", `toBe(28)` | 29 |
| `tests/cmd-init-built-binary.test.ts:144` | `toBe(28)` | 29 |
| `tests/cmd-init.test.ts:178` · `:186` | title "…paths has 28 entries", `toBe(28)` | 29 |

**Why `tests/cmd-init.test.ts` is a count site (added after the code was read, not from the
original survey).** `src/commands/init.ts:402` sets `adapters[].paths` to
`nonWrapperArtifacts.map(a => a.absPath)` — so `data.adapters[0].paths.length` **is** the adapter
artifact count, and that count is `WORKFLOW_VERBS.length + SKILL_NAMES.length +
JOURNEY_NAMES.length` (asserted dynamically at `tests/adapters-claude.test.ts:18`). A tenth
`SKILL_NAMES` entry moves it 28 → 29. `tests/cmd-init.test.ts:186` asserts **the identical
expression, for the same `--runtime claude`, hardcoded at 28** as its already-listed sibling
`tests/cmd-init-built-binary.test.ts:88` (in-process vs. built-binary are the only difference).
It therefore fails without the edit. **Numbers only — keep the tripwire**; do not rewrite it as
`SKILL_NAMES.length`.

**Source-file count prose that goes stale on the 10th skill — same change, comments and help
strings ONLY.** These are not tests; nothing fails when they rot, which is exactly why they rot.
Each line below was read in the current tree at the line number given.

| File:line | Current | Required |
|---|---|---|
| `src/adapters/claude.ts:6` | `12 skill files → …SKILL.md  (9 craft + 3 journey)` | `13 skill files` / `(10 craft + 3 journey)` |
| `src/adapters/claude.ts:75` | `// ── Skill files (9 craft skills) ──…` | `(10 craft skills)` |
| `src/adapters/antigravity.ts:6` | `12 skill files → …SKILL.md  (9 craft + 3 journey)` | `13 skill files` / `(10 craft + 3 journey)` |
| `src/adapters/antigravity.ts:74` | `// ── Skill files (9 craft skills) ──…` | `(10 craft skills)` |
| `src/commands/init.ts:78` | `…/.claude/skills/design-os-*/SKILL.md  (12 skills: 9 craft + 3 journey)` | `(13 skills: 10 craft + 3 journey)` |
| `src/commands/init.ts:81` | `…/.agent/skills/design-os-*/SKILL.md  (12 skills: 9 craft + 3 journey)` | `(13 skills: 10 craft + 3 journey)` |

- **Behavior-preserving, and that is a constraint, not an observation.** `claude.ts:6/:8` and
  `antigravity.ts:6/:8` are file-header block comments; `claude.ts:75` and `antigravity.ts:74`
  are section comments; `init.ts:78`/`:81` are two lines inside the `INIT_HELP` template
  literal. The emitted artifact set is driven by `SKILL_NAMES` / `WORKFLOW_VERBS` /
  `JOURNEY_NAMES` at runtime and does not read these strings. **Change the numerals and
  nothing else** — no code, no control flow, no interpolation. The only observable delta is two
  substrings in `ui init --help` output.
- **Do not interpolate `SKILL_NAMES.length` here either.** Same tripwire rule as the hardcoded
  test counts above: a literal a human must revisit when the roster moves is the point.
- **Verify before and after** that no test asserts these strings (`ui init --help` snapshot or
  substring assertions). If one does, update its number, never its shape — and it joins the
  allowlist as a count site.

**Standing survey rule — count prose is SURVEYED at close, never remembered.** The site lists in
this section are the snapshot of one survey; **the grep is the authority, this spec is not.**
Before declaring count reconciliation closed (plan Phase E / tasks Group E), sweep the working
tree for hardcoded adapter/skill/artifact counts in **both** prose and assertions, and reconcile
or explicitly justify **every** hit:

```
rg -n -i '[0-9]+ +(craft|journey|skill|slash-?command|workflow|artifact)s?\b' \
   -g '!node_modules' -g '!dist' -g '!.git'
rg -n '(toBe|toHaveLength)\(\s*2[89]\s*\)' tests
rg -n 'Total: *[0-9]+ +artifacts' src
```

Walk the working tree, not the git index (this task commits nothing — the same reason test T5
walks the tree). The survey's output goes in the report.

**This rule exists because both prior surveys were incomplete, and that is a FACT, not a
caution.** The first survey missed `tests/cmd-init.test.ts` (six sites, not five). The second
surfaced `src/adapters/claude.ts:8` and `src/adapters/antigravity.ts:8` — `Total: 28 artifacts`
in the same header comments amended above — which become **29**, under the identical
comment-only constraint. Leaving those two stale while the line above them reads `13 skill
files` makes one comment block contradict itself, so they are in scope for this change. **A
stale count found after reconciliation is closed is a reconciliation failure, not a follow-up.**

**Verify, do not assume — the new `knowledge` subcommand.** `ui knowledge` has had exactly one
subcommand since it was written. Before declaring done, grep the suite for any test asserting
the `knowledge` subcommand set, its help text, or `COMMAND_SIGNATURES` parity
(`tests/cmd-knowledge.test.ts`, `tests/journey-command-consistency.test.ts`,
`tests/flag-guard.test.ts` are the likely sites) and update whatever the second subcommand
breaks. This spec deliberately does **not** name line numbers here: the audit at that moment is
cheap and a stale line number is worse than none.

**Re-run that same audit after the `knowledge.ts` split (§8.1).** Moving `runEffectMatrix` into
`src/commands/knowledge-effect-matrix.ts` must change **no** observable behavior: same subcommand
names, same help text, same error codes, same JSON envelopes. Any test that imports from
`src/commands/knowledge.js` still resolves, or is updated in the same change. A split that
quietly drops a subcommand from the dispatch switch is exactly the signature↔help↔dispatch drift
§8.1 already warns about, one refactor later.

`tests/adapters-templates.test.ts` (fs↔registry parity) and
`tests/adapters-template-descriptions.test.ts` are already dynamic — they need no edit and
will start covering the new skill automatically. **Do not weaken a hardcoded count into a
dynamic one to avoid the edit**; the hardcoded totals are a deliberate tripwire that a skill
was added without review.

## 10. The benchmark (release gate, not an implementation gate)

Fable's required proof, **re-scoped by the reopen from "one per family" to three CAPABILITIES**
*(correction 4)*. The old scoping was unexecutable as worded: `overlay` had **zero members** at
the pinned revision, so "one effect per family" demanded a subject that does not exist. Coverage
is not weakened by the re-scope — it is restored, because a capability can actually be run.

| # | Capability | Subject, selected mechanically |
|---|---|---|
| a | **live-html rendering** via html-in-canvas | any `family: "live-html"` effect, in an **origin-trial-enabled** browser |
| b | **WebGL overlay FALLBACK rendering** | a `live-html` effect with **`overlayFallback: true`**, run with the **origin trial ABSENT** |
| c | **three.js object rendering** | any `family: "object"` effect |

**(b) is a MODE run, never a membership claim.** Supplying it as "the overlay-family effect" is a
release blocker — that is the falsified model coming back in prose. It is one effect exercised in
its degraded path, and its subject is chosen by the ledger's `overlayFallback` field, not by
taste.

**(b) is ADDITIONAL evidence, never a substitute.** It shows graceful degradation when the trial
is absent but WebGL is present. It does **not** stand in for the static-baseline capture, which is
the WebGL-fully-absent case (item 3 below). Both are required for capability (b).

Each of the three capabilities needs the **full original floor**, unchanged:

1. desktop capture + mobile capture (normal motion);
2. `prefers-reduced-motion: reduce` capture;
3. **unsupported-browser capture proving the static baseline is COMPLETE** — content,
   controls, focus order, contrast — not merely paused;
4. clean console;
5. unmount / teardown leak check;
6. WebGL context-loss recovering to the static fallback.

Additionally: the `object` family proves asset load **and error** states and its Draco
decision; **at least one low-power / mobile-GPU device** in evidence; **coexistence evidence**
for two effects (or one effect + a scrub section) sharing one page under the tenant contract.

**If no ledger effect carries `overlayFallback: true`,** capability (b) has no subject: report
that as a **BLOCKED benchmark item with the ledger as evidence** — do not silently drop it, and do
not re-introduce an `overlay` family to describe it. A capability with no subject is a fact about
the pin, and the reopen exists because the last such fact was footnoted instead of surfaced.

**Deterministic gates on the generated pages:** `ui taste-lint` (including
`animation-no-reduced-motion`) and `ui tenant-lint` where embedded — both green.

**Release-blocking failures (any one blocks ship):** a missing or incomplete static baseline ·
a load-bearing html-in-canvas dependency · catalog leakage into ordinary generation context
(test T3) · a failure of any of T6a–T6e or T7 · **an upstream API identifier or a verbatim
upstream quotation surviving in a packaged file** (§3 B2 / T6e) · **a matrix machine column that
disagrees with the ledger, or a Draco gate keyed on the matrix cell instead of the ledger**
(`effect-catalog-row-drift`, §8.2) · **an evidence claim in the ledger stated at a granularity it
was not checked at, or a boundary cited as the reason a check was skipped** (B12) · **a red, absent, or unrecorded G-now
symlink-independence run, or a red G-CI clean clone once the branch is pushed** (§9) · **a
missing diff audit or package audit** (§9 T6) · **benchmark evidence still scoped
"one per family", or overlay evidence supplied as a family-membership claim** · **a browser note
not sourced to current official Chrome origin-trial documentation with a checked date** (B11) —
the two audits are what actually stand behind the "no Canvas UI source in DESIGN:OS-packaged
files" claim; T6a–T6e narrow the search, they do not close it.

**Execution reality — this is not fully automatable here.** Headless Chromium renders WebGL
through a software rasterizer, so a headless capture **cannot** substantiate the mobile-GPU
or context-loss claims. Those items are **owner-run**, on a real device/browser, with the
captures committed as evidence. See the recorded scar
`gui-chrome-cant-launch-from-agent-sandbox`: GUI Chrome cannot be launched from the agent
sandbox, and `playwright install --force chrome` has already destroyed a user Chrome install
on this machine — **never run it**.

## 11. Acceptance criteria

**Implementation-complete (Sonnet may declare this without the legal decision):**

1. **`knowledge/canvas-ui/{README.md,catalog.json}` exist and are TRACKED**; every ledger entry
   has exactly `slug`, `name`, `family` (∈ `live-html` | `object`), and `overlayFallback`
   (boolean); the three `object` entries are the three `three`-dependent effects and are
   `overlayFallback: false`; both derivation rules are recorded in the ledger README; no upstream
   source or API text is present. **`references/canvas-ui/**` is referenced by no file under
   `knowledge/`, `templates/`, `src/`, or `tests/`** (T7 — stated as the four swept trees, not as
   "nothing tracked": this session's new files are untracked, so a tracked-files scan would read
   none of them); the private hq copy is left in place, declared a non-canonical legacy mirror
   (§4).
2. `knowledge/canvas-effect-direction.md` exists in authoring-standard shape with a Failure
   Modes section, one matrix row per ledger slug, a resolving `ease:source` marker, and the
   install handoff confined to its marked block. Its family paragraph states the **2-family +
   overlay-as-mode** model, and its origin-trial note carries the **official Chrome source URL
   and a `checked:` date** (B11) with any upstream delta recorded.
3. `knowledge/README.md` has its index row; `ui knowledge check` exits 0.
   The row's description names `knowledge/canvas-ui/` (it says `references/canvas-ui/` today,
   `knowledge/README.md:18` — a tracked site the reopen's known-site list did not name).
   `knowledge/canvas-ui/README.md` needs **no** index row: `index-missing-row` exempts any
   `README.md` (`src/core/knowledge-index-check.ts:111,136`) and `catalog.json` is not `.md` —
   the same handling `knowledge/benchmarks/README.md` already gets. Verify that, do not assume it.
4. `templates/skills/canvas-effect.md` exists with a > 40-char `Use `-bearing description;
   `SKILL_NAMES` and `VERB_SKILL_REFS` updated; the three workflow templates route to it
   after the T6 decision.
1b. **Ledger evidence claims are honest (B12, Amendment 2 C3).** `knowledge/canvas-ui/README.md`
   states, per field, what was actually checked and at what granularity: `overlayFallback` is
   written as **class-level** evidence (one architectural statement at the pin, applied to the 22
   `live-html` rows as a class) with its falsification condition kept; `family`'s evidence
   sentence matches the act performed and no longer claims a per-effect source-tree read that did
   not happen. **The B4 clause excusing the per-file read is deleted** — grep the file for `B4`
   and for `not performed`, and confirm no boundary is cited as the reason a verification was
   skipped.
1c. **The packaged trees are clean of upstream API identifiers and verbatim upstream prose
   beyond display names** (§3 B2, Amendment 2 C2) — `knowledge/canvas-effect-direction.md`,
   `knowledge/canvas-ui/README.md`, `templates/skills/canvas-effect.md` — **while the official
   Chrome source URL, the `checked:` date, the milestone numbers, the pinned revision, and the
   recorded discrepancy all survive** in paraphrase. T6e green, including its preservation
   assertions.
5. All **eight** checks in §8.2 — the seven original **plus `effect-catalog-row-drift`** — **plus
   `provenance-machine-local-ref` (§8.3)** exist, fire on their
   own fixtures, and are green on the real tree; `knowledge/authoring-standard.md` carries the
   machine-local-ref rule (Artifact F — the standard and its linter in one change).
5b. **The machine-column drift contract holds (Amendment 2, C1):** `effect-catalog-row-drift`
   compares `Effect` and `family` against the ledger for every known-slug row, emits findings in
   row order then `name`-before-`family` order, and **`effect-catalog-draco-missing` keys on the
   ledger family, never on the matrix cell**. The relabel fixture (§9 — `object` row written
   `live-html` with its Draco clause deleted) **fails** with both findings; confirm it produces
   zero findings against the pre-amendment linter, so the test is known to be load-bearing.
5c. **`ui knowledge check` no longer resolves `ease:source` refs against `references/`**
   (Amendment 2, C5): the `references/` walk and its comment are gone from
   `src/commands/knowledge.ts`, `repoFiles` is `knowledge/**` only, the pre-deletion grep showing
   zero machine-local refs is recorded, and a machine-local ref yields **exactly one** finding
   (`provenance-machine-local-ref`, with `provenance-bad-grammar` suppressed for that marker).
6. **The emitter exists and is wired (Art II):** `ui knowledge effect-matrix` runs against the
   real ledger and prints a matrix whose machine columns match it byte-for-byte; the subcommand
   is registered in `COMMAND_SIGNATURES`, appears in `KNOWLEDGE_HELP`, and dispatches — all
   three verified, not assumed. Its ledger path, help text, signature `summary`, and error
   messages all name `knowledge/canvas-ui/catalog.json`
   (`src/core/command-signatures.ts:879,882` are two of the sites). Tests M1–M6 pass under the
   new schema, including the M6 round-trip.
6b. **Art IX holds across the split:** `src/commands/knowledge.ts` (212 lines today) and the new
   `src/commands/knowledge-effect-matrix.ts` are each **under 200 lines**, checked with `wc -l`;
   `knowledge-effect-catalog-check.ts` (198 today) and `knowledge-effect-matrix-emit.ts` likewise,
   **separately** — split rather than merge if either crosses.
7. Tests T1–T5, T6a–T6d, **T6e**, **and T7** pass; the six hardcoded-count sites in §9 are updated — including
   `tests/cmd-init.test.ts:178` · `:186`; any test
   broken by the second `knowledge` subcommand is updated in the same change.
7b. **Source-file count prose reconciled, behavior unchanged.** The six comment/help lines in
   §9 (`src/adapters/claude.ts:6` · `:75` · `src/adapters/antigravity.ts:6` · `:74` ·
   `src/commands/init.ts:78` · `:81`) read 10 craft / 13 skills, and the two `Total: 28
   artifacts` header lines (`src/adapters/claude.ts:8` · `src/adapters/antigravity.ts:8`) read
   29. `git diff` for these three files shows **comment and template-literal text only** — no
   statement, expression, or export changed; the emitted artifact set is byte-identical to
   before the prose edit (proved by the already-dynamic `tests/adapters-templates.test.ts` +
   `tests/adapters-claude.test.ts:18`, not asserted by hand). **The standing survey rule in §9
   has been run and its output recorded**; every hit is reconciled or carries a stated reason
   to stay. An unreconciled hit blocks item 8.
8. `npm run typecheck && npm run lint && npm run build && npm test` — all green, run in
   `/Users/jang/Products/ease-design` (the tree the Phase 0 baseline was taken in), **and** the
   Phase 0.5 isolation proof passes: post-run `git status --porcelain` and the scoped protected
   diffs compare against the recorded baseline, protected paths byte-identical, status delta
   only allowlisted paths. Nothing staged, committed, or pushed.
8b. **G-now, the symlink-independence run (§9), has been RUN and RECORDED — green, in a temp
   directory with no `design-os-hq` sibling**, by the copy-in method (the only one available
   without a commit), with the presence of `knowledge/canvas-ui/` in that tree verified **before**
   the exit code was read; plus the grep proofs at 0 hits and the `git check-ignore` /
   `git status` trackability proxy for every new path. **This is the one criterion the previous
   implementation-complete declaration would have failed**, and no same-machine green substitutes
   for it. The report states in one sentence what G-now does not prove (that the files are
   actually committed) and that **G-CI is a release gate, not an implementation one** — this
   session neither commits nor pushes, and implementation-complete does not wait on CI.
8c. **The tracked evidence file exists and matches the run** *(Amendment 2, C4)*:
   `docs/research/canvas-ui/implementation-evidence-260725.md` carries every G-now command with
   its exit code, the grep proofs with their real output, the trackability proxy, the Phase 0.5
   isolation result, G-CI's read-only status today marked *pending — blocked on owner*, and the
   mandatory **"What this does not prove"** section with all six items of §9.7. Every number in
   it traces to a command recorded in it. It is a **create**; no other file under
   `docs/research/canvas-ui/` is modified.
9. No new runtime dependency (`tests/zero-runtime-deps.test.ts` stays green); no network call
   anywhere in `src/`; `package.json.files` unchanged — still exactly the four entries (T6a),
   **and the ledger ships inside `knowledge/` on purpose** (§4), which the package audit confirms.
10. Every new/changed source file under 200 lines (Art IX) — this includes
    `knowledge-effect-catalog-check.ts` and `knowledge-effect-matrix-emit.ts` **separately**;
    if either approaches the limit, split rather than merge them. Same for the
    `src/commands/knowledge.ts` split (item 6b).

**Release-complete (blocked on owner — §12):**

11. Owner's license interpretation obtained; if adverse, the §7 adverse branch is executed and
    the suite is green without the handoff.
12. The §10 benchmark evidence exists, including one real low-power/mobile-GPU device and the
    coexistence case; all deterministic gates green on the generated pages.
13. **The two §9-T6 audits are done and recorded:** the per-file read of every changed file's
    full diff **and every added file's full contents** under the four trees, and the
    `npm pack --dry-run` file list — which must **SHOW** `knowledge/canvas-ui/README.md` and
    `catalog.json` (both read in full) and no other new file. Absence of either audit blocks ship
    — T6a–T6e do not substitute for them. **The four trees are now `knowledge/`, `templates/`,
    `src/`, `tests/`** (`references/` is machine-local and out of the tracked surface).
13b. **G-CI green (§9)** — the four gates plus `node dist/cli.js knowledge check` pass on
    `.github/workflows/ci.yml` for the pushed branch, which is the only run that proves the
    artifacts are in the repository rather than merely on a disk. **This criterion becomes
    checkable only after the owner commits and pushes; this spec does not authorize either.**
    Until then it is recorded as *pending, blocked on owner*, never as passed and never as failed.
14. README + `CHANGELOG.md` per the post-merge protocol in `CLAUDE.md`. This merge is
    **STORY-CHANGING** (a new capability + a new named vocabulary) → changelog **and** README
    marketing body; the marketing body is Opus-edited and Fable-audited, never Sonnet.

## 12. Owner decisions this spec does not make

1. **License interpretation of MIT + Commons Clause** for the upstream-install handoff in
   DESIGN:OS's product context. Fable: obtain **before RELEASE**, not before planning. The
   adverse branch is designed (§7) so implementation is not blocked.
   **Added consideration, not a second gate (reopen correction 2):** the published tarball now
   carries the ledger, hence the **25 upstream display names**, under `knowledge/canvas-ui/`.
   That is nominative use — no upstream expression ships, no code, no API, no description. Put it
   in front of the owner **as part of this same question**, so the interpretation covers what is
   actually published rather than a version of the package that no longer exists.
2. **Catalog refresh ownership** — who re-checks the upstream revision, on what cadence, and
   who approves additions/removals of effect names. The `effect-catalog-stale` warning
   (6 months) is a placeholder cadence until the owner sets one.
3. **Whether the one-effect-per-viewport cap (B7) may be relaxed for specific expressive
   personas.** Spec assumes NOT relaxed.
4. **The private hq mirror's fate.** The owner has decided it is **not deleted** and is a
   non-canonical legacy mirror (§4). Open only if the owner later wants it removed; nothing in
   this spec depends on it either way, and nothing tracked may ever read it (B10).

## 13. Out of scope

Figma static approximation (B5) · any change to the 32-component semantic catalog (B3) · any
`ui` subcommand that installs, fetches, or executes effect code (B1) · vendoring or porting
upstream source in any form (B4) · publishing anything to npm.
