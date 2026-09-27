# Changelog

## 2026-09-27 - Persuade evidence: r7 fix, r8 rule, scroll-story probe (PR-FU5a)

### Fixed
- **`ui build-evidence lint`'s r7** (font check) no longer passes a font-check value that is a plain
  JS object with a `false` member. The old check did `Boolean(data[key])`, and `Boolean({...})` is
  always `true` for any non-null object — so `{"fontsCheck": {"serif": true, "sans": false}}` PASSed
  even though the sans face never rendered. r7 now requires the value to be a bare `true`, or an
  object whose EVERY member is `true`; any `false`, non-boolean member, or non-boolean top-level
  value now FAILs, naming the offending key in the reason (`fontsCheck.sans`) so the operator does
  not have to open the JSON (`src/core/build-evidence-rules-probe.ts`).

### Added
- **`ui build-evidence lint` r8 "Persuade evidence"**: a new rule for marketing/landing-page evidence
  folders, on when the folder holds `contact-sheet-build.png`, `concept.md`, or `--mode persuade` is
  passed (SKIPPED otherwise — an "Operate" folder). Requires both `contact-sheet-build.png` and
  `contact-sheet-bar.png` (or a non-empty `contact-sheet-bar.NOT-CAPTURED.txt` naming the capture
  error), a `critic-*.md` carrying a rubric total `N/16` and one of `SHIP-CANDIDATE|REVISE|REJECT`,
  and a scroll-story probe output in the folder (`src/core/build-evidence-rules-persuade.ts`).
- **`ui scroll-story <frames-dir> [--json]`**: reads a scroll capture's ordered frames
  (`f0001.png`, `f0002.png`, … — `scroll-frames.mjs`'s output), decodes each PNG with `node:zlib`
  only (reusing the existing zero-dependency codec in `src/core/png-codec.ts`), downsamples every
  frame to a 32xN grey grid, and reports `changeRatios` (mean abs grey diff / 255 between adjacent
  frames), `staticRun` (longest run of near-identical adjacent pairs — a frozen/paused capture), and
  `layoutVariance` (variance of the row-energy profile across the whole sequence), then an
  informational `story: ACTIVE | FLAT` verdict — never a gate; exit 0 for any readable directory,
  exit 2 only when the directory itself is missing or unreadable (`src/core/scroll-story-kernel.ts`,
  `src/commands/scroll-story.ts`). r8's scroll-story check greps for the same report markers the
  command's text output emits, so the emitter and the linter cannot drift apart.
- Real run on `plans/260926-2305-design-os-revamp/evidence/landing-1/{scroll-build,scroll-bar-white-desert}`
  (table: `plans/260926-2305-design-os-revamp/evidence/fu5a/real-run.md`): both captures read
  `ACTIVE` under this probe; `scroll-build`'s `layoutVariance` (4868.24) is actually HIGHER than
  `scroll-bar-white-desert`'s (3092.96) — the opposite of the critic's "story told by scrolling"
  ranking in `critic-taste-duel.md`. Recorded as measured; thresholds were fixed from the synthetic
  red-first fixtures before this run and were not adjusted to fit the narrative.

## 2026-09-27 - the gate must honour its own inputs (PR-FU3-r2)

### Fixed
- **`ui gate --tokens <f>`**: the embedded `token-coverage` check now grades against THAT
  file, never the repo's own auto-detected brand tokens — before this, the same page scored
  identically (0.419) whether graded with the project's own tokens or an unrelated brand
  token file, because the coverage path never consumed `--tokens` at all. A bad `--tokens`
  path now fails loud (`TOKENS_NOT_READABLE`) on the coverage path too, matching the existing
  raw-hex check.
- **DTCG token files of any depth now compile**: `ui tokens compile`, `ui gate --tokens`,
  `ui token-coverage --tokens` and `ui taste-lint --tokens` (`src/core/token-model.ts`)
  previously accepted only a flat two-tier file (category → leaf); a persona's
  `starting_tokens` nest a category into sub-groups (`font.family.body`) and mix a leaf with a
  group at the same level (`color.accent` beside `color.surface`) — the kernel could not
  consume the persona library it ships. The parser now walks a category to any depth,
  flattening every nested group's name into the leaf's tokenName joined by `-`
  (`family.body` → `family-body`), so the emitted CSS variable name is unaffected either way.
  `$type: "string"` (a non-design-value leaf, e.g. `elevation.shadow: "none"`) is now accepted
  and passed through verbatim. A `fontFamily` token's `$value` may now be a font-stack array;
  it compiles to ONE comma-separated CSS value, never split into `-0`/`-1`/`-2` variables. A
  `shadow` composite (`src/core/token-emit.ts`) now ALSO emits one `box-shadow` CSS value
  (`offsetX offsetY blur spread color`) under its own path's variable name, alongside the
  existing per-member variables (an existing consumer, `ds-preview-sections.ts`'s
  `shadowValue()`, composes its own `box-shadow` string from those). An alias whose path is
  written against the NESTED source JSON (`{color.text.primary}`, matching how a human or
  generator would naturally spell a path into `font.family.body`-shaped groups) now resolves
  correctly — `src/core/token-resolve.ts`'s alias lookup tries the alias exactly as written
  first, falling back to its flattened form (`color.text-primary`) — cycle detection keys on
  the resolved index path so the two spellings of one target are never treated as different
  nodes. (Controller fix round, same PR: the first pass only made the flattened spelling
  resolve; the nested spelling — the one a persona token file, and a human, would actually
  write — still threw `DANGLING_ALIAS`.)
- **`ui tell-lint`'s `shape-assembled-illustration`** no longer fires on a cluster of rounded
  sibling containers that carry text in their own children (a `<dl>` of metric cards, each a
  `div` wrapping a `dt`/`dd` pair) — the "textless" check compared a structure fact's own line
  against every text fact's line, and a card's copy lives on the nested `dt`/`dd` lines, never
  the card `div`'s own line. Fixed by checking the structure's hierarchical `nodeRef` for a
  text-fact descendant instead (`src/core/tell-rules-motion.ts`).
- **`ui taste-lint`'s `raw-hex-when-token-exists`** now recognises a hex embedded in a
  composite token member (a shadow token's `color: "#0000001f"`, 8-digit) as a known hex — the
  token-hex harvester (`collectTokenHexes`, `src/commands/taste-lint.ts`) previously only read
  a color leaf's own string `$value` and never walked into a composite leaf's `$value` object,
  so a shadow's embedded color could never be "known". It also now accepts 8-digit hex (alpha
  stripped) wherever it previously accepted only 3/6-digit.
- **`ui gate --family <slug>`** (or a `--tokens` file with a top-level `"persona"` field
  naming a slug) now applies that persona family's `gate_policy` from
  `knowledge/personas/families.json`: `"error"` upgrades a check's default severity for that
  run, `"exempt"` drops the finding. Absent both, a check's default severity is unchanged.
- **`ui ds-usage-lint`** and **`ui tenant-lint`** now route a page's `<link rel="stylesheet">`
  CSS through the shared `html-css-loader.ts` (PR-FU3's loader) like the six FU3 commands: a
  violation living only in a linked stylesheet now turns them red, with parity against the
  hand-inlined equivalent, and a missing linked file is an error finding, never silence.
  `tenant-lint`'s own local `<script src>` resolution is unaffected (out of `html-css-loader`'s
  CSS-only scope).

### Deviation from the dispatched file list (documented per the Fable Loop's root-cause rule)
- `src/core/tell-rules-motion.ts` was edited, not just `src/commands/*`/`src/core/tell-lint*` —
  `shapeAssembledIllustration`'s rule body lives there, and patching around it in `tell-lint.ts`
  would have been a workaround over the root cause. Two-way reversible; called out for review.

## 2026-09-27 - apply the Q3 verdict to the iOS quiet family; stage a Q4 serif candidate (PR-W6d)

### Changed
- **`knowledge/personas/families.json`**: `ios-quiet-single-accent-neo-grotesque` shrinks from
  its clustered 10-app membership to a measured 4-app core (Perplexity, Brink, corner, Rodeo)
  after a 54-screen extraction round on its thin members (`plans/260926-2257-persona-rebuild-research/evidence/q3-q4/q3-per-app.md`).
  `apps`/`screens` recomputed (10/23 -> 4/28). LINE (8 screens) moves to
  `ios-hairline-neutral-neo-grotesque` (8/39 -> 9/47), its nearest medoid. Grok Bot, Mesh,
  Noom, Notion Mail and Oura are removed and NOT silently re-homed — each is recorded in a
  `history` note with its nearest medoid and distance. `attributes`/`starting_tokens` are left
  unchanged pending a future re-extraction pass (no emitter for those fields exists in this
  repo yet); the history notes say so explicitly.

### Added
- `plans/260926-2257-persona-rebuild-research/candidates/ios-serif-display-plus-sans.md`: a
  staged Q4 candidate (NOT added to families.json) — a 5-app serif core (Future Pro, Wispr
  Flow, Goodreads, Noom, NYTimes) plus Lloyds Mobile Banking as an outlier, with per-app serif
  share, pairwise distances, the `sans-display+serif-body` schema gap (Substack, Matter), and a
  blind-review block for the owner.

## 2026-09-27 — build-loop failure modes from the owner's review

### Changed
- `knowledge/build-loop.md`: four failure modes added from the owner's review of the approved reference render (native control in the OS format, copy shortened until it fits, chart that reads only at the summary, Operate density left loose).

## 2026-09-27 - build-evidence lint: the build-loop standard's linter half (PR-FU4)

### Added
- **`ui build-evidence lint <dir> [--widths 375,768,1440] [--json]`** — a new top-level command
  (not a subcommand of `ui evidence`, which is the unrelated user-evidence/anti-fabrication ledger)
  that checks a builder's evidence folder against `knowledge/build-loop.md` and reports PASS / FAIL /
  SKIPPED-with-reason per rule: r1 a probe JSON beside every screenshot PNG; r2 every required width
  present as a PNG; r3 the probe's scrollWidth/innerWidth (or scrollW/width) has scroll <= inner; r4
  `gates.txt` names an inlined variant and every recorded `exit=` is 0 or accounted for in
  `deviations.md`; r5 `deviations.md` exists and every entry carries a number+unit/ratio (px, %, :1,
  ms); r6 a red-probe line (a deliberately-bad-input non-zero exit) exists in `gates.txt` or
  `falsification.txt`; r7 the probe's font-check is true, or the PNGs are marked fallback-face in
  `deviations.md`. Exit 0 all PASS/SKIPPED, 1 any FAIL, 2 the folder is missing. New core:
  `src/core/build-evidence-rules-{shared,shots,probe,gates,deviations}.ts` — pure functions over one
  folder listing, no network, no model calls. Real probe JSONs vary both the sidecar filename (a
  per-width file, `probe-<width>.json`, a single `probe.json` keyed by `widths[width]`, or a single
  `probes.json` keyed by `"<stem>-<width>"`) and the measurement keys (`scrollW`/`innerW` vs
  `scrollWidth`/`innerWidth` vs `scrollW`/`width`) — all forms are read.
- The build-loop standard (`knowledge/build-loop.md`) had an emitter (the loop itself) but no
  linter, so it was prose that could drift unchecked. Run on the real acceptance evidence (5 persona
  folders + `acceptance-rerun-8-stage2`): every folder passes r1-r3; three folders FAIL r4/r5 because
  they ship no `deviations.md` at all against a real non-zero gate `exit=`; three FAIL r6 (no
  red-probe / falsification evidence anywhere) and SKIP r7 (no probe JSON carries a font-check key).
  Table and per-finding detail: `plans/260926-2305-design-os-revamp/evidence/fu4/real-run.md`.

## 2026-09-27 - gates must read linked stylesheets (PR-FU3)

### Fixed
- **`ui gate`, `ui taste-lint`, `ui a11y-lint`, `ui validate-layout`, `ui content-lint` and
  `ui token-coverage`** now resolve a local `<link rel="stylesheet" href>` relative to the
  HTML file and `@import` one level deep, and judge the union of inline + linked CSS exactly
  as if it had been hand-inlined at the `<link>` tag's own position. Before this fix, every
  family except `token-coverage`'s own ad hoc reader judged only the HTML file's own text — a
  violation living only in a linked stylesheet gated green. New shared loader:
  `src/core/html-css-loader.ts` (`loadLinkedCss`/`inlineLinkedCss`), the ONE place every
  command's load path now routes through, so a future linter never re-introduces the gap.
- A locally linked stylesheet (or its one-level `@import` target) that cannot be read is now
  an **error-severity finding** (`linked-css-unreadable`) on every affected command — never
  silent. `token-coverage`'s previous ad hoc reader (`token-coverage-io.ts`) skipped an
  unreadable linked file and kept scoring on what it could read; it now surfaces the error and
  fails the check.
- **`ui tokens compile`**: a "null" shadow token (zero blur/offset/spread — no visible effect)
  is now omitted from CSS/Tailwind output entirely, instead of emitting a raw hex `color`
  member the token model has no way to alias back to a color token (a shadow's `$value` is a
  plain object, never walked for embedded hexes by the token-hex harvester). Without this, a
  freshly-compiled `tokens.css` linked from a page would trip `raw-hex-when-token-exists` the
  moment gates started reading linked CSS — confirmed on real data: two acceptance worktrees'
  pre-fix `tokens.css` files fire 5× `raw-hex-when-token-exists` on `#0D0D0D` once judged.
- Motivation: the owner rejected gate-green builds; Opus traced the cause class to unread
  linked CSS. Re-gated the six real acceptance sets with linked stylesheets before/after —
  **6 of 8** flipped from gate-green to gate-red purely from reading CSS the browser was
  already reading. Full table: `plans/260926-2305-design-os-revamp/evidence/fu3/regate.md`.

## 2026-09-27 — build-loop knowledge file

### Added
- `knowledge/build-loop.md`: the measure-then-decide build loop every UI builder runs regardless of model (instruments proven first, one data model, probe + screenshot every round, deviations with numbers), indexed in `knowledge/index.json` and the README files table. Distilled from the approved reference render of 2026-09-27.

## 2026-09-27 - brand-token coverage gate (PR-TG)

### Added
- **`ui token-coverage <file.html> [--tokens <f>] [--floor <n>] [--json]`** — scores every
  color, font-family, font-size, spacing (margin/padding/gap), radius and shadow declaration
  in a page's own CSS (inline `style=""`, `<style>` blocks, locally linked stylesheets) as
  `token` (a `var()` resolving to a project token, or a literal equal to a token's resolved
  value), `derived` (`calc()`/percentage/relative unit — legitimate, never counted as raw), or
  `raw`. Prints `coverage = token / (token + raw)` per category and overall; exits 1 below
  `--floor` (default 0.8). Token-declaration blocks (`:root`/`@theme`/`[data-theme]`/`.dark`)
  are excluded, same convention as `ds-usage-lint`. New core: `src/core/token-coverage*.ts`.
- **`ui gate`** now runs `token-coverage` as a required check whenever a project token file is
  auto-detected (the design-dir contract, then `brand/design/design.tokens.json`), default
  floor 0.8, configurable with `--token-coverage-floor`; the JSON envelope carries the numbers
  under `tokenCoverage`. Absent a token file, the check does not run — a declared "did not run",
  never a silent pass.
- Motivation: the owner rejected a gate-green build (set F, brief-first) for a "generic SaaS
  look, brand tokens barely visible" while approving a build that used them (set E). Calibrated
  on the six real acceptance sets in `plans/260926-2305-design-os-revamp/evidence/tg/coverage.md`:
  the default floor does **not** separate REJECTED set F (0.804) from APPROVED set C (0.835) —
  the only clean discriminator found was the `font-family` category (F: 0%, every other set:
  vacuous or non-zero) — and the floor **would** have flagged APPROVED set E (0.468, a Figma→code
  build with no canvas token access) as a false positive. Recorded honestly, not hidden.

## 2026-09-27 - persona decisions from the owner's blind review

### Changed
- **`knowledge/personas/families.json`** now carries the owner's blind-review decisions on the
  W6 persona candidates: `web-hairline-generous-neo-grotesque` and
  `web-quiet-light-single-accent-neo-grotesque` are merged into one family with an optional
  accent (`accent: "optional"`, merge recorded in a new `history[]` entry, Descript kept as a
  reference medoid); `ios-pill-control-high-contrast` is kept distinct with
  `owner_confirmed_by_eye: true`. Every family gains a `starting_tokens` DTCG block copied
  verbatim from its dossier with `provenance: "assumed"`, and the shared mapping rules are
  recorded once at the top level in `token_mapping_rules` (`provenance: "assumed"`).
  Three families gain a data-only `gate_policy`: `ios-geometric-high-contrast` exempts
  `cream-palette`, `ios-pill-control-high-contrast` exempts `border-accent-on-rounded`, and the
  hairline families (`web-hairline-generous-neo-grotesque`, `ios-hairline-neutral-neo-grotesque`)
  set `gpt-thin-border-wide-shadow` to `error`. No linter code changed.
- **`schemas/persona-families.schema.json`** extended for the new fields (`accent`,
  `owner_confirmed_by_eye`, `history`, `starting_tokens`, `gate_policy` per family;
  `token_mapping_rules` at the top level).
- **`src/core/judge-validate.ts`** now rejects a `gate_policy` entry naming a rule id that is not
  in the gate check catalog (`src/core/check-catalog.ts`), or an action other than `"error"` /
  `"exempt"`.

## 2026-09-27 - pattern cards with a schema and a linter

### Added
- **`schemas/pattern-card.schema.json`** — the two-layer pattern-card contract: core distributions
  shared by every archetype, a `components[]` breakdown with `kind`/`position` counts, evidence as
  `observed(mobbin:<id>)` only, and a `unreliable` list for low cross-check agreement.
- **`ui pattern lint <card.json|dir> [--json]`** — validates the schema, every share against `n`,
  unique evidence ids, the `n >= 8` floor (below it a card may only be `status: draft`), and rejects
  any image path or URL. A directory is searched recursively.
- **`knowledge/patterns/<platform>/<archetype>.json`** — 16 cards from Mobbin evidence: 14 web/iOS
  archetypes at n=8 (Flash `gemini-3.8-flash-medium` extraction, one image per call), the usage-dashboard
  card re-emitted from the earlier pilot at n=24, and a draft `ios/password-change` at n=6 (below the
  floor; only 6 screens of that flow existed in the sample). A 10-image cross-check on `gemini-3.1-pro-high`
  backs each card's `extraction.cross_check.agreement`.
- **`knowledge/pattern-cards.md`** — how to read a card (shares are counts over n, never a decision).

## 2026-09-27 - close the gaps the reruns exposed: seam-lint CI gate, single-caller detection, path resolution

### Fixed
- **`ui seam lint`'s bounded static analyzer no longer loses a prose read when only one caller
  remains.** A call argument reaching a read function through a bare member expression
  (`input.templatesRoot`, not a destructure or a call) fell through to `unknown` instead of being
  traced — invisible when several callers still contributed a literal path to the union, but a real
  detection-coverage regression once the others migrate away (see reports/dev-w3c.md finding 1).
  `resolveSeamPaths` now resolves `obj.prop` through the same property-threading it already has for
  destructuring and template-literal interpolation.
- **`design-os run --screens <dir>` and `--out <dir>`** now resolve a relative path against `--project`,
  never the conductor's process cwd — closing the exact trap the README's own invocation shape falls
  into (`cd design-os && design-os run ... --screens acceptance/...`).

### Added
- **`ui seam lint` runs in CI** via `tests/seam-lint-ci.test.ts`, a built-binary test asserting
  `new 0` and no stale allowlist entries over the repo's own `src/`; a coverage or ratchet regression
  now fails `npm test` instead of merging unnoticed.

## 2026-09-27 - template hashes read from the catalogue instead of hashed at runtime

### Changed
- **`ui init`'s manifest baseline and the codex adapter's embedded reference hash** now read the
  recorded `sourceSha256` from `schemas/template-descriptions.json` (via the new
  `readTemplateSourceHash`) instead of re-hashing the template file's bytes at runtime. Both values
  are identical for an unmodified install — the catalogue is generated from, and audited
  (`ui templates catalogue --check`) against, the same bytes that ship in the package.
- **`ui doctor`'s template-drift check keeps hashing live bytes** (`hashTemplateFile`, unchanged):
  it is the only remaining consumer that compares a recorded baseline against the template's
  CURRENT bytes on disk, so it must observe a hand-edited installed template even when the
  catalogue itself was never touched — see `evidence/w3a/proposals.md` §2's decision note.
- **`schemas/seam-allowlist.json`** drops the `src/adapters/templates.ts` entry: with only one
  caller left, `ui seam lint`'s bounded static analysis no longer traces the read to a template
  path (`reads 4 / allowed 4 / new 0`, down from 5). The runtime guarantee is unchanged and covered
  by tests; the seam-lint ratchet's coverage of that one call site is a known, disclosed gap.

## 2026-09-27 - follow-ups from the control plane run: silent BLOCKED, a skip code, a fuller index

### Fixed
- **`ui brief lint` no longer reports BLOCKED with zero questions.** When the D4 receipt is BLOCKED, every
  low-confidence assumption that no blocking field already asks about becomes one question naming the
  assumption and its current value. `L` and the decision are unchanged; a CONTINUE brief still emits none.

### Added
- **`blocked-intake` skip code** in `schemas/method-run.schema.json`; `design-os run` uses it for the steps a
  BLOCKED intake receipt stops, instead of `not-applicable` with a detail prefix. `ui method lint` accepts it.
- **`knowledge/index.json` lists JSON data files** directly under `knowledge/personas/` and
  `knowledge/patterns/` with `kind: data`; prose entries are unchanged.

## 2026-09-27 - a shadow judge: record what System One would pick, measure how often a human agrees

### Added
- **`ui judge record --out <judgments.jsonl> --event <json>`** — validates one judgment against
  `schemas/judgment.schema.json` and appends it. A judgment names a decision point (`art-direction`,
  `persona-family`, `layout-archetype`, `copy-language`), the candidates considered, the pick with at least
  one evidence ref (persona dossier slug, pattern card path, or ruling id `r-*`) and the kernel constraints
  that applied. `mode` is always `shadow`: the record is observed, never enforced. The human decision
  (`accepted | changed-to <x> | rejected`) arrives as a second line with the same id that repeats the
  pending judgment unchanged; nothing is rewritten.
- **`ui judge report <judgments.jsonl> [--families <families.json>] [--json]`** — agreement between the
  shadow pick and the human decision per decision point, with sample sizes and pending counts. Below
  n = 5 resolved judgments it prints `not enough data (n=<count>)` and no rate.
- **`knowledge/personas/families.json`** and `schemas/persona-families.schema.json` — the twelve persona
  families (six web, six iOS) as measured data only: slug, platform, apps, screens, medoid app, the three
  reliable distinguishing attributes with their share and platform-wide share, nearest family, Mobbin URLs.
  `corner_radius` and `weight_contrast` (Flash/Opus agreement below 60%) are named once in
  `unreliableAttributes` and omitted from every family. `ui judge report --families` validates the file and
  fails when a `persona-family` judgment names a family that is not in it.

## 2026-09-27 - a run control plane: `design-os run` drives one feature through the six steps

### Added
- **`design-os run <brief.json> --project <dir> --out <run-dir>`** — the Python conductor calls only the `ui`
  binary: `brief lint` (writes `questions.json`), `gate` on every `*.html` under `--screens`, `trace summarize`,
  `knowledge lint` on `ruling-candidates.json`, and `method lint` on the `run.json` it writes. Outputs `run.json`
  (`method-run/1`), `k1.json` (same top-level keys as the hand-made measurement sheet), `timeline.json` (per-step and
  per-call timestamps), `gates.json`. No model call, no network.
- **Stops on intake.** A `BLOCKED` D4 receipt ends the run after `define`: the later steps are `skipped` with a
  `blocked-intake` detail, the questions are printed and the exit code is 2. A red gate or a dirty candidates file
  exits 1. Figma parity and the approver decision are `NOT RUN`, never guessed.

## 2026-09-27 - a learning ledger contract, so recurrence can fire

### Added
- **`schemas/learning-event.schema.json`** — one event type set for learning: `gap | insight | retro | correction |
  ruling-candidate | approval`, each with `id`, `t`, `text`, `refs[]` (may name ruling ids `r-*`) and
  `source` (`observed | synthetic | assumed`). Telemetry kinds are out of scope and rejected.
- **`ui knowledge ledger lint <events.jsonl> [--json]`** — schema, duplicate ids, telemetry kinds, and a
  `correction` or `approval` without an `r-*` ref are errors (exit 1). Reads JSON Lines or an `{entries:[…]}`
  document; reports events, clean events and events without a ruling ref.
- **`ui knowledge ledger append <events.jsonl> --event <json>`** — validates one event and appends it as one line;
  never rewrites, refuses a duplicate id and refuses a JSON-document ledger.
- **`ui knowledge draft-ruling --ledger <events.jsonl>`** — also appends a `ruling-candidate` event naming the new
  ruling id (idempotent by id), so the recurrence path in `ui knowledge promote` has events to count.

### Changed
- **`ui knowledge promote`** counts a learning event toward recurrence through its `refs[]` only; free text that
  merely mentions a ruling id no longer counts. Older ledger shapes keep the whole-record match.

## 2026-09-27 - a fresh-machine install proof

### Added
- **`scripts/fresh-install-proof.sh`** — packs the checkout, installs the tarball into a throwaway npm prefix and
  cache under `$TMPDIR` (never the real global prefix, never a publish), then runs `ui doctor`, `ui init --all` in an
  empty project and `ui doctor --cwd`. Prints wall time per step and the total; the first failing step stops the run
  with its output and exit 1. `--tarball <file>` installs a given tarball instead (a tarball without `bin` fails at
  the `ui doctor (install)` step, not silently); `--keep` leaves the throwaway dirs for inspection.
- `tests/fresh-install-proof.test.ts` — argument handling always runs; the real run and the no-`bin` control run
  with `UI_FRESH_INSTALL=1` (they need the npm registry).
- `docs/team-review-door.md` gains an "Install check" paragraph with the verified run.

## 2026-09-27 - template descriptions move from prose to JSON

### Added
- **`ui templates catalogue [--out <file>] [--check]`** — the only code that parses
  template frontmatter; emits `schemas/template-descriptions.json` (path, description
  or explicit null, source SHA-256). `--check` writes nothing and exits 1 on schema
  violation or drift; `npm run build` now runs it, so CI catches a stale catalogue.
- **`ui templates lint [catalogue.json]`** — validates the catalogue against
  `schemas/template-descriptions.schema.json`, plus uniqueness, path order and
  registry coverage.

### Changed
- `readTemplateDescription` reads the catalogue instead of the template Markdown;
  every registered template returns the same description as before. A missing or
  unparseable catalogue now throws and names the regenerate command.
- `schemas/seam-allowlist.json`: the runtime read of template frontmatter is gone
  (kernel runtime prose reads 5 → 4); the emitter's authoring-time read is listed
  as its own entry, so `ui seam lint` reports reads 5 / allowed 5 / new 0.

## 2026-09-27 - the `design/` directory contract

### Added
- **`schemas/design-dir.schema.json`** and **`docs/design-directory.md`** — the canonical layout: one token
  source (`design/tokens.json`), soul, principles with a machine index, rulings as the only place supersession
  is recorded, art direction under `design/art-direction/`, logs and caches gitignored.
- **`ui design lint <project-root> [--json]`** — reports each deviation with a fix hint: extra token files
  (unless declared derived in `design/design-dir.json`), tracked logs and caches under `design/`, art direction
  outside `design/`, supersession outside rulings, a missing or stale principles index, and stale ingest
  (`DESIGN.md` or the registry more than 14 days older than `ds.json`). Exit 1 on any error; warnings are advisory.
- **`ui design principles-index <principles.md> --out <principles.json> [--check]`** — emits the index
  (`id`, `title`, `yields_when`, `test`) from the `### <ID> · <title>` headings; `--check` exits 1 on drift.

## 2026-09-27 - an intake contract: lint a brief, get the questions that block it

### Added
- **`ui brief lint <brief.json> [--questions <out.json>] [--json]`** — validates a design brief, applies the
  route rules (`web-app`, `dashboard` and `mobile-app` need `screens[]` with at least one state each, `roles[]`
  and `status`; landing keeps today's rules) and prints a receipt: **B** blocking fields, **R** whether any of
  them changes the route or is one-way, **L** low-confidence assumptions. `CONTINUE` when B <= 2, no R and
  L <= 3, otherwise `BLOCKED`. Exit 0 continue, 2 blocked, 1 schema error.
- **`questions.json`** — one question per blocking field, route-changing first, with a recommended default only
  where a rule can derive it (`copyLanguage` from the script of `rawRequest`, the four canonical screen states).
- **`ui brief questions <questions.json> --format claude|markdown`** — the AskUserQuestion payload (at most 4
  questions, recommended option first) or a gap sheet for teams that answer asynchronously.
- **Brief schema extensions** (`schemas/design-brief.schema.json`), all optional so every existing brief still
  validates: `surface` grows to `landing | web-app | dashboard | mobile-app | email | document`
  (`marketing-landing` stays valid), plus `screens[]`, `roles[]`, `status`, `copyLanguage`, `requestedBy`,
  `approvedBy[]`, and `label` on assumptions.
- **Status transitions are a question, not a schema error.** A `status` vocabulary with more than one state and no
  `transitions` becomes the blocking field `status.transitions` (counted in B, question "Which transitions exist
  between <states>?", no default) instead of failing validation, so the receipt is always produced.

## 2026-09-27 - the read trace measures a real run

### Fixed
- **`bytesBeforeFirstMutate` was 0 on a real run.** The hook counted any Bash `mkdir`/redirect as the
  first mutation, so an agent's own setup (`mkdir -p .design-os/trace`, `> /dev/null`) closed the
  window before it read a single design file. A Bash command now counts only when it writes inside
  the project tree, outside `.design-os/` and `node_modules/`: redirects and heredoc writes
  (`cat > file <<`), `tee`, `rm`/`mv`/`cp`/`touch`/`mkdir`/`chmod`, `sed -i`. Writes to `/dev/null`,
  `$TMPDIR` or any path outside the project, `npm install` and `git status` are not mutations. The
  `mutate` record now carries the target `path` (never the command text). Replaying the real
  acceptance-baseline trace now gives 20,118 bytes instead of 0.
- **Design context was invisible.** `brand/`, `.specify/` and `docs/` join `knowledge/`, `templates/`,
  `README.md` and `design/` as traced read prefixes; `DESIGN_OS_TRACE_PREFIXES` (comma-separated)
  adds more. `cat ~/…` and `$HOME/…` reads are now expanded instead of silently missed.
- **A checklist run behind a wrapper read as "not run".** A `gate` event is now recorded for
  `ui gate` / `slop-detect` run directly, or through `npm run <script>` / `node|bash <file>` whose
  script text runs one, and carries the matched `command`. `esDesignerChecklistRan` is true when a
  read of `es-designer/checklist.md` is followed by any gate event.

### Changed
- **`ui trace summarize` prints `firstMutation: {t, kind, path}`** so a reader can see what ended the
  window, and `unclassifiedMutations` counts legacy Bash `mutate` records that carry no target
  (traces written by the previous hook): they are reported, not counted, and do not end the window.

## 2026-09-27 - runtime prose read ratchet

### Added
- **`ui seam lint [--allowlist <file>] [--json]`** — scans kernel source for runtime
  Markdown reads under knowledge, templates, docs, and README; reports new reads
  and stale allowances as errors. `schemas/seam-allowlist.json` records existing
  reads with their data purpose and proposed JSON home. The static scan follows
  literal/joined paths, local bindings and named helpers; dynamically evaluated
  paths and external runtime inputs remain outside its resolution boundary.

## 2026-09-27 - a checkable six-step method run

### Added
- **`schemas/method-run.schema.json`** — one feature's frame, define, explore,
  decide, build, and verify steps, with skip reasons, artifact provenance,
  human questions, and optional school vocabulary.
- **`ui method lint <run.json> [--json]`** — validates the run and its referenced
  `brief.json`, blocks unreasoned skips and unanswered human needs on done
  decisions or verification, and prints a six-cell status line.
- **`docs/method-spine.md`** — how to record and check one method run.

## 2026-09-27 - rulings can be checked for freshness, promoted, and drafted from corrections

### Added
- **`ui knowledge fresh <rulings.json> [--root <dir>] [--days 90] [--as-of <date>] [--strict]`** — age since
  `verified_at` (or `since`) and liveness of repo-path source anchors for every live ruling; lists the STALE
  ones and prints `fresh N / stale M / unanchored K`. `--strict` exits 1 when anything is stale.
- **`ui knowledge promote <rulings.json> --ledger <events.jsonl> --out <dir>`** — the single-project promotion
  gate. A live ruling becomes a candidate when at least `--min-recurrence` (default 3) ledger events mention its
  id or one of its `principle[]`, or when it is backed by at least `--min-sources` (default 2) distinct source
  documents. Writes `candidates.json` (`schemas/ruling-candidates.schema.json`) and `candidates.md`, both scrubbed
  of hostnames, URLs, emails, absolute paths, Figma file keys, project names and people (`--redact`,
  `--redact-people` add names the rulings do not reveal). A ledger with no recurrence yields zero candidates, exit 0.
- **`ui knowledge draft-ruling --from <correction.json> --out <rulings-draft.json>`** — turns an approver
  correction `{screen, what_was_wrong, what_is_right, evidence[]}` into a `status: draft`, `approved_by: []`
  ruling stub that validates against the rulings schema.

### Changed
- **`status` accepts `draft`** in `schemas/rulings.schema.json` and `ui knowledge lint`; draft rulings are never
  promoted and are not assessed for freshness.

## 2026-09-27 - keep built code and Figma frames in step from the kernel

### Added
- **`ui ksync pin <route> --file <key> --node <id>`** — records which Figma frame a built route was built
  against in `design/ksync/pins.json` (`schemas/ksync-pins.schema.json`). Idempotent upsert keyed by
  frame, sorted output, stamps `pinnedAt` and `builtFrom` (git HEAD). Re-pinning is how a drift is accepted.
- **`ui ksync census <manifest.json> --pins <pins.json>`** — counts route-manifest entries as
  built / placeholder / orphan / parked, the share of built entries whose frame is pinned, a per-app
  table, and (with `--registry`) how many registry components carry `figmaNode`. Labels are read from the
  manifest or a `--labels` file, never guessed; entries with no label print as `unlabeled`.
- **`ui ksync drift --pins <pins.json> --frames <frames.json>`** — compares each pin with a frame snapshot
  the host captured: `DRIFT` (frame changed after the pin — spec hash, else `lastModified`), `MISSING`,
  `UNCHECKABLE`, and `STALE-INGEST` when the snapshot is older than `--max-age-days` (default 14), which turns
  the whole verdict red even if nothing else changed. Exit 1 unless `--warn-only`. The kernel reads captured
  files; it never calls Figma.

## 2026-09-27 - temporary native mobile proof fixtures are cleaned up

### Fixed
- Native mobile proof test fixtures now remove their temporary proof trees after each test.

## 2026-09-26 - the learning loop is measured by flow, and the agent's read trace becomes a number

### Changed
- **`design-os evolution` no longer reads a loop as ALIVE just because it once learned.** The
  verdict had no time window: VSF-PCP held four insights, a ratified soul and a wired
  heartbeat, so it read ALIVE while its heartbeat had last fired in July and no gap had ever
  graduated. A project with a learning signal is now ALIVE only while all three hold: at least
  one graduation in the last 30 days, a median open-gap age under 30 days, and at least one
  `gap`/`retro` event in the last 7 days; otherwise it reads DEAD-LOOP. WIRED and NO-LOOP are
  unchanged. The text output prints the three numbers, each with its window's verdict, and
  `--json` carries them under `clock`.
- **A graduation is an existing event, not a new one.** It is an `insight` whose `refs` name a
  `gap` id — the librarian's own close-out convention (a gap stays open until an insight lists
  its id). No ledger event type or schema field was added.
- **`gather_signals` and `compute_verdict` take `now`.** The core still never reads the clock;
  the command passes it in, so every test pins the date.

### Added
- **`ui trace summarize <dir> [--session <id>] [--json]`** reads `.design-os/trace/reads.jsonl`
  and reports how many bytes and which files an agent loaded before its first mutation,
  whether `README.md` and `knowledge/index.json` were opened, whether the `es-designer` skill was
  loaded, and — separately — whether its checklist actually ran (checklist read, then a gate
  after it). Coverage is `claude-only` when a trace exists and `none` otherwise.
- **`templates/hooks/design-os-read-trace.cjs`**, a Claude PreToolUse/PostToolUse hook that
  appends the trace: paths, byte counts and event kinds only — never contents, prompts or
  command text, never `.env*`. It is append-only, silent and exits 0 on every path.
  A redirect into `/dev/null` is not counted as a mutation, and `readmeOpened` is true only for the
  repository root `README.md`, not a nested one.

## 2026-09-26 - a team door for reviewed rulings, and a clearer install path

### Added
- **`approved_by[]` on rulings** — the approval trail (`role`: PM | design-lead | BA | owner | source, `person`, `at`)
  is part of `schemas/rulings.schema.json` (see the rulings-contract entry below). All 314 rulings in a
  real project ledger conform.
- **`docs/team-review-door.md`** — the approval matrix, the CODEOWNERS pattern a project adds on
  `design/`, and how `approved_by` is filled.

### Changed
- **README install path** — `npm i -g ease-design` + `ui init` is the way to use DESIGN:OS on a
  project. The clone + `./setup.sh` studio build is documented as maintainer-only under
  "Contributing / full studio".

## 2026-09-26 - a rulings contract you can lint and render

### Added
- **`schemas/rulings.schema.json`** — the contract for curated design rulings: required
  `id, category, text, scope, source[], since, verified_by`; optional `status`
  (`active|superseded|retired`), `verified_at`, `approved_by[]` (role, person, date),
  `principle[]`, `supersedes[]`, `superseded_by`, `scope.screens[]`. `scope` accepts
  `"global"` and the `{apps, features}` shape real projects already use.
- **`ui knowledge lint <rulings.json> [--root <dir>] [--json]`** — schema validation, dead
  source-anchor check (repo-path `source[]` entries must exist under `--root`), duplicate and
  dangling ruling ids, and a warning when a ruling's text says `SUPERSEDED` but it has no
  `superseded_by`. Exits 1 on errors. Deterministic, no network.
- **`ui knowledge render <rulings.json> --out <dir> [--lang en,vi]`** — writes
  `rulings.<lang>.md` grouped by category then id. English is the only source of truth; `vi`
  translates the fixed headings and labels only, never the ruling text.

## 2026-09-05 - a failure that names the file, and tests that can see the message

### Fixed
- **Every product-context error message was byte-identical to its own code.** Compiling
  twelve receipts with one malformed file printed `BAD_PRODUCT_CONTEXT` and nothing else —
  not which file, not which layer refused it — while `BAD_PRODUCT_ATLAS` covered bad bytes,
  a bad shape and a failed replay with one undifferentiated string. Messages now name the
  file, the ceiling that was passed, and which of the causes fired. The sibling `flow` and
  `prompt-plan` commands have named the file since they were written; this one had diverged.
- **Receipts are decoded one file at a time.** A single `map()` over the whole set collapsed
  every malformed input into the same anonymous throw, so a bad seventh receipt among twelve
  was indistinguishable from a bad first one.
- **Argument errors say what is wrong** — `expects at least 1 positional argument(s), got 0`,
  `--json takes no value`, `repeated flag: --json` — instead of `invalid arguments`, and the
  human channel no longer prints the command name twice.
- **A non-canonical atlas is no longer blamed on its receipts.** `lint` and `project-flow`
  raised one error for two defects, so a pretty-printed or hand-edited file — whose receipts
  replay perfectly — was reported as a replay mismatch. That is a wrong cause, which sends the
  operator to audit receipts when the repair is to re-emit the file. The two causes are now
  told apart and named; the public code stays `BAD_PRODUCT_ATLAS`.

### Changed
- **The text channel escapes the message; the machine channel does not.** A newline inside a
  path could otherwise forge a line that reads as the engine speaking, so stderr now gets a
  copy through `forTerminal` while the JSON envelope keeps the raw string an agent parses.
  Stderr also keeps printing the error code — it used to BE the message there, and the help
  text advertises that vocabulary, so dropping it would have removed information nothing else
  on that channel carries.
- **Message shaping moved to its own module.** Reading bytes and deciding what to tell the
  operator are different jobs, and only the second one grew. Dropping the `message = code`
  default made the compiler enumerate every call site that had nothing to say.

### Added
- **Assertions that can see a message at all.** All twelve error assertions were
  `message: expect.any(String)` — green whether the message was useful, meaningless, or
  leaking an absolute path. They now refuse a bare code, and a new suite pins a
  distinguishing substring per code, including which of twelve files failed and the split
  between the raw JSON value and its escaped terminal copy. Each of the seven behaviours
  those cases depend on was deliberately broken and confirmed red.

Public error codes and exit codes are unchanged.

## 2026-09-04 - product truth as evidence, not one inline object

### Added
- **`ui product-context` — compile, replay-lint, project.** Lifecycle-aware capture receipts
  compile into a canonical `product-atlas` v1 that embeds every normalized receipt and its
  digest. Resolution has no order winner: equal active values coalesce, distinct active values
  conflict with a `null` value and no candidate chosen, and a field with no candidate stays
  `unresolved` rather than being inferred `missing`. Atlas bytes depend only on validated
  receipt semantics — never on argv order, a requested projection, the source path, or the clock.
- **Two public schemas**, `product-context-receipt` and `product-atlas`, both v1 and
  version-pinned: a later change gets a new version rather than reinterpreting these.
- **`project-flow` as a separate artifact.** It replays the Atlas, then returns a Flow projection
  that never enters the Atlas and always reports `truthStatus: "not-evaluated"`. Requesting a
  projection cannot change the Atlas it was read from.
- **Exact byte ceilings, refused before `JSON.parse`.** 131,072 per receipt, 524,288 across
  compile inputs, 2,097,152 for an Atlas in or out — each with its own error code, each accepting
  its exact maximum and rejecting maximum-plus-one. Output is measured before emission, so every
  Atlas that ships fits the consumer ceiling. The reader allocates one `limit + 1` buffer and
  loops descriptor reads through partial reads and growth after `fstat`.
- **A built-binary proof read through a real pipe.** The canonical Atlas leaves through the
  entrypoint's stdout, so a source-level test can never see truncation: four spawned cases at a
  fixed 4 MiB `maxBuffer` cover a 263 KiB clean Atlas at exit 0, the conflict Atlas at exit 1
  with an empty stderr, byte-identical buffers under reversed receipt argv, and a projection that
  leaves the Atlas bytes untouched. They do not skip when the binary is absent — build precedes
  test in CI, so a missing binary is a broken prerequisite, not a green run. Each of the five
  product behaviours they depend on was deliberately broken and confirmed red.

### Changed
- **Replay is documented as self-consistency, not history.** `lint` recompiles the embedded
  receipts and byte-compares the whole derived artifact, so an isolated mutation fails. A
  coordinated rewrite is a new valid Atlas with a different external `atlasDigest`; only comparing
  that digest against a trusted one detects substitution. README and `CONTEXT.md` say this
  explicitly, and `CONTEXT.md` rejects the synonyms that would read the Atlas as authority.
- README command counts are measured, never copied between surfaces: **47** for the current
  kernel from the built binary's own schema keys, **46** for the binary `npm i -g` installs
  and **42** for `v0.3.0`, each counted from that tag's own command registrations. The
  command table now lists all 47 — `tell-lint` had no row, so the header and the table had
  disagreed. Prompt plans keep their inline `productTruth`; that contract, the Flow
  command and the Flow schema are unchanged.

## 2026-09-01 - the gate emits what its coverage report claims

### Fixed
- **`ui gate` runs `low-contrast`.** It is COMPUTED — it needs a resolved background —
  so it comes off the fact pass, and the a11y family was composed from `lintA11y`
  alone. This was the last of six catalog rows `gate coverage` reported active and the
  gate could never emit. Measured across 747 real pages before wiring it: 52 pass the
  gate today and exactly **one** newly fails — white on a brand pink at 3.52:1 against
  the 4.5:1 AA floor, which is a true positive and the reason to do it.

### Added
- **A `PARTIAL` channel, separate from `skipped`.** A family nobody ran and a family
  that ran half-blind are different things. 342 of those 747 pages carry at least one
  background the cascade cannot resolve, and a clean a11y verdict printed over them is
  the zero-from-a-half-read-run this repo refuses everywhere else.
- **A guard for the whole class.** The catalog pairing test compares rows against ids
  in the SOURCES, so a check that exists, is registered and is never reached passes it
  cleanly — all six dead rows did. Reachability now has its own probe: one artifact
  built to trip every ride-along producer, run through the real gate, each finding
  demanded back under its own family.

## 2026-08-31 - a prompt in the title, and the half of a family the gate never ran

### Added
- **`prompt-leak-metadata`** — a generation brief shipped in the page's `<title>` is
  scaffolding, not a habit, so it is severity `error` in the `content` family rather
  than another advisory tell. Two real pages carry an ~8,900-character title that is
  the brief itself, naming an internal path, on the surface the browser tab, the
  search result and the social card all read. The threshold carries no judgement:
  across 699 real titles the median is 43, the longest legitimate one is 120, and
  **nothing falls between 120 and 1000**. Length only — matching one generator's
  phrasing would overfit, and the audience of a shared linter is every generator that
  makes this mistake. (#262)

### Fixed
- **`ui gate` runs both halves of the content family.** It composed that family from
  the twelve regex checks alone, so the four voice tells and the new check reached it
  through nothing at all — while `gate coverage` reported the family fully active.
  Six catalog rows were unreachable-but-reported-active. The gate now runs one
  memoised fact pass that both `tell` and `content` read from. (#274 tracks the sixth
  row, `low-contrast`, whose fix changes what the gate FAILS on and needs its own
  measurement.)
- **Content findings survive a non-HTML reader.** `lintFileByExtractor` returned them
  for HTML and discarded them silently everywhere else, while the catalog promises
  those rules read Swift and Dart too. A SwiftUI file with three voice findings
  returned none.
- **`ui content-lint` advertises 12 checks, which is what it runs** — it said 17. The
  contract test that forced that number was itself comparing a *command's* count to a
  *family* total; those coincide only where a command runs its whole family, and
  content is the one place it does not.

## 2026-08-31 - the tell family stops lying in seven specific ways

Seven open defects in `ui tell-lint` closed. The interesting part is not the count: **two
of the seven were misdiagnosed** in their own issue, a third was one layer deeper than
reported, and an independent review then found four more defects in the fixes themselves.
Each fix landed with a red-before-green probe, and every predicate change was measured
across 747 real pages before it shipped.

### Fixed
- **A `<title>` is metadata, not prose.** One page's title held a 9,334-character leaked
  generation prompt, read as body copy: it produced a `line-length` finding and spent an
  em dash against the page's visible word budget. `TextRole` gains `metadata`, scoped by
  POSITION (inside `<head>`) rather than by tag name — an `<svg><title>` is an accessible
  name and stays copy. The fact is still emitted and still counted by the census. (#252, #255)
- **`marquee` fires only when something readable is moving.** It promised "auto-scrolling
  content the reader cannot pause" and matched any long infinite animation, including a
  1px decorative scanline in an empty div. It now refutes itself when the animated node's
  subtree provably carries no text, image, SVG, video or canvas. (#253)
- **Tailwind `uppercase` reaches the rule that exempts it — and the cause was one layer
  down.** `wide-tracking` already forgave small all-caps; the resolver dropped the token,
  and even once it did not, the JSX extractor emitted one typography fact PER UTILITY, so
  no rule correlating two typography properties on one element could work. It now emits
  one fact per element, as the HTML extractor always has. `tight-leading` was blind the
  same way and is fixed by the same change. (#254)
- **A two-file `--render` run blames the right page.** Rendered findings were folded into
  the first file's record. (#237)
- **Identical facts collapse before any rule sees them.** Duplicated facts changed what
  rules that print a fact COUNT reported. Fixed at the sink rather than in either rule. (#238)
- **The unresolved-stylesheet caveat says what the sheet could have hidden.** A font CDN
  can cost a family name; it cannot hide a layout. Classified by HOST, never by URL shape —
  and `use.fontawesome.com` is not on that list, because its `all.css` ships `border`,
  `padding`, `float` and an infinite `animation`. Of 401 pages carrying an unresolved
  sheet, 337 narrow and 64 stay strict. (#238)
- **Artifact text can no longer forge engine output.** Stylesheet hrefs are author-written
  and were printed verbatim; a newline in one manufactured a line that read as the engine
  speaking, and an ESC sequence repainted the terminal.

### Changed
- **Metamorphic law L3 compares finding SETS**, not a count ceiling — the old form caught
  duplication multiplying a finding and missed duplication removing one. (#238)
- **The mutation audit runs against the field corpus** and prints two numbers instead of
  one: **60.74%** from fixtures alone and **74.16%** with the corpus — +13.42 points, and
  38 mutants that no fixture ever reached. (#236)

### Corpus
Five pinned `fp-open` rows resolved: four to `fp` (now regression tripwires) and one
re-adjudicated `tp` after measurement rejected the alternative fix.

## 2026-08-30 - ease-design 0.6.0

The polyglot release. Ten weeks of work reaches npm: design:os can now read an app in
any language its registry knows, judge it against rules written once, and it carries the
instruments that keep those judgements honest.

### Added
- **`ui tell-lint`** — 43 design-tell rules over 8 extractors (HTML cascade, JSX/Tailwind,
  Vue/Svelte SFC, bare CSS, SwiftUI, Flutter, Figma nodes, a rendered CDP tier). One
  DesignFacts IR, N readers, no rule edited per language.
- **`tell` joins `ui gate`** as a sixth family, so one call still gives one verdict.
- **Native execution arms** for macOS, iOS and iPadOS, each with its own craft knowledge
  and evidence contract.
- **A capability-activation boundary** that fails closed on an unsupported surface rather
  than routing it anyway.
- **The honesty instruments**: a field corpus of real pages with adjudicated verdicts, a
  fact census so `0 findings` can be read as clean-or-blind, every rule threshold in one
  table pinned by an executable boundary pair, three metamorphic laws, and a nightly
  mutation audit.

### Fixed
- stdout no longer truncates at 64KB when piped (#209).
- `tight-leading` no longer reports `clamp()` display headlines as 16px body copy.
- A page whose stylesheets all fail to load is reported UNDERCOUNT instead of clean.
- `ui gate --help` listed five families while the gate ran six; the list is now derived
  from `GATE_FAMILIES` and a test fails on drift in either direction.

### Note for 0.5.0 users
`ui gate` gained a family, and three tell rules carry `error` severity. A project that
passed the gate on 0.5.0 can fail on 0.6.0 — that is the point of the new family, not a
regression. Most tell findings are advisory and never affect the exit code.

## 2026-08-29 - TocChien becomes the retained iOS proof

### Changed
- The public [native mobile proof](showcase/native-mobile-proof-pilot/proof-board.html) now centers
  on the three-screen TocChien iOS evidence, including the [accepted light catalogue
  capture](showcase/native-mobile-proof-pilot/evidence/screenshots/native-ios-tocchien-iphone-17e-champion-catalog-light-large.png).
  It records 16 controller-replayed iOS simulator tests and 12 iPadOS simulator tests (28 total);
  paired iOS light/dark captures, independent visual review, and owner acceptance are bound to
  exact source and capture hashes.
- The proof remains **PROVISIONAL**: iOS Tier 2 stays unqualified because the final paths have
  mixed Terra/Sol authorship without an immutable intermediate checkpoint; iPadOS visual review
  and owner acceptance remain pending. It makes no physical-device, live assistive-technology,
  release-qualification, assurance-upgrade, or qualified-delivery claim.

## 2026-08-28 - the rules are now kept honest by measurement, not by memory

### Added
- **A field corpus with adjudicated verdicts** (`tests/field-corpus/`). Real pages,
  pinned, where every finding carries a recorded `tp`/`fp` verdict and a written
  reason. A fix that silences an adjudicated true positive turns the suite red,
  naming the finding and quoting the reason someone wrote when they judged it
  real — the guard that two over-widened fixes had needed. A finding nobody has
  judged fails as `unadjudicated`, printing a paste-ready row.
  Motivation, measured: **8 of 8 substantive defects on this branch came from
  real data and 0 from the 4,000-test fixture suite.** A fixture states the rule
  author's model of the world, so it catches drift away from that model and
  structurally never an error inside it.
- **A third verdict state, `fp-open`** — a false positive that is known, reasoned
  and not yet fixed. The runner asserts it still fires and counts it, so the
  **live false-positive rate is printed on every run** rather than left to drift.
  An FP rate nobody measures is one that climbs until readers start ignoring the
  gate, at which point it has stopped being a gate.
- **A fact census in the envelope.** Per-kind fact counts and the elements they
  came from, printed in human output whenever a file yields no findings — which
  is exactly when a reader needs to know whether the page is clean or the reader
  was blind. The two are otherwise indistinguishable.
- **`TELL_THRESHOLDS`** — every number that decides a verdict in one table, with
  its owner and its provenance, each pinned by an *executable* boundary pair: a
  value at the threshold that must stay silent and one past it that must fire.
  A constant with neither a pair nor a stated reason fails the meta-test.
- **Three metamorphic laws** over the rule engine: an unrelated fact changes
  nothing, fact order changes nothing, and a duplicated fact never doubles a
  finding — the last making the 54-findings-from-210-duplicate-facts defect
  impossible by construction rather than by example.
- **A near-miss fixture class.** A rule's definition of done now includes the
  *tempting adjacent case that must stay silent*, with six worked examples that
  are each a defect that shipped: a pill for `cramped-padding`, the system font
  stack for `overused-font`, `card-title` for `nested-cards`, a video poster for
  `documentBg`, a `clamp()` headline for `tight-leading`, a nav CTA for
  `hero-eyebrow-chip`.
- **A nightly mutation audit** (`npm run audit:mutation`), scoped to rule
  predicates, run on a schedule and on demand but **never on a pull request**.
  It automates the red-probe discipline that failed 13 times out of 63 by hand.
  Baseline for trending: 62.91%, 731 mutants killed, 418 survived.

### Fixed
- **`tight-leading` reported display headlines as body copy.** It read
  `(t.sizePx ?? 16) <= 20`, substituting 16 for an unresolvable `clamp()` size and
  then asserting the result was body copy — so a `clamp(58px, 6.4vw, 94px)`
  headline was reported as *"line-height 0.93 on 16px body copy"*. Three false
  positives from one silent substitution, found by the first page ever
  adjudicated. The sibling rules already chose defaults that cannot fire
  (`sizePx ?? 99`, `durationMs ?? 9999`); the fix restores that idiom.
- **A page whose stylesheets all failed to load reported a confident clean read.**
  `extractHtml` had always returned `unresolvedSheets` and no caller had ever read
  it, so `undercount` stayed false. An unresolved stylesheet now marks the run
  UNDERCOUNT and the sheets are named, not merely counted.

### Changed
- The three extractor-dispatch branches in `ui tell-lint` move to
  `src/core/lint-file-by-extractor.ts`, shared with the corpus runner. A second
  copy would have been worse than duplication: the corpus would have judged a
  pipeline that had drifted from the one users run.
- Corpus pages and snapshots are excluded from `tsc` and `eslint`, extending the
  convention already written for `tests/fixtures` — evidence is not source.

## 2026-08-26 - design:os reads your app, whatever it is written in

### Added
- **`ui tell-lint <file|dir|glob>`** — a new `tell` gate family: 43 checks for
  *design tells*, involuntary machine-detectable signs that a surface was made
  without design judgment. Most are advisory: a tell prints, it never fails a
  build. `knowledge/design-tells.md` is the standard; `docs/tell-lint.md` is the
  command reference.
- **One DesignFacts IR, N language extractors, rules written once.** Rules bound
  to CSS syntax can never leave the web; bound to design *facts* the same 36
  judge HTML, JSX/TSX, Vue, Svelte, Astro, bare CSS, SwiftUI and Flutter. Adding
  a platform is one ~150-line extractor and two fixtures — no rule is edited.
  See `docs/extractor-authoring.md`.
- **Every linter now takes a file, a directory or a glob.** Until now they took
  exactly one `.html` file, so a React app could not be linted and a SwiftUI app
  was invisible.
- **A resolved CSS cascade.** Real selector matching, specificity, `var()`
  resolution, shorthand expansion, and linked *local* stylesheets read from the
  same filesystem the linter already reads. Remote sheets stay declared-unresolved.
- **WCAG contrast on a rendered surface.** `ui a11y-lint` used to print "0 static
  findings … rendered criteria need a browser". It now computes the real ratio
  against the nearest opaque ancestor background, and REFUSES — reporting a
  partial run — where the answer would be a fiction: a gradient background, a
  translucent veil, or a literal-tier extractor.
- **A third severity, `advisory`.** Detected, listed, excluded from the failure
  count. The exit code keeps its exact previous meaning.
- **In-file waivers with a mandatory reason** (`design-os-disable`, `-line`,
  `-next-line`) in HTML, CSS and JS comment syntaxes. Every waived finding is
  counted in the output.
- **A rendered tier with zero dependencies.** `ui tell-lint --render` drives a
  Chrome, Chromium or Edge *already installed on the machine* over a stdlib-only
  CDP client — no download, no npm browser dependency. It unlocks the seven rules
  static analysis provably cannot reach, chief among them
  `content-hidden-at-rest`: copy still at `opacity: 0` after the page settles,
  which ships a blank screen. Findings are stated under their engine.
- **`ui tell-lint --coverage`** — the rule x extractor matrix, naming for every
  combination either that it runs or exactly which facts are missing.

### Changed
- **design:os no longer ships zero runtime dependencies.** A deliberate reversal,
  ratified 2026-08-26: `htmlparser2`, `css-tree`, `css-select`, `domutils`. The
  guard was narrowed rather than removed — `tests/approved-runtime-deps.ts` names
  the four, and a fifth still turns the suite red. Determinism, no-network and
  no-LLM are unchanged.
- The build now bundles those four into the binary. tsup externalises
  dependencies by default, which had silently made `dist/` non-relocatable.
- `ai-cliche-gradient` is superseded by `ai-color-palette`; the old id remains an
  alias for one release.
- `CHECK_CATALOG.requires` accepts a fact-kind set alongside the original
  `"none"` / `"tokens"`. All 89 pre-existing rows are untouched. The catalog is
  now 137 rows: layout 20, a11y 14, taste 34, tell 43, content 16, autofix 10.

### Fixed
- A rule needing facts its extractor cannot supply is reported NOT-EVALUATED,
  never passed. That contract is enforced by construction: a rule landing in
  neither bucket throws rather than reading as one fewer finding.


## 2026-08-20 - stdout survives the pipe (#209)

### Fixed
- The `ui` entrypoint no longer calls `process.exit()` — it sets `process.exitCode`
  and lets the event loop drain stdout, so output larger than the 64KB pipe buffer
  (`ui schema --json` is ~87KB) arrives complete through a pipe instead of being
  silently truncated at exactly 65536 bytes with exit 0. Found by the 0.5.0
  delivery smoke; fixed at the single shared exit site, so every command is
  covered at once. Regression test pipes the BUILT binary — a file redirect can
  never catch this class.

## 2026-08-20 - ease-design 0.5.0

The native-expert release: a stated need is now enough. `knowledge/need-routing.md`
ships the need→verb decision procedure (ordered gates over all 19 workflow verbs, three
sanctioned asks, the composition rule, the decision-vs-construction tie-break), kept
honest by the two-way parity gate in `ui knowledge check` — a new capability cannot
merge until the routing knowledge teaches it. Generated agents point instead of
enumerating (per-role command allowlist, born-red on real drift) and carry the absolute
knowledge anchor so routing expertise resolves in consumer projects. `ui init
--with-agents` exercises the roster opt-in in one run, fully pre-flighted. The doctrine
is MEASURED: an 84-prompt blind benchmark (authored from frontmatter only, graded by
the committed `eval/routing-grader.mjs`) caught two routing bugs and three label
defects on its way to a fully clean board — verb 100%, must-ask 100%, selection-route
100%, composite 100%, 0 taste interrogations. Published surfaces carry no confidential
project names (one leftover example slug cleaned this release).

## 2026-08-20 - Canvas-cell adjudication: the routing board reaches 83/83

### Fixed
- The benchmark's three remaining misses were adjudicated and fixed at their real
  sources. v29/s02 (design vs generate): the routing tree was right — HTML is the
  ratified default surface unless Figma is explicitly named — but `design.md`'s
  frontmatter trigger clauses had dropped the canvas condition, misleading anyone
  routing from frontmatter alone; the frontmatter now carries it. Labels relabeled
  design→generate with loud per-prompt provenance in `eval/routing-prompts.json`.
  v32 (design vs to-figma): G2 gained the decision-vs-construction tie-break (still
  deciding WHAT → `design`; formed intent to construct idiomatically → `to-figma`);
  the to-figma label stood.
- Re-measured on the affected cells plus collateral guards (9 prompts, blind router):
  9/9, no collateral flips. **Final merged board: 83/83 — verb 100%, must-ask 100%,
  selection-route 100%, composite 100%, 0 taste interrogations** (single router tier,
  one sample per prompt; 58 prompts carry run-1 decisions). Decomposed honestly: of
  the +3, only v32 was MOVED by a doctrine change (the router flipped after the
  tie-break landed); v29/s02 are label corrections — the router's answer was already
  `generate` before and after. The frontmatter repair is validated on the author path
  (a fresh frontmatter-only author labels those needs `generate`), not by the router
  re-run, which never reads frontmatter.
- The tie-break's discriminator is formed-ness of intent, NOT construction tooling —
  variables/auto-layout are what `design` produces too, so naming them proves nothing.
  Added `v58` to the corpus: a design-labeled canvas need that NAMES the tooling,
  so the tie-break can go red if tooling words ever creep back in as the line
  (corpus is 84 prompts from here on; runs 1–3 measured the original 83).
- Workflow-template change (`design.md` frontmatter) — propagates to existing
  projects via `ui init --force`; `ui doctor` flags the drift with the same remedy.

## 2026-08-20 - `ui init --with-agents`: opt-in roster at init time

### Added
- `ui init --with-agents` runs `ui agents init` in the same invocation, once the adapter
  tree is installed. Strictly opt-in per the ratified roster decision — nothing changes
  without the flag. Requires the claude runtime (agents are Claude Code subagents) and an
  existing project DS: without `design/ds.manifest.json` the whole init pre-flights to
  `DS_NOT_FOUND` before any file is written, teaching the order (`ui ds init` / `/ui:learn`
  first). Agent generation runs through the agents command's own seam, so EXISTS
  pre-flight, rollback, and stamping stay one implementation; failures after the adapter
  write are reported honestly (`EXISTS` → re-run with `--force`).
## 2026-08-20 - Routing-accuracy benchmark: the routing doctrine gets measured, and loses twice

### Added
- `eval/routing-prompts.json` — 83 English need-prompts (3 per verb × 19, 12 must-ask,
  6 selection-route, 8 composites) authored by a context-clean agent that saw ONLY the
  workflow frontmatter — never the routing tree — so expected routes cannot be
  tautological with the tree's wording. Rerun contract: `docs/routing-benchmark.md`
  (manual, never CI; blind batched routers + deterministic grading).
- First run (blind sonnet routers): verb top-1 **96%** (target ≥85), composites **8/8**,
  **0** taste interrogations — but must-ask **58%**, exposing two real doctrine bugs.

### Fixed
- The composite-split law swallowed ask #3 (4/4 ambiguous-reference prompts routed
  capture→generate without asking) — the split law now fires the replicate-vs-inspired
  question BEFORE the capture leg. Same defect class as the stage-4 R1 finding: an
  exception written outside the gate that swallows it never runs.
- An audit aimed at a product area that pins none of the four surfaces read as a Figma
  `audit` — G2's ask-1 clause now owns that shape.
- Doctrine examples had quoted two benchmark prompts verbatim (self-fulfilling cells) —
  paraphrased off-corpus, and the rerun contract now mandates grepping any new doctrine
  example against the corpus.
- Post-fix re-measure of the FULL reference path (16 prompts: all 8 composites, all 4
  ask-3, the audit ask, the 3 from-url) on the decontaminated doctrine, graded by the
  committed `eval/routing-grader.mjs`: 16/16 — no composite regression. Merged post-fix
  figures over all 83: verb 96%, **must-ask 100%**, composite 100%, 0 taste
  interrogations; the only remaining misses are the 3 design/generate/to-figma
  adjudication items. Caveats: one router tier, one sample per prompt; the 67
  non-reference-path prompts carry run-1 decisions.

## 2026-08-20 - Native-expert agents: need-routing knowledge + the untaught-feature gate

### Added
- `knowledge/need-routing.md` — the ONE authored home of the need→verb decision
  procedure: four ordered gates covering all 19 workflow verbs, three sanctioned asks
  (bare "audit", keep-or-throw direction, ambiguous reference), the composition rule
  ("dashboard giống trang X" = capture then generate — a sequence, never one leaf), and
  the two invariant laws: verb ambiguity costs ONE question, taste ambiguity costs ZERO
  questions (it costs variants); never guess an invocation — read `ui schema --json`.
- The owner's ship-gate corollary, mechanized twice over:
  `routing-unknown-verb` / `routing-verb-uncovered` in `ui knowledge check` keep the
  anchored route table in exact two-way parity with WORKFLOW_VERBS — a new capability
  cannot merge until the routing knowledge teaches it (parser reads ONLY the anchored
  table, so prose mentions never count as coverage — the grep-tautology scar applied).
  And a per-role command ALLOWLIST guards `templates/agents/*`: agent templates point,
  never enumerate — an existence check provably misses the drift class actually found
  (the designer teaching the live-but-superseded four-linter quartet), so the allowlist
  is what goes red. That test was BORN RED on the real drift, then the templates were
  fixed.

### Changed
- Agent templates (designer/curator/figma-hand) gain the routing pointer block and two
  runtime-read sources (`ui schema --json`, `ui gate coverage`); the designer's handback
  gate is now `ui gate` (was the superseded four-linter quartet). Existing rosters go
  hash-stale by design — regenerate with `ui agents init --force`.
- Generated agents now carry the knowledge anchor: `ui agents init` resolves bare
  `knowledge/…` references to the package's absolute knowledge root (the same
  `buildKnowledgeAnchor` the slash-command wrappers use — one definition, two
  consumers), so routing expertise resolves outside this repo too.
- Routing coverage counts ONLY the route column of the anchored table (a backticked
  verb in the need column is prose, not a route) and ignores fenced examples; the
  gates split composite needs before walking, an existing artifact aimed at a
  reference captures then continues at G4 (`redesign`/`refine`/`iterate`), and the
  bare-"audit" ask is owned by G2 explicitly (stage-4 review findings R1–R4).
- Roster stays opt-in per the ratified §4; the host session is already the native
  expert via knowledge + adapters for projects that never run `agents init`.


## 2026-08-19 - ease-design 0.4.0

One day, ten merged PRs, one thesis proven: the tractability frontier is movable.
Everything below ships in this release — 14 new machine floors across four linter
families, four autofix floor repairs, the composed judge `ui gate` (+ its 89-check
coverage registry), FloorFinding schema v1 with declared repair scopes, four
tractability telemetry event types, and a measured −65% error-at-birth improvement
from teaching the floors at generation time (evaluation-260819-2016).


## 2026-08-19 - font-display gets its repair (the floor teaching could not move)

### Added
- `ui autofix` gains `font-display-swap`: inserts `font-display: swap;` into `@font-face`
  blocks that lack the descriptor (an author's existing choice is respected by the shared
  checker gate) and appends `display=swap` to Google-Fonts link hrefs without one. Edits
  locate on the non-markup mask — a code sample quoting a font link is never rewritten.
  Chosen by measurement: in the born-passing A/B (evaluation-260819-2016),
  `font-display-missing` was the one floor teaching did not move (6 findings per arm,
  12 across the corpus's 12 files — generators pick fonts before thinking about loading
  behaviour); one autofix pass over those same 12 files takes the count 12→0.
  The paired checker tightened with it, one mask contract for both sides: only
  `rel~=stylesheet` links flag (a preconnect hint to the fonts origin is correct
  markup — previously a checker false positive, and the repair made fixing it urgent),
  scripts/comments are dead on both sides, `&amp;display=` counts as compliant, and
  `@font-face` repairs live in real CSS regions only — prose quoting CSS is never
  rewritten.


## 2026-08-19 - The loop gets its labels: tractability telemetry events

### Added
- Four ledger event types (the kernel owns the schema; routers, products and host
  workflows record through `ui memory record`, so every consumer labels the loop the
  same way): `route_decided` (task + route: cheap-loop | executor | selection),
  `attempt_completed` (one generate→gate cycle: file, attempt, route, gate counts),
  `outcome_recorded` — where `gatePass` is REQUIRED by design: an accept cannot be
  recorded without the final artifact's gate verdict, closing the
  retry-swallows-regression hazard — and `taste_veto` (a human overriding a machine
  floor: checkId + mandatory one-sentence reason + verdict fp | outdated |
  context-exception, plus the file it fired on — required so vetoes dedupe and stay
  falsifiable). The veto stream is what the per-floor false-positive gauge and the
  librarian's cross-project recurrence WILL read — consumers land separately, the labels
  start now; the graph compiler ignores all four by the same convention as `lint_run`
  (ledger truth, rebuildable views). `outcome_recorded` additionally requires
  `gateErrorCount` and a `--refs` pointer to the gate run it reports — a bare
  self-declared boolean would be a pass nothing in the ledger could contradict.


## 2026-08-19 - FloorFinding schema v1 and the coverage registry

### Added
- **FloorFinding schema v1** (`finding-schema.ts`): every gate family's findings now share
  one base shape with optional repair fields — `nodeRef`, `expected`, `actual`, `fixHint`
  (authored per-rule, never model-generated), and `repairScope` (`nodes | subtree | global`,
  the finding's DECLARED patch blast radius — the strict-patch ruling from the tractability
  advisory). All additions are optional; six reference checks ship the fields first
  (input-unlabeled, focus-outline-removed, sticky-hover-unguarded, data-numbers-not-tabular,
  equal-nested-radii), the rest adopt as they are touched.
- **`ui gate coverage [--dir]`** — the machine-readable roster of every check the composed
  judge can run (88 entries across five families), with per-project activity (the tokens-gated
  raw-hex check reports inactive until the DS token file exists; the DS root resolves through
  the same walk every DS command uses, so a subdirectory probe cannot lie). This is the
  evidence source a triage router derives from: routing on this registry can never go stale,
  because shipping a floor updates the registry it routes on. Paired two ways with reality:
  the source extractor resolves both literal and const-style checkIds (the const class fooled
  the first draft's grep into a green that could never go red — review-caught, extractor now
  self-probed), and a runtime containment test asserts every id a kitchen-sink gate run emits
  is a catalog row. Rules with global-scope repairs carry a machine-readable `subject`
  naming the region a valid patch may touch — validators compose unions of subjects,
  never flatten "global" to "anywhere".

### Changed
- The gate envelope now passes family findings through whole: a11y findings keep their WCAG
  `sc`, taste findings keep their rubric `axis` (previously stripped to the four base fields).
  Additive — existing consumers of the base fields are unaffected.


## 2026-08-19 - One composed judge: ui gate

### Added
- `ui gate <file.html>` — the composed floor judge (advisory:
  plans/reports/advisory-260819-1536-ui-gate-unification.md, Fable + Kongming). One call
  runs validate-layout, a11y-lint, taste-lint and content-lint plus an autofix DRY-RUN
  cleanliness check (`autofix-not-clean` — the mutation stays `ui autofix --write`).
  Read-only; exit 1 on any error-severity finding; `--skip <family>:<reason>` makes
  partial gating a declared, auditable decision — a reasonless skip is refused.
  `runGate` ships on the public `ease-design/lint` subpath.
- A workflow-coverage test: every HTML-emitting workflow either calls `ui gate` or
  carries a `<!-- gate-exempt: <reason> -->` marker (from-url mirrors third-party
  evidence; extract emits JSON; design/to-figma live on the Figma canvas) — a future
  workflow cannot silently recreate the 3-of-4 gate hole.

### Changed
- The critique workflow's excellence correctness gate — the funnel every HTML workflow
  defers to — now runs `ui gate`; it previously ran layout + taste only, so a11y and
  content floors could escape on any deferring workflow's output.
- generate, redesign, refine, iterate, from-ref, figma, slides, chart and diagram all
  judge through `ui gate` (superset-only swaps: generate keeps `ds-usage-lint` +
  `ds a11y`; chart/diagram keep their grammar linters).
- Two deliberate strictness changes, named as such: the gate's `autofix-not-clean`
  finding is error-severity even when the underlying smell is a warning (a repairable
  floor left unrepaired blocks — run `ui autofix --write` first), and an unreadable
  `--tokens` path is refused (`TOKENS_NOT_READABLE`) instead of silently disabling the
  raw-hex check the way optional `taste-lint --tokens` tolerates.
- The chart/diagram golden corpus now passes the composed gate in its own tests — the
  claim its header always made. Getting there exposed a real `fixDuplicateIds` false
  positive (issue #196): `data-focal-id="…"` counted as an `id=` occurrence, flagging
  all 28 goldens; ids are now scanned on a style/script/comment-blanked mask with the
  attribute name anchored, which also stops a CSS `[id="x"]` selector renaming the
  element it targets. Both #196 halves close.

## 2026-08-19 - The floors repair themselves, and generation is told to be born passing

### Added
- `ui autofix` gains three floor repairs, each gated by the same check function its
  linter runs (a repair the checker cannot confirm fixed nothing): `hover-media-guard`
  wraps raw flat `:hover` rules in `@media (hover: hover)` in place (cascade order
  kept; wrapping inside an unrelated media query is valid nested media; CSS-nested
  rules and mixed selector lists are skipped as misses — structural safety over
  coverage, and string literals are blanked so a `}` in `content:"…"` can never
  mis-pair a brace); `table-tabular-nums` emits a fresh one-line `<style>` in
  `<head>` (never adopts a block that may live in a script string or a comment);
  `focus-outline-restore` deletes whole-value outline kills and
  `focus:outline-none` utility tokens so the browser ring returns — programmatic
  focus targets (`tabindex="-1"`), documentation copy in `<pre>/<code>`, and
  framework values (`data-class`/`:class`) are all left alone.
  Floor repairs rewrite CSS and attribute values only; copy text is never edited
  (owner decision), so punctuation and label violations still route through refine.
- `generation-craft-defaults.md` gains a "Machine floors — emit to pass" section: the
  generator is told the floors up front instead of paying a bounded refine round for
  what the linters would catch anyway.


## 2026-08-19 - Three more floors: labels, focus rings, concentric corners

### Added
- `a11y-lint`: `input-unlabeled` (error, WCAG 3.3.2) — a text control with no `<label for>`,
  no wrapping `<label>`, and no aria-label/aria-labelledby; a placeholder is not a label.
  And `focus-outline-removed` (error, WCAG 2.4.7) — a focus rule kills the outline
  (`outline: none` / `focus:outline-none`) and no focus rule anywhere provides a visible
  replacement.
- `taste-lint`: `equal-nested-radii` (warning, Spacing) — a padded Tailwind container
  nesting a child at the same radius step; the concentric rule (outer = inner + padding)
  already lived in prose twice with no linter, and the rubric now states it under Spacing.
- The critique workflow walks every declared state (hover/focus/active/disabled/loading/
  empty), reads motion "at 10% speed", and gains an optional additive `rejected` field —
  borderline fixes land there with a reason instead of padding `suggestions`, and the
  refine loop reads it so a rejected candidate is never re-proposed.

### Changed
- `lintA11y` gained two checks, so a11y error counts can rise on pages with unlabeled
  controls or removed focus rings. Measured on every tracked `*.html`
  (`git ls-files`, 79 files): zero findings, with the probe proven able to go red
  first — an earlier, narrower sweep missed `showcase/` and its one hit, which turned
  out to be a false positive on a `hidden` file input and drove the `hidden`/
  `aria-hidden` exemption now in the check. Adversarial review also hardened the
  floors: Tailwind utilities are read from `class` attributes only (a page that
  merely *mentions* `focus:outline-none` in prose or a code sample never fires),
  `tabindex="-1"` programmatic focus targets may suppress their ring,
  `focus:shadow-*`/`focus:border-*` count as replacements, `outline: 0px` and
  `!important` forms are removals rather than silent kill-switches, and a void or
  unclosed container can no longer adopt the rest of the document as its child.
  Adopted from [jakubkrehel/skills](https://github.com/jakubkrehel/skills),
  rewritten against WCAG and this repo's rubric language.

## 2026-08-19 - Kit typography polish: balanced titles, pretty bodies, hairline photos

### Changed
- Every kit title rule (`Card`, `Dialog`, `Toast`, `Alert`, `Popover`) sets
  `text-wrap: balance`; every body/description rule sets `text-wrap: pretty` — headings
  stop ragging on one orphan word, running copy stops leaving widows.
- The Avatar photo carries the hairline image outline: `1px` of
  `color-mix(in oklab, var(--color-foreground) 8%, transparent)` at `outline-offset: -1px`,
  so a light photo reads bounded in light mode and a dark one in dark mode — one
  token-driven declaration instead of a per-mode pair.
- Breadcrumb links set `text-underline-position: from-font` +
  `text-decoration-skip-ink: auto`, so the hover underline clears descenders.
- Paired-standard rule honored in-kind: a kit floor test asserts each declaration
  per component, so a reverted emitter goes red in CI (interfaces.dev adoption,
  gap e1690's emitter half; the knowledge half stays in the librarian queue).

## 2026-08-19 - The repo's own surfaces meet the punctuation floor

### Fixed
- `site/index.html` and `docs/design-os-guide-slides.html` now pass `content-lint` with
  0 findings: seven UX-law possessives get the typographic apostrophe (Fitts's → Fitts’s),
  the Figma collection name gets curly quotes, and the CSS-custom-props snippet
  is marked up as `<code>` — it is code, which also exempts its elision dots.

### Changed
- `data-numbers-not-tabular` documents its date/time decision: a column of dates
  misaligns under proportional digits exactly like a column of prices, so digit-shaped
  date cells count on purpose. Measured on 1,071 real files across four products:
  21 fired — 18 lcov coverage reports (tool output, true by the rule) and 3 designed
  compliance-centre prototypes whose version/date columns genuinely lack tabular figures.
- Decision recorded (issue #190): the six frozen `examples/generated/live-2026-05-30/`
  artifacts that fire `sticky-hover-unguarded` stay untouched — they are captured
  evidence of a past live run, and editing evidence to quiet a warning would falsify it.

## 2026-08-19 - Five interface-craft floors from the interfaces.dev cheat sheet

### Added
- `content-lint`: `dumb-punctuation` (typewriter `...`/`'`/`"` in visible copy — typeset
  copy uses `…` `’` `“ ”`; scripts, styles and attributes never fire) and
  `bare-confirm-button` (a bare OK/Okay/Yes/No label — start with a verb and repeat the
  consequence). Both warnings.
- `a11y-lint`: `paste-blocked` (WCAG 3.3.8) — a handler that cancels paste without
  re-inserting the clipboard text breaks password managers and one-time-code entry. The
  `onpaste` attribute form is an error; the scripted-listener form is a warning (a regex
  cannot prove runtime semantics), and the paste-as-plain-text idiom
  (`preventDefault` + `getData` + `insertText`) never fires.
- `validate-layout`: `sticky-hover-unguarded` (warning) — a raw CSS `:hover` rule outside
  `@media (hover: hover)` on a mobile-intent document; on touch, hover styling sticks after
  a tap. Tailwind `hover:` utilities and desktop-only pages never fire.
- `taste-lint`: `data-numbers-not-tabular` (warning, Typography) — three or more
  number-shaped table cells with no `tabular-nums` and no monospace face; proportional
  digits misalign down a column. The rubric now states the tabular-figures rule the
  Table emitter already practised.

### Changed
- The kit's Button and Breadcrumb emitters wrap their real `:hover` rules in
  `@media (hover: hover)` (the static `.is-hover` specimens are untouched), so the kit
  passes the floor it now enforces — and the kit gate now asserts none of the five new
  checkIds fire, warnings included, so a reverted guard goes red in CI. All five checks
  are adopted from the [interfaces.dev cheat sheet](https://interfaces.dev/cheat-sheet),
  rewritten against this repo's rubric language.
- `allContentChecks` gained two members, so every consumer composing from it (the
  figma-agent panel gate included) starts emitting the two new warnings on upgrade.
- `lintA11y` now strips HTML comments before running its checks (the same
  offset-preserving helper layout-lint and taste-lint already used, now shared from
  `taste-checks-shared`) — commented-out markup no longer trips any a11y check.

## 2026-08-17 - Onboarding points at the plugin repo when the Figma agent is absent

### Fixed
- `ui onboard` printed `figma-agent status` as the Figma next step on every machine. The
  Design Agent ships from its own repository, so on a machine without it that instruction is a
  `command not found` — in the one place a newcomer trusts. A PATH probe now decides: open the
  plugin if it is there, install it from `design-os-figma-plugin` if it is not. The probe stats
  PATH entries rather than spawning anything, so the kernel stays a pure transform.

## 2026-08-16 - Root rules are decided by the selector's subject

### Fixed
- `root-overflow-x-hidden` no longer false-flags descendant rules. It matched the root
  name anywhere in the selector, so `body.dark .card { overflow: hidden }` — a very common
  theming shape — was reported as a root rule.
- The colour-mode scan behind `mode-invisible-surface` had the same defect, where a dark
  descendant rule could decide the whole document's mode and silence a real finding.

### Changed
- Both now read `selectorSubjectIsRoot` from `taste-checks-shared`: the subject (rightmost
  compound) is what a rule actually styles. One answer, two consumers — repairing one can no
  longer leave the other broken. Roots wrapped in a functional pseudo (`:is(body)`) are not
  recognised; the limit is stated beside the helper and pinned by a test.

## 2026-08-16 - The scrub-encode floor gets its emitter

`ui scrub-lint` could fail a clip whose encode missed the floor, but nothing produced one
that met it — the floor was a table of knobs retyped into ffmpeg per project, with the
checker catching the typo only after the render.

### Added
- `ui scrub-scaffold <dir>`: emits `build-assets.sh` carrying the whole scrub-encode floor
  (no audio, fixed small GOP, `crf 20`, `+faststart`, light unsharp, native resolution) plus
  the poster leg. The portrait profile encodes narrower *and* with a tighter GOP, and refuses
  to centre-crop a landscape source rather than cropping silently. The kernel emits the
  command; it never runs ffmpeg.

### Changed
- The floor now has one definition (`src/core/scrub-encode-floor.ts`) read by both the
  emitter and `scrub-lint`, with the suite asserting the emitted script spells those values —
  changing a knob in one place goes red instead of splitting the floor in two.

## 2026-08-16 - ease-design 0.3.0 on npm

### Added
- Published `ease-design@0.3.0` (tag `v0.3.0`, CI release with sigstore provenance). The
  npm kernel now matches the showcase: 42 commands, including the tenant scroll engine
  (`tenant-scaffold`/`tenant-lint`), `gflow`, `chart`, `diagram`, and `onboard`. The
  0.1.0→0.3.0 gap closes the "npm can't reproduce the demos" finding from the 2026-08-13
  README audit; the four demo repos now install via `npm i -g ease-design`.

## 2026-08-16 - Figma comment triage, and the owner's verdict as the completion signal

Closes the loop between a design review and the work it asks for. Figma's Plugin API
cannot read comments at all, so the kernel consumes REST payloads the host captured —
the same precedent as `ingest-figma-ds` and `figma reconcile --mirror-file`. Validated
against a live 1,819-message product file.

### Added
- `ui figma comments` and `/ui:figma-comments`: folds a captured comments payload into
  threads and answers, per open thread, which screen, which element, and what was said.
  Each pin resolves to a page/frame/ancestor chain with an honest confidence label
  (`element | region | frame | orphaned | unanchored`). On the live file, 45/45 comments
  reached element confidence with zero orphaned and every count reconciling against the
  total pulled.
- `--since`, a delta over a prior pull across four states — new, replied, newly resolved,
  and replied-while-resolved. The last exists because `resolved_at` means "my request is
  satisfied" from a reviewer but only "I have read this" from someone answering in their
  own thread, so a reply inside a resolved thread is still a live instruction. It measured
  6 on a real file while the default view reported 0.
- Verdict reading — `classifyVerdict` returns `accepted | conditional | reversed | silent`
  off the threads we posted, so completion comes from the owner rather than being derived
  from the implementer. Silence is its own verdict and never acceptance: on a real run 7 of
  26 handoff threads were resolved with nothing said and all 7 had been read as yes. Every
  ambiguity biases to `conditional` — a wrong conditional costs one question, a wrong
  accepted ships a defect. Live: 62 threads shown, 22 accepted, 10 conditional, 1 reversed,
  9 silent — 20 of 42 verdicts not a clean yes, four recorded nowhere.
- `knowledge/verification-honesty.md` — why a false pass costs more than a crash, and the
  four rules that stop a check, a status flag, or a delegated agent from reporting success
  it did not earn: a checker must be able to REFUSE rather than only pass or fail; totals
  must reconcile against what entered the pipeline; a status flag carries its setter's
  meaning, not the reader's; silence must be its own state instead of falling into the
  accepting branch.
- `templates/skills/verify-canvas.md` — that doctrine applied to a live canvas: visibility
  is the ancestor chain, counts are measured not carried, a component swap needs a second
  export, enums are probed against the runtime. Blast radius comes before the work, and
  deletion is named as the most dangerous operation with the least tooling.

### Changed
- The anchor deliberately never returns the deepest containing node. In real auto-layout
  that is routinely a full-bleed background rect or a spacer, and a confidently wrong
  element name is worse than none; a fixture provokes exactly that case and a test pins
  the refusal.
- `--delivery-target` is required rather than defaulted. The most expensive error measured
  was a batch aimed at the wrong artifact that then passed every gate defined for the wrong
  one — a field that may be omitted will be omitted.
- Blast radius reports how often a master recurs across the batch, not a bare boolean. The
  boolean fired on 52 of 62 live anchors, because in a componentised file almost every pin
  sits inside some instance; those 52 resolve to 19 masters with one accounting for 24, and
  that frequency is what separates a local component from a shared one.

## 2026-08-16 - Diagram grammars expanded, chart capability added

Vendors [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)
(MIT, pinned at `09df49d8`) into the knowledge core. Attribution and the upstream
trademark note are recorded in `THIRD_PARTY_LICENSES.md`.

### Added
- Sixteen new diagram grammars — swimlane, data-flow, process, high-level, dp-integration,
  medallion, it-state, dp-security-matrix, loop, er, flowchart, layers, nested, org-chart,
  state, tree — bringing `/ui:diagram` to nineteen. `diagram-craft.md` gains an explicit
  admission bar and collision-family precedence rules for the step-and-role,
  platform-overview, and hierarchy families.
- `/ui:chart` and `ui chart lint`: a sibling capability for standalone charts of quantities
  across nine grammars (bar, line, scatter, radar, gantt, timeline, quadrant, venn,
  pyramid). Its boundary against `/ui:generate` (dashboard mode) and `/ui:slides` is drawn
  on two observable questions — is the chart the whole artifact, and does it need
  interactivity or live data. `chart-craft.md` carries the honest-encoding floor: zero
  baselines for length-encoded marks, declared truncation, no dual axes, no fabricated data.
- `hardcoded-svg-color` check in both linters, closing a real gap: `ds-usage-lint` reads CSS
  declarations only, so a colour in an SVG presentation attribute (`fill="#eb6c36"`) passed
  every gate while bypassing the design system entirely.
- Token-bound diagram scaffolds under `templates/diagram-scaffolds/`. Four roles the DS has
  no token for (soft, rule-solid, accent-tint, link) are derived with `color-mix` from real
  tokens rather than pinned to literals; light and dark ship in one file.
- `knowledge/domain-packs/lakehouse.md` — concrete platform vocabulary kept out of the core
  grammars so those stay vendor-neutral. Every grammar remains usable with the pack absent.
- `knowledge/diagram-icons.md` — 86 monochrome `currentColor` icons with per-icon
  attribution, plus the precedence split against Lucide.
- Routing tests that prove decidability rather than asserting shape: trigger tokens are
  pairwise disjoint across all twenty-eight grammars spanning both capabilities, each
  collision family cross-names its members, and a golden corpus of one-line briefs resolves
  each to exactly one grammar.
- `src/core/svg-artifact.ts` — the owned-SVG contract shared by both linters, so a rule
  fixed once is fixed for both.

### Changed
- `diagonal-line` is now grammar-gated rather than tag-gated. Applied to every grammar it
  made loop, org-chart, and tree impossible to author; the strict rule remains the default,
  so an unrecognised grammar is still geometry-checked. The check also now catches a
  diagonal drawn as a `<path>`, closing the tag-swap escape hatch.
- `templates/workflows/diagram.md` invokes `ui a11y-lint` and `ui ds-usage-lint` alongside
  `ui taste-lint`; previously only the latter ran.
- Runtime adapters now install 18 workflows and 14 craft skills.

### Excluded
- The upstream Stata icon is not vendored: its source (IcePanel / techicons.dev) publishes
  no verifiable licence grant. SAS is retained under its Wikimedia public-domain dedication.

## 2026-08-16 - Gradient fields, rendered and corrected

### Added
- A `## Gradient fields` README section showing all ten ShaderGradient presets as a labelled
  grid plus an animated field, rendered from the published renderer using the exact preset
  values this repo ships. The section leads with the capability's gate and its two-fallback
  contract rather than the picture.

### Fixed
- `knowledge/shader-gradient/catalog.json` claimed `packageVersion` 2.4.24, a version
  upstream **never published** — it exists only in that revision's own `package.json`, bumped
  in-repo without a release, and 404s on every registry and CDN. The ledger now carries both
  `sourceVersion` (2.4.24, what the revision says) and `packageVersion` (2.4.20, what can
  actually be loaded), and records that the two were compared key-by-key and agree on every
  render-relevant key.


## 2026-08-16 - ShaderGradient as a T6 gradient-field capability

### Added
- `/ui:generate`, `/ui:refine`, and `/ui:redesign` can now direct one animated 3D gradient
  field through the `shader-gradient` skill, reachable only after the motion ladder selects
  T6 and the persona's motion cap allows it — the same gate `canvas-effect` sits behind, and
  the same single-effect budget, so a page gets one T6 surface, never one of each.
- `knowledge/shader-gradient-direction.md` carries the preset matrix (Narrative job ·
  Anti-use · Required fallback per slug), the T6 floor, the design-system colour binding, the
  conditional peer-dependency handoff, and the surface matrix for hand-configured fields.
- `knowledge/shader-gradient/` is a source-free reference ledger: preset slugs, display names,
  the mechanically-derived mesh/light/grain axes, the shader-by-mesh surface set, and
  provenance pinned to an upstream revision. It holds no GLSL and no parameter values.
- `ui knowledge gradient-matrix` emits the preset matrix's machine columns from the ledger,
  leaving the three prose columns empty for a human — an emitter that invented an `Anti-use`
  would defeat the one column whose job is honest refusal.
- `ui knowledge check` gains the `gradient-catalog-*` checks: ledger presence, revision drift,
  slug membership in both directions, row drift, empty prose cells, and `fallback-thin` — the
  refusal specific to this capability, which fails a fallback cell that never names the frozen
  state, because shipping one of the two required fallbacks as though it were both is the
  measured failure mode.

### Changed
- Runtime adapters now install one additional craft skill (`shader-gradient`), routed from the
  three generation verbs that already route to `canvas-effect`.
- `extractRevisionToken` and `monthsBetween` moved to `src/core/knowledge-ledger-provenance.ts`
  and are shared by both ledger pairs and the knowledge linter, replacing three copies of the
  same helper.


## 2026-08-15 - Native diagram craft

### Added
- `/ui:diagram` selects exactly one native grammar for architecture, sequence, or
  product-flow diagrams and emits a self-contained offline HTML artifact with owned inline
  SVG, accessible labels, explicit reading order, and inspectable source metadata.
- `ui diagram lint` deterministically rejects malformed ownership, accessibility metadata,
  unsafe references, missing product-flow source IDs, diagonal line connectors, and duplicate
  connector geometry without pretending to validate subjective composition.
- Product-flow guidance treats `flow.json` as read-only semantic authority, separates the
  responsibilities of flow and diagram linting, and requires manual source-ID resolution plus
  a fidelity ledger for every merge, collapse, or drop.
- A pinned generic real-flow fixture and rendered product-flow artifact prove zero-finding
  flow/diagram lint, complete source-ID parity, declared reading order, terminal treatment,
  back-edge treatment, and full fidelity with an empty ledger.

### Changed
- Runtime adapters now install 17 workflows, 13 craft skills, and 3 journey skills. Adapter
  counts, initialization help, generated-tree tests, and README discovery surfaces agree on
  the 33 generated artifacts.

## 2026-08-13 - Four shipped sites lead the showcase as a grid

### Added
- The README showcase now opens with three public sites shipped end to end with the
  toolchain, each as a full-width animated scroll-through:
  [AURA](https://github.com/jangtrinh/aura-scrollcinema-demo) (cinematic 289-frame
  scroll-film under the Liquid Glass persona),
  [OPAH ONE](https://github.com/jangtrinh/design-os-drone-showcase) (scroll-scrub drone
  page — DTCG tokens, tenant engine, five gates green), and
  [Robotic Arm](https://github.com/jangtrinh/design-os-animejs) (anime.js-style Three.js
  scrollytelling). Each repo carries a "Reproduce it with DESIGN:OS" guide
  (install → `ui init` → `/ui:generate`) and its own deterministic scroll-through
  recording (gif + mp4), captured headless frame-by-frame from the live site.
- [Rill Architecture](https://github.com/jangtrinh/design-os-rill-architecture) extracted
  into its own public repo (GitHub Pages live) with the same README treatment, and the
  showcase restructured into a two-column grid — OPAH ONE first — that grows as new
  demos ship. The in-README "Featured: Rill Architecture" block folded into the grid.
- The OPAH ONE demo re-recorded with a fully warmed frame cache (one slow scroll down and
  back up before capture) so every scrubbed scene shows real footage.
- README accuracy pass after a three-reviewer audit (Fable direction + kongming + Codex):
  every headline count re-measured and corrected (40 `ui` commands, 2,819 kernel tests,
  283 conductor tests, 14 installed skills, 15 workflows + 1 internal gate, and the Figma
  plugin's 1,548-test suite credited to its own repo); the plugin elevated to the header,
  nav, and a stat line; benchmark prose folded behind its headline numbers (1.77 blind-review
  lift, 8.96/10 repeatability); three self-contradictions fixed (native-mobile evidence
  boundary, post-split `setup.sh` wording, the absolute no-drift claim).

## 2026-07-31 - figma-agent split into its own public repo

### Changed
- **The Figma plugin + CLI moved out of this monorepo** into its own public repo,
  [design-os-figma-plugin](https://github.com/jangtrinh/design-os-figma-plugin) — it can
  now version, release, and take contributions independently of this kernel. Install,
  build, and bind live in that repo's own README; this repo's README keeps the "why it
  exists" introduction and points there for everything else.
- `setup.sh` / `design-os update` / CI no longer build or link `figma-agent` as an
  in-repo npm workspace — it ships and links from its own clone now. `design-os doctor`'s
  PATH-based hand check is unaffected (source-location-independent).
- The kernel's `fileSlugOf` parity-fixture test now names the plugin repo (pinned to its
  split commit) as its twin instead of an in-repo sibling path — same cross-repo drift
  lock, updated pointer.

### Removed
- `figma-agent/` (the workspace) and the root panel craft/taste/a11y gate test — both now
  live in the plugin repo (`kernel/design-os` there is a pinned git submodule bridge back
  to this kernel's linters until they publish as a real subpath export).

### Added
- **`figma-agent changes`** — read the designer's own edit history per file
  (--since/--file/--actor/--owner-only/--limit), rendered as human sentences; malformed and
  shape-invalid lines are counted as warnings, never a crash.
- **`figma-agent errors`** — same shape over `design/figma-errors.jsonl`; asking about a file
  with zero errors answers `count: 0` instead of throwing.
- **Reconnect gap-fill**: per-page snapshots let the plugin report edits made while it was
  CLOSED as `gapfill` frames on the next boot. Deleted pages get one honest notice (plus
  chunk cleanup); pages over the scan cap suppress their whole diff — a wrong fact is worse
  than an absent one; a best-effort snapshot also runs on plugin close.

### Fixed
- The owner-edit feed now routes through the file↔project binding like the registry feed
  (an edit in file A can no longer land in project B); unbound files stage and migrate on
  bind; a fileKey learned later merges the split history; feed order is a reader guarantee.

## 2026-07-31 - Concurrency & Jobs: one mutation per file, honest timeouts, sync in Activity

### Added
- **Broker job model**: every mutating request becomes a job; one mutation runs per Figma
  file at a time (per-file FIFO), read-only traffic bypasses the queue. `figma-agent job
  <id>` polls/waits/cancels/lists and `--force-release` frees a wedged slot (audited).
- **Honest timeouts**: a CLI timeout now names the job id and says the work was NOT
  cancelled — poll for the real outcome instead of re-dispatching (warm-retry refuses
  job-tagged timeouts; the seat probe no longer mistakes a queue-induced timeout for a
  view-only refusal).
- **Panel Activity shows sync runs**: full human sentences for start/result/failure
  ("Synced Client Portal — 3 added, 1 updated" / "Sync failed for … — <reason>"), failure rows
  wrap instead of truncating, a stuck "Syncing" row times out honestly, and a second Sync
  click resolves the first as superseded.
- In-process daemon test harness (three end-to-end scenarios over the seams pure unit
  tests could not see).

### Fixed
- Cancel actually cancels: a cancelled queued job is dequeued and can never be resurrected
  by queue advancement; disconnect-failed queued jobs are dequeued, never re-dispatched
  when the plugin reconnects; late replies to a finalized job are counted and discarded,
  never served as its result.
- Job retention (10-min TTL) and abandoned chunk-buffer cleanup now actually run (they sat
  behind an early return); chunk buffers are keyed per connection so two CLIs can never
  merge payloads.

## 2026-07-30 - Registry Integrity wave: per-file registries, cursor safety, scale hardening

### Added
- **Explicit file↔project binding** (`figma-agent bind --file "<name>" --dir <project>`): a Figma
  file's changes land in ITS project's registry/feeds, never in whichever directory the broker
  happened to be spawned from. Unbound files stage safely and migrate once on bind.
- **Per-file change partitioning**: change frames carry the file identity; reconcile filters to the
  bound file with a per-file `{line, byte}` cursor; sidecars nest under `components/<file-slug>/`.
- **Streaming reconcile + log rotation**: the change log is read from a persisted byte cursor
  (large-log cost is proportional to what's new), and the change/edit feeds rotate at 8 MiB
  (keep 3 generations, marker written before truncation). A truncated or rotated log is never a
  silent cursor advance — `rotated_away_lines` / `history_gap_lines` are reported.
- **Sharded registry storage** (`design/registry/` index + per-component shards) with
  content-guarded writes; the contract file `design/component-registry.json` stays byte-identical.
- **Foreign-registry protection**: when `design/component-registry.json` is a project's OWN
  generated artifact (not ours), the kernel yields to `design/figma-component-registry.json` —
  their file is never touched, every consumer agrees on one path, and the envelope says so
  (`foreign_registry_at_default_path`, `registry_path`).
- **Nothing vanishes untraced**: evicted unresolved corrections archive to
  `figma-corrections.overflow.jsonl`; plugin-side eviction counts surface as
  `edgeEvictedUnresolved`; pruned legacy pending entries leave audit records; audit-cap
  truncation reports `skip_history_truncated`; legacy 'unknown'-file frames count as
  `skipped_legacy_frames` with a named manual drain (`--file-slug unknown`).

### Changed
- Apply is map-based and writes only touched records (measured: 200-target apply into 10k
  records ~1 ms). Correction memory has a true hard cap; plugin storage is chunked
  (sharedPluginData v2, lazy v1 migration).

### Fixed
- Cursor-safety: unfiltered applies advance every per-file cursor (no re-apply on the next
  filtered run); `--skip` no longer erases per-file cursors; a byte hint can never pair with the
  wrong line; a legacy untagged pending entry no longer wedges every file's cursor.
- Write-ordering crash windows: rotation marker before truncate, overflow archive before prune,
  orphan sidecar deletion only after the registry save succeeds (with a same-inode guard so
  case-insensitive filesystems never delete a freshly written file).

## 2026-07-25 - Scroll-cinema asset toolchain: reported by `doctor`, opt-in in `setup.sh`

### Added
- `design-os doctor` now checks the **scroll-cinema asset toolchain** — `gflow`, `ffmpeg`, `cwebp` —
  as optional hands alongside the existing ones. Spec 021's asset path was reproducible only on the
  machine that ran the pilot; absence surfaced *mid-generation*, after video credits were spent.
  `setup.sh` § verify already runs `design-os doctor`, so a fresh clone now learns about the gap at
  bootstrap. Health stays neutral: the studio ships fine without it.
- `setup.sh` gained an **opt-in** gflow step (`--with-gflow` / `--no-gflow`; prompts when interactive,
  skips when not). It is never installed silently and the prompt says why: gflow is unofficial, it
  automates a real Chrome session on the user's own Google account, and it needs a paid AI Ultra/Pro
  subscription. A failed install warns and lets the studio setup finish. `--check` and the success
  report both list gflow as optional. Install line is verbatim from the es-gflow skill, including
  `--with pillow` (gflow does not declare Pillow; frame ops crash without it).

### Changed
- `_probe_version` keeps the **first line only**. Real `ffmpeg --version` prints a build banner
  (version + compiler + configure flags); the whole blob would otherwise land in the JSON envelope
  and in doctor's one-line-per-check render.
- `specs/021-.../SPEC.md` reconciled with the rest of the repo: § LOCKED DIRECTION marked
  **superseded by Architecture A** (forward seed-chain, no `--end-frame`) — recorded in `GOALS.md` as
  a direct owner order, and what the shipped pilot actually used — while keeping the Fable text as
  history for the parts that still bind (stills as backbone, storyboard-approval gate before any
  video credit, omni-flash out). Status header corrected to the real split: tenant half shipped
  (PR #95), asset half pre-integration.

### Notes
- Pillow is deliberately *not* a doctor check: it lives inside gflow's own interpreter, so probing it
  from design-os's interpreter would report a different environment's truth.
- Known degrade, pinned by test: `cwebp --version` is an invalid option (exit 1; the real form is
  `-version`), so cwebp reports found-without-version. Presence is what the preflight needs.

## 2026-07-25 - Tenant contract: embeddable motion sections (`ui tenant-lint` + `ui tenant-scaffold`)

- New `ui tenant-lint <file.html>` — the deterministic linter for the **Tenant Law**: an embedded
  interactive block (scroll-scrub cinema, parallax, exploded-view, canvas hero) must READ the host
  page only through its own bounding box and WRITE only inside its own subtree. It fails a section that
  does a global write (`window.scrollTo`/`scrollY`, document/body height mutation, `:root` write,
  `position:fixed`, a private animation-frame loop), AND fails a host layout whose ancestor sets
  `overflow`/`transform`/`filter`/`contain` — which silently kills the section's `position:sticky`. It
  follows local `<script src>` / `<link href>` to their files (not inline-only). Regex/string-level;
  the real limitations (bracket-notation/alias evasion, inline-style-only ancestor check) are documented
  in-source. Joins the full linter set (`a11y-lint`, `layout-lint`, `taste-lint`, …).
- New `ui tenant-scaffold <dir>` — emits the canonical tenant scrub engine (`scrub-section.js` + `.css`
  + a self-testing Playwright harness) **verbatim** into a target directory, so a page drops it in and
  writes a config instead of reinventing the engine. Refuses to overwrite without `--force`.
- `knowledge/motion-craft.md` gains a **Tenant contract** section (the law + the 4-clause coexistence
  contract + the sticky-killer ancestor rule + the frame-sequence-default media call);
  `knowledge/generation-craft-defaults.md` gains a canvas backing-store-aspect floor (caught in the wild:
  a scrub canvas stretched by being sized to its tall section instead of its 100dvh stage).
- `CONTEXT.md`: canonical terms **Tenant section**, **Scrub section**, **tenant-lint**.

## 2026-07-22 - Full-studio one-command setup (Spec 020)

- Added `setup.sh` at the repo root — a single idempotent bootstrap that takes a fresh
  `jangtrinh/design-os` clone to a working full studio in one command: prereqs (node
  >=22, npm, git, uv) → `npm install` → build (`ui` then the figma-agent/recall/a11y
  workspaces, a11y last) → link all 5 bins (`ui`, `figma-agent`, `recall`, `a11y-audit`,
  `page-shot`) → `uv tool install --force -e ./design-os --with-editable
  ./design-os/plugins/figma` → verify via `ui doctor` + `design-os doctor` → a style-A
  success report. Every build/link/install line is reused verbatim from
  `design-os/src/design_os/commands/update.py`'s `_BUILD_STEPS` and its editable-reinstall
  hint — none invented. `--check` reports prereqs + what's linked with no mutation;
  `--skip-python` builds the kernel + hands only. Re-run-safe on an already-linked machine.
- README: replaced the spec-019 one-line dev note with a "Full studio (clone)"
  subsection pointing at `./setup.sh`; `npm i -g ease-design` stays the primary
  quick-start.

## 2026-07-22 - Published to npm — `ease-design@0.1.0`

- The `ui` kernel is now installable with `npm install -g ease-design` (zero runtime
  deps, MIT). First public release, published from CI with npm **provenance** (sigstore
  attestation of the GitHub Actions build).
- The published package ships the `ui` kernel + `knowledge/` + `schemas/` + `templates/`
  only. The optional Figma/recall/a11y hands stay in the repo (`jangtrinh/design-os`) and
  will be distributed separately later.
- Release plumbing fix: `package.json` `repository.url` now points at the real repo
  (`jangtrinh/design-os`), which npm provenance requires to match the CI build (the npm
  package name `ease-design` and the GitHub repo name `design-os` are intentionally
  different).

## 2026-07-22 - Distribution prep (Spec 019 P3)

- distribution: version-gate + PyPI metadata + publish runbook; no publish executed.
- Added a `ui`↔`design-os` version-gate closing the two-CLI coupling blind spot:
  `design_os.kernel.MIN_UI_VERSION` (`"0.1.0"`) + `kernel.ui_version()` (a deterministic
  local-subprocess probe, no network). `design-os doctor` now shows the resolved `ui`
  version and warns (soft — never fails health or the exit code) when it is below the
  floor, with the fix command (`design-os update`) inline.
- Fixed the README quick-start clone command: `design-os.git` → `ease-design.git` (the
  actual repo name), so a fresh clone works.
- `design-os/pyproject.toml` now carries full PyPI-ready metadata (`license`, `readme`,
  `authors`, `classifiers`, `[project.urls]`) — resolves the "bare listing / missing
  license" warnings a future `twine upload` would raise. `name`/`version`/`scripts`/
  `dependencies` unchanged; the `design-os-figma` workspace dependency (the remaining
  PyPI blocker) is untouched, by design.
- Added `specs/019-onboarding-first-run/npm-publish-runbook.md` — the single owner action
  (add `NPM_TOKEN`, push a version tag) needed to publish `ui` to npm, plus current
  publish scope, the version-gate note, and the remaining PyPI blocker.

## 2026-07-21 - Report renderer + preview links (Spec 019 P2)

- Adopted the shared style-A renderer (`ruleHeader` + `checkItem` + `kv`) in `ui doctor`,
  `ui ds preview`, and `ui designmd audit` — consistent rule-line headers and glyph
  checklists across the tool's highest-traffic reports. `--json` output is unchanged on
  every command; only the human text render changed.
- Added `src/core/preview-link.ts` (`previewLink` / `figmaNote`) — the OSC-8-safe
  convention: a bare `file://<abs>` path on its own labelled line (never `[label](url)`,
  never an inline image), so a host terminal can wrap it in a clickable link. `ui ds
  preview` and `ui designmd audit` now close with a `preview`/`report` link line.
- Extended `checkItem` to a `fail` state (`[✗]`) — the `GLYPH.fail` glyph existed
  unused since Phase 1; `ui doctor`'s hard-fail checks needed it.
- Added the Python mirror `design-os/src/design_os/report_style.py` (`rule_header`,
  `check_item`, `kv`) and adopted it in `design-os doctor` and `design-os evolution`'s
  text renders — same house style, plain-print only (no Rich), every check/signal line
  preserved (Art VIII). Exit codes and envelopes unchanged.
- Deferred: ~24 other ad-hoc glyph sites (a11y-checks, flow, ds-usage-lint, content-lint,
  vr-support, agents, ds-soul, ds-specimen, figma-ds-registry, Python heartbeat/audit
  renderers) are left for a future migration pass — not swept in this phase.

## 2026-07-21 - Onboarding first-run (Spec 019 P1)

- Added `ui onboard` — a deterministic, read-only readiness checklist over a project:
  runtime adapters, git, design system, design soul, and the learning loop (heartbeat),
  plus the optional project-agents and Figma steps. Reports what's missing and the exact
  fix command; never installs anything itself. Always exits 0.
- Added the shared style-A report renderer (`src/core/report-style.ts`) — the wordmark
  banner, a rule-line header with a right-aligned verdict, and a static `[✓]/[ ]/[!]`
  checklist row builder. ASCII-safe, no color/Rich/ANSI.
- `ui init` now opens its success output with the DESIGN:OS wordmark banner and closes
  with an explicit chain to `ui onboard` and `ui guide`.
- The `/ui:init` wrapper (Claude Code + Antigravity) now instructs the host agent to walk
  `ui onboard`'s checklist with the user afterward, asking approval before running any
  suggested setup/install command — `ui` only reports, the host acts. The `onboard`
  journey skill now points at `ui onboard` first, with the same approval discipline.

## 2026-07-21 - Suite-level IMPROVING graduation gate

- Changed: the living-agent proof grants `IMPROVING` only from a preregistered suite —
  at least three holdout cases across at least two categories, mean curator delta ≥ +10,
  aggregate repair reduction ≥ 25%, aggregate repeated-correction reduction ≥ 70%, every
  case wins, zero regressions. A single qualifying comparison can no longer graduate; the
  deterministic engine computes the suite verdict itself.
- Fixed: a `0 → 0` metric is no longer reported as 100% improvement (zero-denominator
  reductions are undefined and never graduate).
- The verdict is unchanged — DESIGN:OS remains `APPLIED`. Thresholds were not weakened and
  the deterministic boundary is intact.

## 2026-07-21 - GSAP motion direction skill

- Added `design-os-gsap-motion`, distributed by `ui init` to Claude Code, Antigravity, and Codex.
- Adapted GreenSock's official MIT GSAP skill suite into a consolidated DESIGN:OS playbook for
  timelines, ScrollTrigger, framework lifecycle, plugins, accessibility, and performance.
- Wired the skill into generate, refine, and redesign workflows only when T5 web choreography is
  justified. Simple transitions remain CSS and native mobile production motion remains native.
- Installed the eight upstream GreenSock skills into the local Codex runtime for direct use.

All notable changes to ease-design are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Figma mirror — the registry is a 1:1, rebuildable reflection of the canvas.**
  `figma-agent mirror-verify <nodeId>` proves the round-trip in one command: scan a
  component → rebuild it from the record → scan again → structural-diff. A real component
  comes back a **fixed point** (`equal: true`, 0 diff), verified live across **9/9 diverse
  components** of a production 27-screen design system (screens, instances, nested
  instances, variant swaps). Token bindings survive — reattached by publish **key**, local
  and published-**library** variables alike, on every bindable field, with a bound value's
  literal treated as a mode projection so a component scanned under a different variable
  mode still round-trips. Instances survive — component reference, properties, **variant
  swaps** (an override Figma never names), and inner-child overrides (visual + layout).
  Honest by construction: what Figma's API refuses to reproduce (a `maxWidth` binding on a
  TEXT node; a "was-set" flag on a FILL child) is recorded and reported in a `normalized`
  list with its reason — geometry and values are still checked both sides, so `equal: true`
  is never silent. The reverse-walker is pre-bundled into the CLI (a dist-only install
  mirrors without a repo checkout). Every gap the diff surfaced was a real Plugin-API
  subtlety caught on the live canvas (sync `.mainComponent`/`.fontName`/`.strokeWeight`
  lie under `dynamic-page`; `resize()` clobbers auto-layout sizing; an inherited fill
  binding was being silently overwritten), never a fixture.
- **Plugin panel — a per-operation activity feed.** The panel says what the plugin is
  doing, per operation: the CLI states its intent on each request (`Mirror-verify ·
  rebuild`, `Scan · <id>`) and the plugin derives the outcome from the reply (`→ 42 nodes`,
  `→ Hero card, 2 warnings`). Rendered as a mini data-log — 12/11px, older rows dim, status
  by shape (■ ok · □ running · ✗ failed) — filling the iframe edge-to-edge.
- **Figma live-sync — the registry follows the canvas.** `documentchange` events append to
  a local ledger; a 5-minute idle debounce surfaces a 1-click Sync in the plugin panel;
  `design-os figma reconcile --dry-run/--apply` folds the change-set into the registry. The
  panel reports exactly what landed — including "nothing landed" when nothing did.
- **Journey skills — the whole user journey as three installable skills.** `ui init` now
  emits `design-os-onboard` (six entry routes, git + manifest-name STOP-gates, soul
  layer selection, heartbeat schema), `design-os-daily` (the four-"audit"
  disambiguation table, finding triage, Figma preflight, taste corpus loop) and
  `design-os-deliver` (the ordered full-stack audit playbook, static-vs-rendered a11y
  ship-guard, semver handoff) across all three runtimes — 11 skills total, every skill
  now prefixed `design-os-*`. Paired linters: journey-command-consistency (every `ui`/
  `design-os` command a template cites must exist) and journey template-drift coverage
  in `ui doctor`.
- **`ui ds soul factory` — the shipped design:os baseline stance.** A world-class
  product-design soul (Never / Always / Voice, ratified by the product itself) compiled
  into the binary as a new tier BELOW project and studio soul — so a mass user has a
  top-tier stance day-0 with zero setup. It rides in every `ui ds context` as the
  `## Soul — factory` section (always present; overridden clause-by-clause by any
  project/studio soul above it, never merged), and prints on demand via `ui ds soul
  factory`. Emitter+linter paired: a test enforces `checkSoul(FACTORY_SOUL)` returns
  0 findings forever. Precedence: brief > project > studio > factory > memory > floors.
- **`ui agents` — soul-bound, task-scoped project agents.** `agents init` writes Claude Code
  subagents into `.claude/agents/` — role-first names with a genealogy suffix
  (`designer-jang-vsf-pcp`), identity read at runtime via `ui ds context` (souls are never
  baked into the file), hard role boundaries (designer never self-scores · curator never
  edits · figma-hand never simulates), opt-in roster, and a template-hash drift check
  (`agents check` → `agent-stale`).
- **`ui ds soul` (+ `--studio`) — the declared design stance.** `design/soul.md` (Never /
  Always / Voice, owner-ratified) rides ahead of personas in every generation flow;
  `~/.ease-design/studio-soul.md` is the studio layer above every project soul and names
  the agents. Emitter + linter: scaffolds from `ds init`, a 6-check structure floor, and
  evidence-cited extraction via `/ui:learn`. Precedence: brief > soul > memory > floors.
- **`design-os heartbeat` — deterministic design-health rhythm.** Due-scheduled checks
  (ds-a11y · specimen · audit-pages · figma-audit) with per-task intervals, a DESIGN_OK
  silence contract, worsened/improved delta gating (exit 1 = the notification), skip
  reasons everywhere, FNV-1a stagger, and `--stats` ok-rates. No model calls.
- **`ui taste` — vote-driven taste corpus.** Ingest with sha256 + dHash dedup, pairwise
  Elo ranking, study-verdict ledger; pure JSONL stores.
- **`design-os figma audit` / `figma-agent audit-ds` — automated DS-hygiene audit.** One
  raw plugin pass (dynamic-page-safe, census-accurate on 160k-instance files), judged
  entirely in fixture-tested CLI code: ds/icon/screen segmentation, ten detectors
  (unused, junk names, deprecated, duplicates by name and structure, dead variants,
  redundant families, empty sets, misfiled, unbound paints), offline `--from-facts` replay.
- **Slop gates** — 8 deterministic anti-generated-UI checks (overshoot easing, italic
  display headings, uppercase tight line-height, focus rings that fade in, z-index
  inflation, 100vw widths, root overflow-x hidden, placeholder names) wired into the
  taste/layout/content linters, plus `knowledge/page-structures.md` (21 macrostructures,
  variety↔conformance switch, honest copy, pre-emit self-critique).
- **`brand/`** — the studio's own design-system store (Swiss Monolith, machine-corrected
  contrast) and the first evidence-cited soul, extracted from five live products.

### Changed
- **DESIGN:OS** — project rebranded (repo renamed to `design-os`); README rebuilt hero-first
  with a live-product demo gallery, workflow maps, and this changelog surfaced as a table.

- **`ui ds specimen` — the component-registry state/variant completeness contract (learn-from-shadcn Phase 3).**
  A shadcn component page draws every variant×size×state as a specimen grid; `ui ingest-figma-ds` captures it
  as `variants: ["State=Hover", …]`. `ui ds specimen` reads that back and reports each component's variant
  dimensions + declared states, flagging only *reliably-modelled* gaps: a form **control** that models an
  interaction state but no `disabled`, and a **data container** (table/list/select/combobox/…) with no
  `empty`. Role is read from the **leaf** component name so a Button nested under a DatePicker is judged a
  button, not data (the over-pairing lesson applied). `focus` is intentionally never required (usually a
  runtime `:focus-visible`, not a Figma variant). Informational by default; `--strict` gates. On the real
  718-component shadcn-standard registry it surfaces 6 credible gaps (Combobox/Select missing empty;
  MenuItem/Button missing disabled). New pure module `src/core/specimen-check.ts`.

### Fixed
- **`ui ingest-figma-ds` no longer emits self-referential aliases (dogfood F1).** When two distinct Figma
  variables collapse to the same DTCG path and one aliases the other, the ingest used to emit
  `$value: "{self}"`, which made the whole tokens.json unresolvable (`alias cycle detected`) for every
  downstream `ui tokens`/`ds` command. It now detects an alias whose target is the token's own path and
  drops it, keeping the literal sibling instead. Surfaced live-ingesting the real "shadcn - standard"
  Figma DS (2188 components / 802 variables), where `breakpoint.2xl` self-aliased.

### Changed
- **`ui ds a11y` adopts the paired-token model — deterministic contrast, no over-pairing (shadcn standard).**
  When a DS follows the `{role}` / `{role}-foreground` convention (background/foreground,
  primary/primary-foreground, muted/muted-foreground, …), `ds a11y` now checks each foreground against its
  ONE intended surface — the declared pairs — instead of the text×surface cartesian product. This fixes the
  a client-portal-dogfood "L3" over-pairing (a light-surface text token was wrongly paired against dark panels). The
  result reports `mode: "explicit" | "paired" | "inferred"`; the legacy cartesian inference remains only as a
  fallback for un-paired DSs and the report nudges toward `-foreground` naming or `--pairs`. New pure module
  `src/core/token-pairs.ts` (`inferForegroundPairs`). The paired convention is now the documented Design-OS
  semantic-tier standard (`knowledge/token-taxonomy.md`).
- **taste-lint `tiny-body-text` is now role-aware (dogfood L2).** The 16px body-text floor was firing on
  legitimate UI chrome (badges, nav, labels, table meta, code, eyebrow headings). It now reads the role from
  the `<style>` selector (exempt a ≤13px size when the selector names a chrome/label/heading/secondary role,
  but still flag below a 9px abuse floor) and, for inline/Tailwind sizes, only flags positively body-named
  elements (`p`, `article`, `.prose`, `.description`…) since an inline font-size is almost always a one-off
  chrome tweak. On a real enterprise UI-kit showcase this cut false positives from 35 → 1. `<style>`-rule
  findings now anchor the line at the `font-size` token itself.
- **a11y-lint skips redirect-only stubs (dogfood L1).** `checkHtmlLang` / `checkDocumentTitle` no longer
  flag a document whose body is a bare `<meta http-equiv="refresh">` redirect (no page to title/voice).

### Added
- **`ui ds import` — onboard an existing flat token file into the DS store (dogfood G1).** Real projects
  carry a flat `tokens.json` (`{ category: { name: value } }`, e.g. Figma-reconciled), not a compiled DS
  store — so `ui ds a11y/status/diff/docs` couldn't run on them. `ui ds import <tokens.json> --dir <project>`
  converts the flat file to the DTCG two-tier store (inferring `$type` per value: color / dimension /
  number / fontFamily / fontWeight / duration; hoisting nested groups to `<cat>-<sub>`; **skipping and
  reporting** un-typeable values like box-shadow strings and bezier easings rather than emitting a wrong
  type) and seals a manifest + empty registry. On a confidential client-portal dogfood this imported 117 tokens and
  immediately surfaced a systemic contrast matrix via `ui ds a11y` that a one-off check had missed.
- **`ui evidence` — user-evidence ledger with an anti-fabrication gate (DESIGN-OS T6).** Grounds design in
  what users actually said: a self-contained, git-committable store (`design/research.events.jsonl` +
  `research-sources/`) of findings at three support levels — `quote` (a verbatim user utterance; **must be a
  whitespace-normalised substring of its ingested source or `add`/`verify` reject it** — the binary cannot
  invent a quote), `metric` (a number + source ref), and `observation` (a hunch, permanently flagged
  `unsupported`). Subcommands `add`/`list`/`verify`/`show`; `verify` exits 1 on any fabricated or drifted
  quote. **Loop-closure with T0:** `ui critique-coverage --evidence-dir DIR` now resolves a criterion's
  `evidence[]` as ledger ids — a criterion counts as evidenced only if a cited id exists AND verifies; a
  missing/drifted citation is reported as `unresolvedEvidence` and fails the gate even without
  `--require-evidence` (legacy string-provenance behaviour is preserved when `--evidence-dir` is absent).
  The binary records and verifies; turning transcripts into findings stays the host model's job. Authoring
  brain `knowledge/user-evidence.md`.
- **`ui vr` — deterministic visual-regression tooling (DESIGN-OS T5).** Catches rendered-output changes a
  code diff can't (a token tweak that moved every button, a silently-deleted shadow). Three subcommands:
  `vr diff <base.png> <head.png>` (one comparison), `vr gate <baseline-dir> <current-dir>` (diff every
  baseline against the same-named fresh render — exit 1 on any regression; a baseline with no current is a
  regression, a current with no baseline is a not-yet-accepted `new`), and `vr accept` (deliberately promote
  current → baseline; the gate never auto-updates). The engine is a **zero-dependency vendored PNG codec**
  (`node:zlib` builtin for inflate/deflate) + a **pixelmatch port** (YIQ perceptual delta + anti-aliasing
  detection), with `--mask "x,y,w,h;…"` for dynamic regions, `--threshold`/`--max-ratio` tolerances, and
  `--out`/`--out-dir` diff images. Constitutional split: the binary only *compares*; the host (figma-agent /
  preview) *renders*. Authoring brain `knowledge/visual-regression.md` (the render-environment flake rule).
- **`ui content-lint` — deterministic content / UX-writing floor (DESIGN-OS T4).** Static, precision-first,
  low-false-positive-only checks on UI microcopy: **errors** — lorem-ipsum, placeholder-copy (unfinished
  copy); **warnings** — click-here-link (WCAG 2.4.4), error-code-alone (a bare code with no human
  explanation), exclamation-overload, insensitive-terms (whitelist/blacklist/master-slave only),
  plural-s-hack (`item(s)` → use ICU MessageFormat), text-in-image, all-caps-shout. Prose linters
  (write-good/proselint/alex/Flesch–Kincaid) are deliberately excluded — they misfire on short imperative
  copy. Voice, tone and brand fit stay a curator (model) judgment against the tone-by-situation matrix in
  `knowledge/content-design.md`. Exit 1 on error-severity; `--json` envelope.
- **`ui flow lint` — deterministic IA linting for multi-screen flows (DESIGN-OS T3).** A `flow.json`
  models screens (each with its data-lifecycle states), transitions and entry points; `ui flow lint`
  runs 12 pure graph checks nobody else does deterministically: **errors** — dangling-ref,
  unreachable-screen, dead-end, missing-error-state (an async/submit transition on a screen with no
  `error` state), invalid-trigger, noop-self-loop, no-entry; **warnings** — orphan-screen,
  unreachable-state (a declared state nothing targets — decorative), missing-back-path,
  missing-empty-state/skeleton (for data modes), guard-without-complement. Guards are declared for
  linting/handoff, never executed (the deterministic guarantee). Schema `schemas/flow.schema.json`;
  authoring brain `knowledge/flow-craft.md`.
- **`ui a11y-lint` — Tier-1 static-HTML accessibility linter (DESIGN-OS T2).** Precision-first checks a
  parser can decide with no browser: img-missing-alt (1.1.1), html-lang (3.1.1), document-title (2.4.2),
  positive-tabindex (2.4.3), viewport-zoom-blocked (1.4.4), **icon-control-unnamed (4.1.2)** — an emoji/glyph
  or icon-only button/link with no accessible name (closes the recurring "emoji as a control" defect) — and
  heading-hierarchy (1.3.1/2.4.6, warnings). Exit 1 on error-severity findings. Honest by construction: a pass
  is **not** "accessible" and **not** "WCAG AA conformant"; rendered contrast, focus visibility/order, and
  alt-text quality need a browser (Tier 2) or a human and are explicitly out of scope.
- **`ui ds a11y` — token-pair contrast audit (DESIGN-OS T2).** For every text-role token × surface-role
  token (roles inferred from names, or pinned with `--pairs "text.muted:bg.default,..."`), computes the WCAG
  contrast ratio and flags any pair below AA (4.5:1), exiting 1. This catches the recurring secondary-text
  trap — muted/secondary text ~#8A-lightness on white ≈ 3.2:1 — at the *design-system* level, before a screen
  exists. Disabled/inactive roles are exempt (per SC 1.4.3). Honest by construction: it verifies **declared
  token pairs only** — not rendered contrast, not that a screen uses these pairs — and never emits the word
  "accessible"/"WCAG AA compliant" from a static run.
- **`ui changelog` — a readable design changelog (DESIGN-OS T1).** Folds the DS manifest's `changelog[]`
  (init / change-token / register) and the memory ledger's recorded `insight` decisions into a
  Keep-a-Changelog-style history — Added / Changed / Decisions, newest first, each line provenance-tagged
  (the acting command, or the `refs` behind a decision). Human- and model-readable; pure, read-only.
  `--dir`, `--format markdown|json`.
- **`ui ds docs` — decay-proof component documentation (DESIGN-OS T1).** Regenerates Markdown (or JSON)
  reference docs from the component registry + resolved token values: per component its variants, states,
  tokens-used (with resolved values), and a "consider adding" hint for commonly-missed states
  (focus/disabled/loading/error/empty). Because the docs are a pure function of the registry, they cannot
  drift out of sync the way hand-maintained docs do. `--dir`, `--out <file>`, `--format markdown|json`.
- **`ui ds diff` — semver + computed visual-breaking-change for a design system (DESIGN-OS T1).**
  Compares two DS states (dirs holding `design.tokens.json` + optional `component-registry.json` — the
  host materialises them from git refs) and classifies every token/component change as
  **breaking / additive / patch**, folding to a `recommendedBump` and (with `--base-version`) a
  `recommendedVersion`. Crucially it *measures* visual breakage instead of guessing: a colour change is a
  patch below an OKLab **ΔEOK** tolerance and breaking above it; a dimension change is a patch below a %
  tolerance and breaking above. A token removed while a component still lists it in `tokensUsed` is a
  **dangling** reference — forces major and exits 1. `--format markdown|json|pr-comment` (the last is a
  `gh pr comment`-ready summary). Pure, deterministic; the rules the model narrates from live in
  `knowledge/versioning-semver.md`.
- **`ui critique-coverage --require-evidence` (DESIGN-OS T0)** — closes the fabricated-criteria hole: an
  acceptance criterion with no `evidence` provenance is an **assumption**, never counted as real coverage
  (`evidencedCoveragePct`), and fails the gate. `curator.md` gains the matching honesty rules (coverage is a
  self-report; a11y is a hard floor above the style source; never claim "accessible" from a static check).
- **The recall loop closes (Track 9 · P4)** — `recall reflect <job-events.json>` assembles a job's
  own events plus the semantic neighbours memory already held, prints the Reflexion instruction
  ("extract ONE durable lesson — what was LEARNED, not what was said") and the exact
  `ui memory record insight --refs <job ids>` write-back. **recall never calls a model**: the host
  model that ran the job — the one still holding the brief, the curator verdict and the iterate
  rounds — is the reflector, and the lesson re-enters the ledger only through that provenance-checked
  command. The loop is wired into the job choreography (`knowledge/figma-craft/workflow-experience.md`
  §2d): START primes the generation prior with `recall query` → `ui memory context --rank-file`,
  LAND folds the job back in with `recall index` + `recall reflect`. Every step is optional and
  cold-start-safe, and a rank file is still never spliced into `--for critique`.
- **`recall/` — semantic memory over the design ledger (Track 9 · P3b + P3c)** — a new
  optional in-repo npm workspace (Node ≥ 22; never published, never imported by the binary).
  `recall index` pulls `ui memory export-corpus`, embeds it **locally** with
  `all-MiniLM-L6-v2` (ONNX — nothing leaves the machine) and upserts it into a rebuildable
  `sqlite-vec` index (vec0 KNN + FTS5 in one file), incrementally via a per-project cursor
  pinned in the index header alongside the model id and dimensions. Point it at `knowledge/`
  and the knowledge core is embedded into the same index, so one query surfaces a relevant
  persona rule *and* a past project insight. `recall query "<text>" --out ids.json` ranks by
  **RRF (dense KNN + BM25) × the memory graph's 30-day half-life decay × bi-temporal
  validity** — a token rationale superseded by a later change is demoted, never deleted, so it
  is only served when nothing current matches — and emits a rank file that feeds straight into
  `ui memory context --rank-file`. Two indexes: per-project `design/memory.vec.db` and
  cross-project `~/.ease-design/taste.vec.db`. A root test fails the build if anything under
  `src/` mentions the vector store, the embedder, or `node:sqlite`, so the `ui` binary stays
  zero-dependency / no-network / no-LLM. Driving doc: `knowledge/recall-mind.md`.
- **Recall seams on `ui memory` (Track 9 · P3a)** — two pure, deterministic subcommand
  surfaces that let an optional semantic-recall layer sit on top of the design memory without
  adding a single runtime dependency to the binary. `ui memory export-corpus [--since
  <eventId>]` walks the ledger and emits one natural-language payload per embeddable item,
  tagged by tier (`episodic` = recorded insights with provenance, `semantic` = token-change
  rationales + harvest sources, `procedural` = persona signatures + vibe→axis mappings);
  `--since` makes it incremental and it emits NDJSON (or a `--json` envelope). `ui memory
  context --rank-file <ids.json>` splices a recall-ranked selection of those items back into
  the emitted prior, in rank order and capped. The JSONL ledger stays the sole source of truth
  (any vector index is a rebuildable view), and a rank file is **never** spliced into
  `--for critique` — the taste gate stays craft-only.
- **`/ui:design` — scope-aware design of something NEW** (a screen or a component) from a
  requirement, distinct from rebuilding an existing frame (`/ui:to-figma`) or auditing one
  (`/ui:audit`). Detects **SCREEN vs COMPONENT** scope from the phrasing, runs an
  **understand-until-decision-ready** loop (rounds of sharp questions, prefer
  propose-a-default-to-confirm, never a wall), then runs the matching discipline — screen:
  objective → IA (`ux-psychology.md` + `mode-constraints.md` + persona) → compose from real DS
  instances (Recipe 18) grounded in `CONVENTIONS.md` → critique → land; component: registry
  lookup by NAME → create-new (walk the new `component-design.md` → component SET + states
  board + bind tokens + register) / extend-a-missing-variant / already-covered reuse. It
  composes existing capabilities and adds **no new `ui` binary command**; conforms the F0
  lifecycle + cost contract. New knowledge doc **`knowledge/figma-craft/component-design.md`**
  (the design brain for one component: anatomy → variant axes → states → edge cases →
  create-new-vs-extend). Wired into `workflow-experience.md` (two router rows), `ui guide`, and
  the knowledge index.
- **Behavioral web-clone (Track 5)** — rebuild a live site's *animation, interaction, and
  state*, not just its pixels. Five parts land in the `figma-agent` workspace:
  - **Converter core fills** — CSS `background-image` now paints as a real Figma IMAGE fill
    (the old blank-background bug is closed), `background-size` → scaleMode, `img.currentSrc`
    under srcset/`<picture>`/lazy, multi box-shadow spread → `clipsContent`, WebP fallback.
  - **Registry-driven font matching** — brand fonts + their CSS-stack fallbacks resolve
    against the installed Figma font set (cached `listAvailableFontsAsync`) before Inter.
  - **`figma-agent capture <url>`** — a Playwright hand that writes the unified per-URL folder
    `<slug>/capture/`: `manifest.json` (fonts + background-image bboxes + `<img>`/canvas/video),
    `behavior.json` (keyframes, transitions, hover/focus deltas, carousels with `autoplayMs`),
    `page.html`, `assets/`, `screenshots/`. Headed real-Chrome default, consent/hydration/scroll,
    graded WAF ladder (logged, never auto-escalated).
  - **Interaction + animation → Figma** — hover/focus state deltas become Default/Hover variant
    component sets with an `ON_HOVER` CHANGE_TO Smart-Animate reaction; captured keyframes become
    real Figma Motion tracks (`applyManualKeyframeTrack`), metronome-gated with variant fallback.
  - **Knowledge + templates** — intent-recipe 15 "Rebuild a live website on the canvas
    (with behavior)" + editable-vs-image heuristic + T1–T6 motion mapping; `from-url` gains a
    "Capture hostile/SPA sites" subsection; `to-figma` gains the capture→variants handoff.
- **Design Memory (`ui memory`)** — a per-project, append-only event ledger
  (`design/memory.events.jsonl`) + a deterministically compiled graph
  (`design/memory.graph.json`) + a cross-project taste profile under `~/.ease-design/`
  (override `EASE_DESIGN_HOME`). Seven pure subcommands — `record`, `compile`, `context`,
  `query`, `fingerprint`, `consolidate`, `status` — let the pipeline record what was
  picked / failed / edited / changed and read it back as a generation prior. Precedence is
  strict (brief > project memory > taste profile > `knowledge/` floors); memory biases
  generation and never scores critique. Stays deterministic / zero-dep / no-network / no-LLM.
- **`figma-agent/` in-repo workspace** — the Figma authoring "hands" (the `figma-agent`
  CLI + Figma Free plugin behind `/ui:to-figma`) now ship in this repo as an npm workspace
  instead of a separate external repository. Build from the root with
  `npm run build --workspace=figma-agent` (see `knowledge/figma-agent-hand.md`). It remains
  optional and outside the deterministic `ui` binary.
- **CI job for the figma-agent workspace** — a dedicated `figma-agent` job typechecks and
  builds the workspace on every push/PR so it can't silently rot; the four `ui` gates are
  unchanged.

## [0.1.0] - 2026-07-08

First public release: the multi-runtime design CLI — 12 `/ui:*` workflows, 8 skills,
a 17-command deterministic `ui` binary, the knowledge core (personas, taste rubric,
UX psychology, benchmark DNA, motion craft, Figma craft), and the Figma authoring track.

### Added
- **`knowledge/motion-craft.md`** — the animation **decision ladder** (T1 CSS transitions/
  keyframes → T2 View Transitions → T3 CSS scroll-driven → T4 Motion/anime.js → T5 GSAP →
  T6 authored Lottie/dotLottie · WebGL), so a variant needing motion beyond CSS follows
  doctrine instead of improvising. Carries **persona → tier caps** (a low-motion persona
  never ships GSAP), the non-negotiable **motion floors** (reduced-motion in every tier,
  transform/opacity-only, role-based durations, directional easing), copy-paste **CDN
  recipes** with the reduced-motion guard inline, choreography patterns, and anti-patterns.
  Lottie authoring is framed as an **external Text-to-Lottie hand** (like the figma-agent
  hand) — never bundled, the `ui` binary stays zero-network. Wired into `generate.md`,
  `critique.md`, and `slides.md`.
- **Two new `ui taste-lint` Motion checks** — `animation-no-reduced-motion` (a page that
  ships `@keyframes` / an `animation:` shorthand / a T4–T6 animation library `<script src>`
  but honors `prefers-reduced-motion` nowhere) and `keyframes-layout-props` (a `@keyframes`
  block animating a layout property — width/height/top/left/right/bottom/margin/padding —
  instead of transform/opacity). Both error-severity; they lift the deterministic Motion
  floor from 2 checks to 4.
- **`knowledge/ux-psychology.md`** — UX laws (Hick's, Fitts', Miller's, Von Restorff, …),
  Gestalt perception, cognitive biases, emotional design (Norman's three levels), trust
  building, cognitive-load management, and ethical persuasion, each with application
  rules and a final audit checklist. `generate.md` consults it selectively for heavy
  choice-architecture briefs (forms, pricing, funnels, dense nav). Ported from the
  figma-design-agent design-intelligence corpus.
- **`knowledge/benchmarks/`** — SOURCE-grade measured DNA captures (type ramps, weights,
  surfaces, shadow recipes, radius/gap scales, by usage count) for 8 ship-grade products:
  Arc, Figma, Framer, Linear, Notion, Raycast, Stripe, Vercel. 56 KB of JSON; the heavy
  PNG screenshots are deliberately not checked in (regenerable — see the README).
- **Excellence tier** in `knowledge/taste-rubric.md` + `critique.md` (opt-in, brief-driven,
  on top of the ≥7 gate): (1) correctness is a **gate, not a score** — validate-layout /
  taste-lint / autofix-idempotence / Consistency work list must be clean before any axis
  is scored; (2) **adversarial judging** — a fresh judge context (subagent where the
  runtime has them) that tries to refute each pass, never the maker grading its own work,
  plus a mandatory excellence round on pass; (3) the **reference duel** — the variant is
  duelled against the nearest benchmark DNA on measurable traits, evidence-anchored.
  The protocols consume rounds from the same ≤3-round cap.
- **`ui schema [--json]`** — machine-readable invocation contract for every `ui`
  (sub)command: positionals, flags (type/required/enums), documented error codes, and
  global flags/error codes. Nested per-subcommand signatures for the dispatcher commands
  (`ds`, `color`, `tokens`, `registry`, `edit-strategy`, `designmd`). A cross-consistency
  test pins every declared flag/error code to the command's `--help` text so the table
  cannot silently drift. The Codex adapter block now points agents at it before forming
  an invocation.
- **Central unknown-flag guard** — the schema signatures power a dispatcher-level flag
  guard: EVERY (sub)command now rejects unknown/misspelled flags with a did-you-mean
  hint (`UNKNOWN_FLAG`), extending the Phase-A per-command guard from 5 commands to all 16.
- **Skill/workflow discovery descriptions from template frontmatter** — all 18 templates
  now carry a `description:` (what + when + triggers); `ui init` sources the wrapper
  frontmatter from it via `readTemplateDescription()`. Kills the code-vs-template drift
  (the `SKILL_SUMMARIES`/`VERB_SUMMARIES` tables are gone) and fixes four
  previously-undiscoverable wrappers (`designmd-emit`, `figma-craft`, `from-url`,
  `to-figma`) that shipped a bare slug as their only discovery signal.
- **`ui strip-fences` full-document boundaries** — absorbs stray prose before
  `<!doctype`/`<html` and commentary after `</html>` (full documents only; fragments pass
  through untouched — no fuzzy first-tag guessing). `--json` reports
  `strippedLeading`/`strippedTrailing`. Now wired into `generate.md`'s raw→html step.
- **`ui scan`** — deterministic, read-only project scanner: detects existing design
  signals (framework, styling, CSS/HTML files, component directories, design-system
  status) and prints a routing verdict — greenfield, brownfield-code, brownfield-html,
  or ds-present.
- **`/ui:learn`** — brownfield onboarding workflow (12th workflow): runs `ui scan`,
  asks ONE question (learn from code, a URL, Figma, or start fresh), routes to
  `extract.md`, `from-url.md`, or `figma.md`, and compiles the project's own design
  system from that evidence — so `/ui:generate` output matches the product instead of
  a persona default.

### Changed (workflow templates — propagate via `ui init --force`)
- `generate.md`/`slides.md`/`redesign.md`/`from-ref.md` consume the DS context + Tailwind
  `@theme` pair via ONE call — `ui ds context --strict --with-theme` — retiring the
  separate `ui tokens compile` step and its "adjust the tokens path" foot-gun.
- `generate.md` + `critique.md` prompt skeletons converted from `[BRACKET]` labels to
  XML tags (`<role>`, `<persona_dna>`, `<design_system>`, `<design_tokens>`,
  `<mode_constraints>`, `<output_format>`, …) — instructions separated from large pasted
  data blocks; the output contract explicitly permits the leading `AI_CRITIQUE_LOG`
  comment.
- `generate.md` persona hardening: an anti-default steer (resolve ambiguity inside the
  persona's DNA, never regress to generic clean-modern-SaaS) + an empty-DNA self-STOP at
  the point the family file is read (substitute the next-highest scorer, tell the user).
  Universal Style Guide / Mode Constraints / a11y floors explicitly override persona
  latitude on conflict.
- `generate.md`/`extract.md`/`from-ref.md` split `ui ds init` failures by **argument
  provenance**: model-derived errors (`BAD_NAME`, `PERSONA_NOT_FOUND`, over-long
  `BAD_INTENT`) self-correct with exactly ONE retry; user-supplied/state errors
  (`BAD_BRAND_HEX`, `DS_TAMPERED`, `DS_EXISTS`) surface immediately.
- `iterate.md` recovers `DIFF_NO_MATCH` cheaply: repair the diff ONCE from the envelope's
  `data.unmatched[]` diagnostics (nearest-window + quoted old lines) before falling back
  to identity-risky full regen.
- `refine.md` gains the `ui validate-layout` structural floor that `iterate.md`/
  `redesign.md` already had — gate on error-severity findings introduced by a re-emit
  (pre-existing source errors exempt), restore the pre-pass copy instead of forwarding
  corrupted markup.
- `critique.md` refine rounds now **accumulate** their `AI_CRITIQUE_LOG` blocks (prepend,
  newest first) and feed a `<prior_attempts>` slot so a later round never re-applies a
  fix an earlier round already tried on the same axis.
- **Figma authoring track** — `/ui:to-figma` (11th workflow) + a `figma-craft` skill.
  ease-design can now author **idiomatic Figma** on the canvas (Figma Free) from intent —
  auto-layout, component instances, token-bound variables — not just HTML. Reuses the
  existing design brain (personas, tokens, critique gate) plus new Figma construction
  knowledge in `knowledge/figma-craft/` (craft philosophy, decision ladder, 5 deep-dive
  references, L1–L14 construction lints) and `knowledge/figma-agent-hand.md`. The Figma
  "hands" are an **external** `figma-agent` CLI (the figma-design-agent repo + a Figma
  plugin) — deliberately **not** bundled into the deterministic `ui` binary. Ported from the
  figma-design-agent project. Complements `/ui:figma` (which imports Figma → HTML).
- `ui guide` — plain-language, intent-organized map of the `/ui:*` workflow (the
  designer on-ramp). Root help points newcomers to it.
- `ui doctor` — install/project health check (Node ≥20, bundled `knowledge/` +
  `templates/` resolve, project manifest knowledgePath resolves). `--cwd` checks a project.
- `ui taste-lint` — deterministic taste-rubric floor under the model-scored critique:
  catches tiny body text, off-grid spacing, mixed icon families, pure-black shadows,
  linear/`all` transitions, and off-palette hex. Wired into `critique.md` as a binding gate.
- Proof gallery at `examples/generated/live-2026-05-30/` — real, gate-clean output across
  generate → iterate → redesign → extract, plus a dense-dark dashboard at the opposite taste
  extreme. Browsable `index.html`.
- `QUICKSTART.md`; `LICENSE` (MIT); `CONTRIBUTING.md`; this changelog.
- Release automation: `.github/workflows/release.yml` (tag-triggered, version-matched,
  provenance) + a `prepublishOnly` gate.
- `generate.md` Branch A gains a brownfield guard (step 0) — if `ui scan` reports the
  project is brownfield, it stops and points the user to `/ui:learn` instead of
  compiling a persona-default design system over existing UI.
- `ui init` — prints a next-step hint after install (brownfield projects point at
  `/ui:learn`, everything else at `/ui:generate`).
- Codex `AGENTS.md` block — its slash-command list is now derived from the verb
  registry instead of a hardcoded list, fixing drift that had left it missing
  `from-url`/`to-figma`.

### Fixed
- **Token→HTML loop**: `generate.md` (and `slides.md`, `redesign.md`) now compile DS tokens to
  a Tailwind `@theme` block and forbid arbitrary-hex utilities — generated HTML is token-bound
  (was emitting 100+ hardcoded hex per variant).
- **Knowledge delivery**: `ui init` resolves `knowledge/` to the package root and every adapter
  wrapper carries the absolute knowledge anchor, so a consumer install (npm/node_modules) can
  reach the knowledge core. Verified end-to-end via `npm pack` → clean install.
- **`applyLnDiff` over-deletion**: the exact-match path spliced the header range instead of the
  verified line count, silently deleting unverified neighbors. Now splices `oldLines.length`.
- **Pure-black shadows**: `SHADOW_MATRIX` hardcoded `#000000`; shadows are now tinted toward the
  persona's neutral hue (OKLCH-derived), satisfying the rubric and the `taste-lint` floor.
- **Critique gate coherence**: the `--strict` enforcement preamble no longer contradicts itself
  when the registry is empty on the first generation.

### Changed
- Version `0.0.0` → `0.1.0`; binary `--version` aligned to package.json (drift-guarded by a test).
- README rewritten: accurate counts, dual-audience (designer + developer), CLI-native positioning.

> Earlier history (v1 build — phases 1–7, the `ui` binary, knowledge core, 9 workflows,
> critique gate) predates this changelog; see the git log and `docs/journals/`.
