VERDICT: YES

# Stage 4 validation — Spec 022 preregistration first freeze

Date: 2026-07-26
Worktree: `/Users/jangtrinh/orca/workspaces/ease-design/taste-transfer-prereg`
Scope: current working tree on `jangtrinh/taste-transfer-prereg`; no renders or randomization commitment exist.

## Deterministic gates

- `node specs/022-taste-transfer-prereg/scripts/validate-prereg.mjs --mode pre-freeze --corpus /private/tmp/mengto-skills --json`
  - exit 0
  - 0 errors, 0 warnings
- `npx vitest run tests/spec-022-prereg.test.ts`
  - 36/36 pass
- `npm run typecheck && npm run lint && npm run build && npm test`
  - exit 0
  - typecheck pass
  - lint pass
  - build pass
  - 156 test files pass
  - 2,357 tests pass; 6 skipped
- `git diff --check`
  - exit 0
- targeted secret/dangerous-call scan over Spec 022
  - 0 findings

## Real-contract checks

- Corpus-backed validation used `/private/tmp/mengto-skills` pinned at `21b278c`.
- Media manifest contains 30 real Wikimedia Commons-derived assets in exact role counts:
  - wide 9
  - macro 6
  - headshot 4
  - portrait 4
  - directory-headshot 6
  - presskit-headshot 1
- Every asset records local SHA-256, source page, original URL, downloaded derivative URL, source SHA-1/revision timestamp, creator, licence label/URL, role, dimensions, and crop method.
- Real-person assets include a non-identity/non-endorsement disclaimer.
- Visual contact-sheet audit passed all 30 assets after replacing one weak speaker candidate.
- PR-014 was hardened with mutation tests for invented provenance, ratio mismatch, and JPEG dimensions.

## Protocol checks

- 121 selection records, 12 candidates.
- Phase A: 16 briefs, 32 artifacts maximum.
- Phase B: 36 briefs, 72 artifacts maximum.
- Program maximum: 104 artifacts.
- No `runs/`, secret randomization map, commitment, render, or paid generation exists.
- `OWNER-PIN-PENDING` occurrences: 0.
- Builder runtime is pinned to Claude Code CLI 2.1.220 / `claude-sonnet-5`, temperature 1, 32,000-token ceiling.
- P7 arm-visible brief projection is pending Stage-6 confirmation; Stage-4 assessment: internally consistent and prevents identity/probe leakage while preserving identical brief projection between arms.

## Stage-4 conclusion

The first-freeze artifact set satisfies the deterministic and real-data floor. Advance to independent cross-model review. Do not render until the preregistration freeze is reviewed, committed, and merged, and the separate public randomization commitment protocol is completed.
