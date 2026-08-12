# Tasks: Native Diagram Craft

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/](contracts/)

**Tests**: Required and written before implementation. Each behavioral test must fail against pre-feature HEAD before its implementation task begins.

## Phase 1: Re-anchor and Shared Contract

- [ ] T001 Re-verify every plan path and registry/count assertion against current HEAD; record any drift in `specs/029-diagram-craft/research.md` before code
- [ ] T002 [P] Add failing knowledge-index/provenance expectations for the four new knowledge files in existing `tests/knowledge-*.test.ts` ownership sites
- [ ] T003 [P] Add failing template registry/routing expectations for workflow `diagram` and skill `diagram-craft` in `tests/adapters-diagram-routing.test.ts`
- [ ] T004 [P] Create negative and valid golden source fixtures under `tests/fixtures/diagram/` with no copied upstream prose/assets

## Phase 2: User Story 1 — Create and Critique On-System Diagrams (P1) 🎯 MVP

**Independent Test**: Fresh initialization exposes one diagram workflow and craft skill; each supported brief routes to exactly one grammar and the workflow requires project tokens/fallback disclosure plus existing gates/critique.

- [ ] T005 [P] [US1] Write the shared selection, deletion, density, token, accessible-SVG, output, and critique contract in `knowledge/diagram-craft.md`
- [ ] T006 [P] [US1] Write architecture-specific semantics, zones, hierarchy, reading direction, connectors, budgets, and failure modes in `knowledge/diagram-grammars/architecture.md`
- [ ] T007 [P] [US1] Write sequence-specific participant/message/branch ordering, connector, label, and failure-mode rules in `knowledge/diagram-grammars/sequence.md`
- [ ] T008 [US1] Add frontmatter-derived entries for all new knowledge files via the repository's knowledge-index emitter; update the human table in `knowledge/README.md` without hand-editing generated authority
- [ ] T009 [P] [US1] Create the thin craft router at `templates/skills/diagram-craft.md`, pointing to shared knowledge and loading only the selected grammar
- [ ] T010 [US1] Create `templates/workflows/diagram.md` for decide → context → grammar → author → lint → generic gates → critique, including unsupported-intent refusal and fallback disclosure
- [ ] T011 [US1] Register `diagram` and `diagram-craft` in `src/adapters/templates.ts` and `src/adapters/skill-refs.ts`; update only current dynamic/static count assertions proven by failing tests
- [ ] T012 [US1] Run `tests/adapters-diagram-routing.test.ts` plus existing adapter/template/init suites; perform a fresh `ui init` proof for every supported runtime

## Phase 3: User Story 2 — Product-flow Projection Integrity (P2)

**Independent Test**: A real lint-clean `flow.json` produces a derived product-flow artifact whose node/edge source IDs resolve and whose ledger records every compression; a failing flow produces no artifact.

- [ ] T013 [P] [US2] Add failing routing/contract assertions for flow preflight, source-ID preservation, derived-view declaration, and fidelity ledger to `tests/adapters-diagram-routing.test.ts`
- [ ] T014 [US2] Write product-flow projection semantics and the boundary against decision flowcharts/state machines in `knowledge/diagram-grammars/product-flow.md`
- [ ] T015 [US2] Extend `templates/workflows/diagram.md` with mandatory `ui flow lint` preflight, source-ID mapping, fidelity-ledger accounting, and no-source-mutation checks
- [ ] T016 [US2] Run the workflow once against a real committed `flow.json`; store only the smallest reviewable fixture/evidence under `tests/fixtures/diagram/` and record owner-manual rendered judgments in `specs/029-diagram-craft/quickstart.md`

## Phase 4: User Story 3 — Deterministic Artifact Gate (P3)

**Independent Test**: Planted objective failures return stable standard-envelope findings; stylistic differences remain silent; valid artifacts exit 0.

- [ ] T017 [P] [US3] Write failing pure-core tests in `tests/diagram-lint.test.ts` for every owned check and each false-positive boundary in `contracts/diagram-lint-cli.md`
- [ ] T018 [P] [US3] Write failing command tests in `tests/cmd-diagram.test.ts` for help, flags, file errors, text/JSON envelopes, exit codes, and deterministic ordering
- [ ] T019 [US3] Implement SVG accessible-name parsing/checks in `src/core/diagram-svg-accessibility.ts`, extracting a shared helper only if current a11y ownership proves overlap
- [ ] T020 [US3] Implement the remaining exact source checks and stable result model in `src/core/diagram-lint.ts`; omit any check that cannot meet the planted negative fixture without false positives
- [ ] T021 [US3] Implement file IO and result rendering in `src/commands/diagram.ts`, keeping core logic filesystem-free
- [ ] T022 [US3] Register the command in `src/cli.ts` and current machine-readable command schema owner `src/core/command-signatures.ts`; update relevant schema/help tests
- [ ] T023 [US3] Run focused diagram tests and prove they fail on pre-feature HEAD then pass on implementation; record any intentionally omitted unsafe check in `specs/029-diagram-craft/research.md`

## Phase 5: Integration, Review, and Delivery Gates

- [ ] T024 Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `node dist/cli.js knowledge check` from this worktree
- [ ] T025 Run the quickstart's valid/invalid CLI fixtures and the real product-flow proof; report static-vs-rendered claim boundaries honestly
- [ ] T026 Cross-check every spec FR/SC against landed files and evidence; update user-visible README/guide only if discovery is otherwise incomplete
- [ ] T027 Route the full diff through independent Opus + Codex implementation review; reproduce blockers before fixing and run focused re-review
- [ ] T028 Route reviewed work through the Fable final audit gate; do not mark complete or merge before alignment is confirmed

## Dependencies and Execution Order

- T001 blocks all implementation.
- T002–T004 may run in parallel after T001.
- US1 is the MVP and blocks US2 workflow integration; US3 core tests may start after T004 but command/registry edits must serialize with US1 shared registries.
- T013 precedes T014–T016. T017–T018 precede T019–T022.
- T024–T028 are sequential closing gates.

## File Ownership

Use one Sonnet executor in this worktree because `templates/workflows/diagram.md`, registries, and integration tests cross stories. If work is split later, knowledge-only files may run in parallel; shared registries and command surfaces remain single-owner.

## MVP Scope

Phases 1–2 provide independently useful architecture/sequence authoring and critique. Product-flow integrity and machine gating follow without broadening beyond the approved three-grammar slice.
