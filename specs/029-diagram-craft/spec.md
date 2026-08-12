# Feature Specification: Native Diagram Craft

**Feature Branch**: `plan/diagram-craft-port`
**Created**: 2026-08-12
**Status**: Draft
**Input**: Distill the useful craft from `cathrynlavery/diagram-design` into a native DESIGN:OS capability without importing its plugin architecture or visual system.

## User Scenarios & Testing

### User Story 1 — Create and critique an on-system diagram (Priority: P1)

A practitioner describes a relationship that is clearer visually than in prose. The workflow selects one supported grammar, generates a self-contained diagram in the project's visual language, and critiques it against applicable design standards.

**Why this priority**: This is the smallest independently useful slice: one request becomes one reviewable, project-branded diagram.

**Independent Test**: Request architecture and sequence diagrams in projects with and without tokens; verify each result is one offline-openable HTML file with an inline SVG, declared grammar, reading order, focal element, and critique.

**Acceptance Scenarios**:

1. **Given** a system-components brief and project tokens, **When** the workflow runs, **Then** it selects architecture, explains the match, and uses the project system.
2. **Given** a time-ordered exchange, **When** the workflow runs, **Then** it selects sequence and preserves participant/message order.
3. **Given** a request outside the three supported grammars, **When** it is evaluated, **Then** the workflow declines, names the closest fit, and states the information that fit would lose.
4. **Given** no project tokens, **When** a diagram is generated, **Then** a documented neutral fallback is used and disclosed.
5. **Given** an existing generated diagram, **When** critique runs, **Then** applicable taste axes receive scores and located repair guidance.

---

### User Story 2 — Project a product flow without losing meaning (Priority: P2)

A practitioner turns an existing product flow into a readable visual projection. The flow remains the semantic truth; the diagram remains traceable to it, and every simplification is visible.

**Why this priority**: It extends DESIGN:OS's existing flow capability instead of creating competing semantics.

**Independent Test**: Project a valid flow that requires one collapse; verify all visible elements retain source identifiers and the collapse appears in the fidelity ledger.

**Acceptance Scenarios**:

1. **Given** a flow with blocking lint findings, **When** projection is requested, **Then** no diagram is produced and the findings are returned.
2. **Given** a lint-clean flow, **When** projection runs, **Then** each visual node and edge resolves to its source identifier.
3. **Given** readability requires a merge, collapse, or drop, **When** output is delivered, **Then** the fidelity ledger names the action, affected identifiers, and reason.
4. **Given** an element is dropped, **When** fidelity is summarized, **Then** the projection is not described as complete.
5. **Given** a completed projection, **When** source files are inspected, **Then** the flow is unchanged and the diagram declares itself a derived view.

---

### User Story 3 — Receive deterministic artifact-gate feedback (Priority: P3)

A practitioner checks a generated or hand-edited diagram and receives stable, actionable findings for objective failures while subjective composition stays with critique.

**Why this priority**: It protects the artifact boundary after generation exists without turning taste into brittle static rules.

**Independent Test**: Run planted invalid and debatable-but-valid fixtures repeatedly; verify only the objective failures are returned, in stable order, with an element and remedy.

**Acceptance Scenarios**:

1. **Given** an objective diagram-contract failure, **When** lint runs, **Then** it identifies the offending element and concrete remedy.
2. **Given** a stylistically debatable but contract-valid diagram, **When** lint runs, **Then** it emits no error for that judgment.
3. **Given** the same artifact, **When** lint runs repeatedly, **Then** findings are identical in content and order.
4. **Given** accessibility, layout, or taste issues, **When** all checks run, **Then** each owning check reports once without duplication or suppression.
5. **Given** zero objective failures, **When** lint runs, **Then** it returns a clean, gateable result.

### Edge Cases

- A valid empty or single-node product flow yields an honest minimal projection.
- Cycles and back-edges remain explicit; they are never silently broken.
- A flow too large for one readable view triggers a scope/split decision rather than a dense artifact.
- Project tokens that fail accessibility are overridden only as required, with the conflict disclosed.
- Duplicate labels remain distinguishable through stable source identifiers.
- Long labels, non-Latin scripts, and right-to-left text remain readable without changing meaning.
- Broken or stale provenance references are reported, never auto-repaired.
- A user-forced grammar that conflicts with the content produces a mismatch warning before generation.

## Requirements

### Functional Requirements

- **FR-001**: The capability MUST expose one runtime-neutral workflow for selection, generation, gating, and critique.
- **FR-002**: Version 1 MUST support exactly product-flow projection, architecture, and sequence.
- **FR-003**: The workflow MUST decline unsupported diagram intents rather than invent a grammar.
- **FR-004**: Each deliverable MUST be one self-contained HTML artifact with an inline SVG and no view-time external dependency.
- **FR-005**: The workflow MUST use project design tokens and stance when present; fallback use MUST be disclosed.
- **FR-006**: Accessibility MUST override conflicting stylistic choices, and the substitution MUST be reported.
- **FR-007**: Product-flow projection MUST require a lint-clean source flow and MUST NOT modify it.
- **FR-008**: Every projected product-flow node and edge MUST retain a resolvable source identifier.
- **FR-009**: Every merge, collapse, and drop MUST appear in a fidelity ledger with affected identifiers and rationale.
- **FR-010**: A projection with any unrepresented source semantics MUST NOT claim full fidelity.
- **FR-011**: Architecture output MUST establish zones, hierarchy, one dominant reading direction, and independently traceable connectors.
- **FR-012**: Sequence output MUST preserve participant order, message order, direction, and relevant branches.
- **FR-013**: Every SVG MUST have a meaningful accessible name and description with resolving, artifact-unique identifiers.
- **FR-014**: The diagram gate MUST report only safely decidable artifact-contract failures.
- **FR-015**: Each gate finding MUST identify its owner element and a concrete next action.
- **FR-016**: Gate findings and ordering MUST be deterministic for identical input.
- **FR-017**: The diagram gate MUST compose with existing accessibility, layout, and taste checks without cloning their responsibilities.
- **FR-018**: Critique MUST score all applicable taste axes and locate actionable revisions.
- **FR-019**: Every generated artifact MUST declare its grammar, reading order, focal element, and source/provenance status.
- **FR-020**: The feature MUST independently express the learned principles and MUST NOT copy upstream prose, skins, fonts, palettes, icons, templates, or examples.

### Key Entities

- **Diagram request**: intent, audience, destination, and desired level of detail.
- **Diagram grammar**: one of the three bounded visual vocabularies and its semantic invariants.
- **Diagram artifact**: self-contained HTML, inline SVG, accessibility metadata, and declared visual intent.
- **Flow source**: read-only semantic authority for product-flow projection.
- **Provenance reference**: stable trace from a projected visual element to its source element.
- **Fidelity ledger**: explicit record of merges, collapses, drops, affected identifiers, and rationale.
- **Diagram finding**: deterministic objective failure with severity, element location, and repair.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Independent reviewers identify the intended reading order and focal element without explanatory prose for every golden specimen.
- **SC-002**: Zero source elements disappear from golden product-flow projections without a matching fidelity-ledger record.
- **SC-003**: 100% of projected product-flow nodes and edges resolve to valid source identifiers.
- **SC-004**: In tokenized projects, every color, type, and spacing choice traces to project tokens or a disclosed accessibility substitution.
- **SC-005**: Every golden specimen has zero diagram-gate errors and zero applicable accessibility/layout gate errors.
- **SC-006**: Every golden specimen scores at least 7/10 on each applicable taste axis.
- **SC-007**: Repeated lint runs over the same artifact return identical findings and ordering.
- **SC-008**: Every unsupported request is declined with a closest-fit option and explicit information-loss warning.
- **SC-009**: Every diagram-gate finding names a specific element and repair; zero findings are subjective taste opinions.
- **SC-010**: All golden artifacts render with network access disabled.

## Assumptions

- Existing project tokens, soul, taste rubric, accessibility rules, and generic layout checks remain authoritative.
- `flow.json` and `ui flow lint` remain the product-flow semantic contract and preflight.
- Host models author the diagram; only artifact checks inside `ui` are deterministic.
- A small golden set covers all three grammars, token/fallback modes, and one compressed product flow.
- The initial workflow produces standalone artifacts; embedding into other delivery workflows is optional follow-up work.
- Imports, exports, charts, URL onboarding, a universal diagram DSL, deterministic auto-layout/rendering, browser dependencies, and the upstream gallery are outside v1.
