# Spec 022 — Stage 4 coordinator validation (r3)

**Verdict: YES**

Validated snapshot: `3b1d12585a34c761862ab6751ffdc840afdc18a33aa6278519ef1693e754a60b` (121 intended package/spec/test/handoff files before this validation record was added).

Authority reviewed:

- `.orchestration/handoffs/022-taste-transfer-prereg/02-spec-r2.md`
- `.orchestration/handoffs/022-taste-transfer-prereg/02-spec-r2-stage6-amendment.md`
- `.orchestration/handoffs/022-taste-transfer-prereg/02-spec-r3.md`
- `/private/tmp/fable-prereg-stage6-review.md`
- `/private/tmp/w022-r3.md`

## Independent gates

All commands were run by the coordinator after the r3 dispatch completed, not inferred from the worker report.

1. `node specs/022-taste-transfer-prereg/scripts/validate-prereg.mjs --mode pre-freeze --corpus /private/tmp/mengto-skills --json`
   - exit 0
   - 0 errors, 0 warnings
2. `npx vitest run tests/spec-022-*.test.ts`
   - 9 files passed
   - 232/232 tests passed
3. `npm run typecheck && npm run lint && npm run build`
   - all exit 0
   - ESM build success
4. `npm test`
   - 164 files passed
   - 2,553 passed, 6 skipped (2,559 total)
   - no Spec 022 test is skipped
5. `git diff --check`
   - clean
6. Forbidden runtime artifacts
   - `specs/022-taste-transfer-prereg/runs/`: absent
   - `specs/022-taste-transfer-prereg/randomization-commitment.json`: absent
   - `$HOME/.design-os/prereg-022/randomization-map.secret.json`: absent
7. Secret/dangerous-call scan
   - no API-key-shaped strings or private-key headers
   - no `eval(`, `shell: true`, or `child_process.exec(` findings
8. Stale-state scan
   - no `OWNER-PIN-PENDING`, active “freeze is blocked”, expected-RED, or current-media-blocker findings

Mutation-fixture validator errors printed during Vitest are intentional assertions; both focused and full suites exited 0.

## Requirement audit

- P7 projection uses role-indexed neutral asset aliases and rejects unknown assets.
- Judging bundles copy governed media under neutral names, verify hashes and path containment, produce real neutral brief facts, and scan planned/output identities before writes.
- Boundary matching is centralized and exercised by false-positive/true-positive tests.
- Frozen documentation describes the completed media pack and explicit owner amendment.
- Frozen-file completeness, commitment custody, sandboxed map tooling, no-secret leakage, and later-mode absence invariants have positive and mutation coverage.
- No render, paid generation, commitment, or secret map was created.

## Stage boundary

This YES authorizes freezing the intended preregistration snapshot for immutable Stage 5 and Stage 6 review. It does **not** authorize rendering. Rendering remains blocked until the preregistration commit passes fresh Codex Stage 5 and Fable Stage 6, lands through PR/CI, and is merged/frozen.
