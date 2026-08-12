# Implementation Plan: Native Diagram Craft

**Branch**: `plan/diagram-craft-port` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md)

## Summary

Add one native diagram workflow and craft skill for three grammars, backed by four selectively loaded knowledge files and a thin deterministic `ui diagram lint` command. Product-flow remains a host-authored visual projection of lint-clean `flow.json`; the binary validates the artifact contract but does not render, route, fetch, or call a model.

## Technical Context

**Language/Version**: TypeScript 6, Node.js >=20; runtime-neutral Markdown for host workflows

**Primary Dependencies**: Node built-ins only in `ui`; existing adapter generator and linter utilities

**Storage**: Files only (`flow.json`, generated HTML, optional fidelity-ledger JSON)

**Testing**: Vitest; built-binary command tests; knowledge and adapter drift gates

**Target Platform**: macOS/Linux/Windows hosts supported by the existing CLI; offline artifact viewing

**Project Type**: Multi-runtime design CLI

**Performance Goals**: Static lint completes within the existing CLI-test budget for a 1 MiB artifact

**Constraints**: No network/model/browser in `ui`; no runtime dependencies; new code files <200 lines; deterministic findings
**Scale/Scope**: Three grammars, one workflow, one craft skill, one artifact linter, small golden fixture set

## Constitution Check

### Pre-design gate

- **Article I — PASS**: craft lives in `knowledge/`; deterministic checks live in `ui`; templates point to knowledge rather than copying it.
- **Article II — PASS**: host workflow is the emitter; `ui diagram lint` is the same-slice linter. No deterministic renderer is introduced.
- **Article III — PASS**: quickstart includes one real `flow.json` projection and full gate run.
- **Article IV — PASS**: accessible-SVG logic should reuse/extract an owning helper when an existing check has the same blind spot.
- **Article V — PASS**: tasks are detailed for Sonnet; deviations stop and report.
- **Articles VI–X — PASS**: isolated worktree, explicit files, four gates, modularity, and accessibility-first conflict resolution are recorded.

### Post-design gate

PASS. The contracts preserve the split: the host authors HTML/SVG; `ui` validates only decidable source properties. No constitution exception is required.

## Architecture

```text
request
  -> templates/workflows/diagram.md
  -> templates/skills/diagram-craft.md
  -> knowledge/diagram-craft.md
  -> one knowledge/diagram-grammars/*.md
  -> host writes HTML + inline SVG (+ fidelity ledger for product-flow)
  -> ui diagram lint
  -> existing a11y/layout/taste gates
  -> host critique

product-flow only:
flow.json -> ui flow lint -> host projection -> source-id audit + fidelity ledger
```

## Project Structure

```text
knowledge/
├── diagram-craft.md
└── diagram-grammars/
    ├── product-flow.md
    ├── architecture.md
    └── sequence.md
templates/
├── workflows/diagram.md
└── skills/diagram-craft.md
src/
├── commands/diagram.ts
└── core/
    ├── diagram-lint.ts
    └── diagram-svg-accessibility.ts
tests/
├── cmd-diagram.test.ts
├── diagram-lint.test.ts
├── adapters-diagram-routing.test.ts
└── fixtures/diagram/
specs/029-diagram-craft/
├── contracts/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

Existing shared registries and tests are amended in place: `knowledge/index.json`, `knowledge/README.md`, `src/cli.ts`, `src/core/command-signatures.ts`, `src/adapters/templates.ts`, `src/adapters/skill-refs.ts`, adapter/init/template tests, and command-schema tests where current patterns require them.

## Delivery Phases

1. **Knowledge + runtime routing**: write the shared craft contract and three grammar files; add one workflow/skill and register them for all adapters.
2. **Deterministic artifact gate**: tests first, then core checks, command surface, CLI/schema registration, focused fixtures.
3. **Integration proof**: generate adapters in a fresh temp project; run a real lint-clean flow through the host workflow; verify provenance/fidelity manually and run every machine gate.

## Test Strategy

- Write failing tests before each behavior: command errors/envelope, accessible SVG naming, unresolved placeholders, scripts/external assets, diagonal off-axis connectors, duplicate connector paths/attach points only where exact static equality makes the finding safe, project-token residue, deterministic sort order.
- Negative fixtures prove stylistic differences remain silent.
- Product-flow fixture proves `ui flow lint` blocks before projection and a valid source-id ledger survives generation.
- Re-run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `node dist/cli.js knowledge check`.

## Risks and Rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Static checks overclaim visual correctness | Limit checks to exact source facts; messages state what was checked | Remove the unsafe check without changing workflow/knowledge |
| Adapter count/hash drift | Dynamic registry parity tests plus fresh `ui init` proof | Revert registry/template slice together |
| Diagram knowledge duplicates taste/a11y | Cross-reference owning files; diagram docs contain only diagram-specific consequences | Collapse duplicated prose to links |
| Product-flow diagram becomes competing truth | Source IDs + derived-view declaration + mandatory fidelity ledger | Disable product-flow route while retaining other grammars |
| Upstream licensing/provenance ambiguity | Independent prose/code; cite source only in research record; copy no assets | Remove source attribution marker if no derived content remains |

## Acceptance Gate

- All spec functional requirements map to tasks and tests.
- Three and only three grammars are discoverable after fresh initialization.
- `ui diagram lint --json` follows the standard findings envelope and exit behavior.
- Golden artifacts pass focused diagram lint plus existing applicable gates; taste axes are reviewed by the host, not claimed by the binary.
- One real lint-clean `flow.json` projection shows resolvable source IDs and an honest fidelity ledger.

## Unresolved Questions

- None. Missing historical `plans/ease-design/brainstorm.md` is recorded as unavailable evidence, not an implementation choice.
