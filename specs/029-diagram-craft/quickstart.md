# Quickstart Validation: Native Diagram Craft

## Prerequisites

```bash
npm ci
npm run build
```

## Focused Checks

```bash
npx vitest run tests/diagram-lint.test.ts tests/cmd-diagram.test.ts tests/adapters-diagram-routing.test.ts
node dist/cli.js diagram lint tests/fixtures/diagram/architecture-valid.html --json
node dist/cli.js diagram lint tests/fixtures/diagram/objective-failures.html --json
```

Expected: valid fixture exits 0 with no error findings; invalid fixture exits 1 with stable, actionable findings.

## Fresh Runtime Proof

Run `ui init` for each supported runtime in temporary directories. Confirm the generated wrappers discover one `diagram` workflow and one `diagram-craft` skill and point to the shipped templates/knowledge rather than embedding their content.

## Real Product-flow Proof

1. Select a real committed `flow.json`; run `ui flow lint` until it is clean.
2. Follow the generated diagram workflow to author a product-flow HTML artifact.
3. Run `ui diagram lint`, existing applicable static gates, and host taste critique.
4. Verify every visual node/edge resolves to a source ID and every compression appears in the fidelity ledger.
5. Record that rendered judgment is owner/manual; do not claim static checks prove accessibility or visual quality.

## Full Gates

```bash
npm run typecheck
npm run lint
npm run build
npm test
node dist/cli.js knowledge check
```
