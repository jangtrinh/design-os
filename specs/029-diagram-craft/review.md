# Implementation Review: Native Diagram Craft

## Scope

- Base: `cfcb690`
- Implementation: `eb15130`
- Review fixes: `6d8abef`, `a35a1b6`, `4871caa`

## Opus Review

Initial review found two blockers: safety checks only scanned the owned SVG, and valid
single-quoted attributes changed the verdict. It also found incomplete relative/CSS reference
coverage, commented-markup false positives, and non-normalized line geometry.

All findings were reproduced with failing tests, fixed, and focused re-reviewed. The first
re-review found CDATA CSS and active `data:` URI bypasses; both were reproduced, fixed, and
the second re-review returned `PASS`.

## Codex Cross-check

Codex confirmed the CLI envelope/schema integration and added coverage for valid unquoted
attributes, product-flow `flow-json` provenance, and installed-workflow knowledge paths.
It also removed false knowledge authority: no nonexistent chart skill, no spec-path dependency
from evergreen knowledge, and no relative Markdown links that would resolve inside runtime
adapter directories.

## Verification Boundary

Static checks, adapter generation, build, and knowledge governance are automated. Rendered
composition, Tier-2 accessibility, and the real product-flow projection remain owner/manual.
No committed `flow.json` exists on this branch, so the real-data proof is explicitly
unavailable rather than replaced with a synthetic claim.

## Fable Final Audit

Fable's final audit found three contract blockers, distinct from the Opus/Codex findings
above:

1. **Product-flow node/edge vocabulary drifted from `schemas/flow.schema.json`.**
   `knowledge/diagram-grammars/product-flow.md` invented `decision`, `action`,
   `system-event`, `exit`, and `terminal-error` node types and `conditional`/
   `auto-transition`/`back-edge` edge types with their own ID namespaces — none of which
   exist in the flow schema, which defines only `screens[]` (with `states[]` and a
   `terminal` boolean), `transitions[]`, and `entryPoints[]`.
   **Fixed** — the node vocabulary now maps 1:1 to `screen`, `screen-state`
   (`screenId.stateId`), and `entry`; the edge vocabulary maps 1:1 to `transition`.
   `terminal` is documented as a boolean field on a `screen` node, not a separate node
   kind; guard/`AFTER_DELAY`/back-edge are documented as rendering treatments on the one
   real transition, not additional typed IDs.
2. **Validation ownership was stated dishonestly.** The grammar file and the workflow
   implied `ui flow lint` and `ui diagram lint` together prove a diagram's
   `data-source-id`s resolve against `flow.json` and that the fidelity ledger is
   complete. Neither command does either: `ui flow lint` never opens a diagram artifact,
   and `ui diagram lint` (`src/core/diagram-lint.ts`) only checks that a
   `data-source-id` attribute is *present* on product-flow nodes/edges — it has no
   filesystem access to `flow.json` and cannot resolve the value.
   **Fixed** — both `knowledge/diagram-grammars/product-flow.md` and
   `templates/workflows/diagram.md` now state explicitly what each lint owns and name
   cross-artifact source-ID resolution and fidelity-ledger completeness as manual audit
   steps.
3. **The workflow ran a bespoke four-axis critique instead of the product's real taste
   gate.** `templates/workflows/diagram.md` §6 scored diagrams against
   Legibility/Honesty/Restraint/Consistency — a parallel rubric that never invoked
   `ui taste-lint` and never referenced the project's actual 6+1 axis model in
   `knowledge/taste-rubric.md`.
   **Fixed** — §6 now runs `ui taste-lint` where applicable and scores the full 6+1 axis
   taste rubric (Layout, Typography, Spacing, Motion, Iconography, Depth/Surface, plus
   the systems axis Consistency) against the standard ≥7/10 gate, folding
   grammar-specific invariants into Layout/Consistency rather than scoring them
   separately.

Regression coverage for all three fixes lives in `tests/adapters-diagram-routing.test.ts`.
T016 and T025 in `specs/029-diagram-craft/tasks.md` remain open: no real `flow.json` was
fabricated to close them, and the product-flow grammar stays blocked on the real-data
proof pending an owner-supplied fixture.

## Opus Focused Review

A follow-up focused pass found six smaller issues in the Fable-audited material — one
inaccuracy (I1), one test-coverage gap (I2), and four medium documentation/test-precision
issues (M1–M4). None reopen the three blockers above; all are fixed:

1. **I1 — Fidelity-ledger example IDs were schema-ambiguous.** The illustrative table in
   `knowledge/diagram-grammars/product-flow.md` used invented IDs like
   `screen.confirm-a` and `t.retry-submit`, which read as if the schema defines a
   `screen.`/`t.` prefix convention — it doesn't, and the dot in `screen.confirm-a` is
   ambiguous with the real `screenId.stateId` screen-state format.
   **Fixed** — the table now uses plain, prefix-free illustrative IDs (`confirm-a`,
   `retry-submit`, `session-heartbeat`) with a preceding note stating the table is
   illustrative of shape only, and that a real ledger cites actual `flow.json` IDs.
2. **I2 — Adapter contract tests only checked vocabulary strings, not the actual
   mapping.** `tests/adapters-diagram-routing.test.ts` asserted that words like
   `screen-state` and `transitions[]` appeared somewhere in the doc, without checking
   that the `screen-state` row's `data-source-id` value is literally `screenId.stateId`
   or that the `transition` row's value is literally "the transition's `id`".
   **Fixed** — added two tests that parse the specific table row and assert its exact
   last-column value.
3. **M1 — Validation-ownership assertions were OR-combined, hiding which half was
   actually tested.** One test matched `does not (?:read|open) flow.json|no access to
   flow.json|never opens? a diagram` — any single branch could pass while the other fact
   went unasserted.
   **Fixed** — split into two independent tests: one asserting `ui flow lint` never
   opens a diagram artifact, one asserting `ui diagram lint` has no access to
   `flow.json`. Added a matching assertion in `templates/workflows/diagram.md`'s test
   block for the flow-lint side, which previously covered only the diagram-lint side.
4. **M2 — Derived-view metadata implied automated verification it doesn't have.** The
   `derived-view` YAML block's `lint: passed` field named no automated check that
   parses or verifies it, and didn't say which of the two lints (flow vs. diagram) it
   referred to.
   **Fixed** — the block now declares `flow-lint: passed` and `diagram-lint: passed`
   separately, with prose stating the whole block is self-declared by the diagram's
   author and not machine-verified.
5. **M3 — No test explicitly proved the syntactic-presence-only boundary.** The lint
   test suite covered "flags a missing `data-source-id`" and "passes when present," but
   nothing named the intentional gap: a `data-source-id` that syntactically exists but
   names nothing real in any `flow.json` still passes, because the lint never opens
   `flow.json`.
   **Fixed** — added a test in `tests/diagram-lint-flow-and-geometry.test.ts` using
   obviously nonexistent IDs (`no-such-screen-in-any-flow-json`, etc.) asserting a clean
   pass, titled to document the boundary as intentional.
6. **M4 — Incorrect section cross-reference in `templates/workflows/diagram.md`.**
   §5's gate-failure guidance said "that is a substitution or a stop — handle it per
   §7," but §7 (Disclosure) only covers the substitution half; stop handling is owned by
   §9 (Outputs and honest stops), which explicitly lists "Gate stop" for this exact
   scenario.
   **Fixed** — the sentence now points substitutions to §7 and stops to §9, with no
   change to supported-grammar behavior.

All fixes are confined to four implementation-owned files for this round:
`knowledge/diagram-grammars/product-flow.md`, `templates/workflows/diagram.md`,
`tests/adapters-diagram-routing.test.ts`, and
`tests/diagram-lint-flow-and-geometry.test.ts`. The schema and flow model were read-only
references. No `flow.json` was fabricated;
T016/T025 remain open as above.

**Verification note:** `npx vitest run tests/adapters-diagram-routing.test.ts
tests/diagram-lint-flow-and-geometry.test.ts` could not be executed in this session —
the Bash tool required an approval that this session could not obtain, across multiple
invocation forms (`npx`, `npm test`, the local `vitest` binary directly, with and
without sandbox override). All new/changed assertions were instead hand-traced against
the exact current file contents (table row splitting, literal phrase matches) to confirm
they pass. The controller then ran the focused suite outside that sandbox: both test
files passed, 36 tests total, followed by clean typecheck, lint, and build gates.

## Fable Re-audit

Fable confirmed the three original contract blockers and both Opus important findings are
closed at `031fcf1`. Architecture and sequence are release-ready. The combined change is
still blocked from merge because runtime discovery exposes product-flow without the real
committed `flow.json` proof required by T016/T025.

The release gate remains explicit: either complete the owner-supplied real-flow projection
and manual source-ID, ledger, reading-order, and rendered-quality audit, or remove
product-flow from runtime discovery into a follow-up change. This branch keeps the approved
three-grammar architecture intact and therefore remains a draft rather than silently
shrinking scope or fabricating evidence.
