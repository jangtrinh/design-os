# `/ui:from-url` — URL → portable DESIGN.md, the v1.x extension

**Date**: 2026-05-27
**Severity**: Low (additive feature; no v1 contract changes)
**Component**: `templates/workflows/from-url.md`, `templates/skills/designmd-emit.md`, `knowledge/designmd-format.md`, `src/adapters/*`, `tests/adapters-*`, three dogfood artifacts under `plans/260527-from-url-designmd/artifacts/`
**Status**: Shipped — v1.x feature complete, dogfooded against 3 URL classes

## Context

v1 closed five days ago. The host-model surface for ease-design was a
closed loop: read knowledge, run the binary, emit HTML, score with the
taste rubric. What it didn't do was emit a **portable brand spec** — a
document any coding agent could read, including ones outside the
ease-design family.

Google Labs publishes an open spec for exactly that artefact: a
`DESIGN.md` with a YAML token block and 8 ordered Markdown sections.
The brainstorm asked one question: *what's the minimum we ship to let
a user point at a URL and get back a valid `DESIGN.md`?*

Answer: a single workflow, a pinned spec reference, a tiny emit
recipe, and three lines of adapter wiring. No new subcommand. No new
dep. The deterministic binary contract from CLAUDE.md stays
untouched.

## What shipped

**Three new content files (Phase 1):**

- `knowledge/designmd-format.md` — the pinned on-disk spec reference.
  YAML schema, 8-section order, hex/dimension/reference format rules,
  versioning, and a closing section on how `DESIGN.md` differs from
  the internal `design/*.json` DTCG SSOT. ~180 lines.
- `templates/skills/designmd-emit.md` — compact "recipe" skill for the
  workflow's emit step. ~60 lines. Mirrors the shape of
  `templates/skills/token-model.md` (when to invoke / what to read /
  what to produce / self-check).
- `templates/workflows/from-url.md` — the workflow itself. 9 numbered
  steps mirroring `templates/workflows/extract.md`'s structural style,
  including the same closure-gate framing ("this workflow produces a
  spec document, so the 6+1-axis taste gate does not apply").

**Two registry edits (Phase 2):**

- `src/adapters/templates.ts` — `from-url` joined `WORKFLOW_VERBS`,
  `designmd-emit` joined `SKILL_NAMES`. Comment counts bumped.
- `src/adapters/skill-refs.ts` — `from-url` row added to
  `VERB_SKILL_REFS` listing the four skills the workflow invokes
  (`pick-persona`, `designmd-emit`, `color-decision`, `token-model`).

**Adapter header comments bumped** in `claude.ts` and `antigravity.ts`
to reflect the new counts (10 workflows + 7 skills = 17 artifacts per
runtime). `codex.ts` didn't carry explicit counts in prose so no edit
needed there. The three runtimes iterate the registries dynamically,
so `ui init` materialises `/ui:from-url` automatically for Claude,
Antigravity, and Codex.

**Test surface (Phase 2):**

- Five test files updated with positive presence assertions for
  `from-url` / `designmd-emit`:
  `adapters-claude.test.ts`, `adapters-antigravity.test.ts`,
  `adapters-codex.test.ts`, `cmd-init.test.ts` (counts bumped),
  plus the auto-iterating `adapter-cross-runtime.test.ts` and
  `adapters-templates.test.ts` (parity tests pick up the new entries
  through the registry).
- Suite grew from **625 tests / 43 files** → **627 tests / 43 files**.
  All green.

**Dogfood (Phase 3):**

Three real public URLs, three artifacts saved at
`plans/260527-from-url-designmd/artifacts/`:

- `stripe-DESIGN.md` — SSR marketing page. 6 colours, 5 typography
  slots, 6 components. WebFetch carried the fetch.
- `nextjs-docs-DESIGN.md` — static docs site. 9 colours, 6 typography
  slots, 7 components. WebFetch carried the fetch.
- `vercel-spa-DESIGN.md` — JS-rendered marketing surface. 7 colours,
  6 typography slots, 7 components. WebFetch returned enough rendered
  content; the bb-browser MCP fallback rung was not triggered.

All three pass the workflow's closure self-check: 8 sections in spec
order, no duplicate headings, every `{ref}` resolves, every hex is
`"#RRGGBB"`, every dimension is `<n>px|em|rem`.

## Key decisions

**Workflow-only, no `ui designmd validate` subcommand.** The brainstorm
listed three approaches (workflow-only; workflow + DTCG bridge; spec as
first-class alt SSOT). We picked the smallest: a workflow that emits
`DESIGN.md` and stops. The binary stays deterministic and no-network.
Adding a deterministic validator is a v1.y conversation — the workflow's
step-9 self-check is sufficient for the artefact this version emits.

**Closure step is format self-check, not the taste rubric.** Same
rationale as `/ui:extract` step 10: the 6+1-axis critique gate scores
*rendered HTML* against a persona's craft targets. A spec document
has no pixels to score. The workflow says this out loud to the user
so the absence of taste scoring isn't read as an oversight.

**Knowledge file pins the spec, not the workflow prose.** Format
rules (hex shape, dimension shape, section order) live in
`knowledge/designmd-format.md` as the contract. The workflow and the
skill reference the file rather than restating the rules. When Google
moves the spec from alpha → beta, the diff lands in one file, not
three.

**Component names go lowercase-hyphenated in DESIGN.md YAML.** The
internal registry uses `Category/Variant` PascalCase; the open
`DESIGN.md` spec uses lowercase keys. The workflow translates between
the two conventions rather than fighting either.

## Risks accepted

- **Spec drift when Google moves to beta.** Pin in
  `knowledge/designmd-format.md` is dated 2026-05-27. Future updates
  are a one-file knowledge diff, not a code diff. Acceptable.
- **No deterministic validator.** Step-9 self-check runs in the host
  model. If the model emits invalid YAML, the user finds out at read
  time. Acceptable for v1.x; v1.y candidate.
- **bb-browser MCP fallback unexercised in this round.** All three
  dogfood URLs succeeded on WebFetch. Synthetic fixture for the JS-only
  case is a v1.y nice-to-have, not a v1.x blocker.
- **Format-translation between `DESIGN.md` ↔ `design/*.json` is permanently
  fragile.** Composite tokens, alias graphs, missing semantic roles.
  Acknowledged in the dogfood doc and deferred until a user actually
  asks for it.

## Next

`/ui:from-url` is shipped end-to-end. Likely follow-ups, in order of
expected demand:

1. `ui designmd validate <file>` — deterministic linter for the closure
   self-check. ~150 LoC, ~10 tests. Trivial scope.
2. `ui designmd export <file> --target dtcg|tailwind` — bridge from the
   open spec to ease-design's internal SSOT or to a Tailwind config.
   Higher scope; format translation is the load-bearing surface.
3. Synthetic dogfood case for a JS-only target (auth-walled SPA, empty
   shell from a non-WebFetch-friendly framework) to exercise the
   bb-browser MCP rung.

None of these is blocking. v1.x is feature-complete.
