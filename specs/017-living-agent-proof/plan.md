# Living Agent Proof - Technical Plan

## Phase 1: Contract

- Add a strict evolution-proof JSON schema.
- Model source evidence, applied-memory receipts, defect-learning records, comparisons, and
  contradiction/isolation checks.
- Keep references as durable paths or evidence IDs; never embed external project content.

## Phase 2: Deterministic proof engine

- Add a Python proof reader and validator beside `evolution_core.py`.
- Compute the highest supported level: ALIVE, LEARNING, APPLIED, IMPROVING.
- Emit actionable reason codes for every blocked level.
- Diagnose nested stores, missing heartbeat state, and unresolved correction ledgers.

## Phase 3: CLI

- Extend `design-os evolution` with `--proof <path>`.
- Preserve the existing loop verdict and exit-zero health-report behavior.
- Add proof data and diagnostics to JSON and concise evidence lines to text.

## Phase 4: Dogfood evidence

- Create a read-only forensic evidence package for:
  - ease-design: user feedback to orchestration and benchmark changes.
  - VSF-PCP: ratified identity and project memory, with missing application evidence exposed.
  - platform-design-system: defect-to-gate evolution with negative fixtures and later detections.
- Do not claim controlled creative improvement until a true memory-on/off run exists.

## Phase 5: Verification and review

- Unit-test each proof level and failure mode.
- Live-read both external projects when present, skipped in CI when absent.
- Run Python, TypeScript, lint, build, and full repository tests.
- Run the full review gate and repair all blocking findings.

## Success criteria

- Every APPLIED claim has a source, later receipt, decision, and artifact.
- Every prevention claim has an escaped defect, correction, gate, negative fixture, and later run.
- IMPROVING requires controlled inputs, blind evaluation, thresholds, and zero regressions.
- External project stores remain unchanged.
- The final report clearly separates achieved levels from remaining proof work.
