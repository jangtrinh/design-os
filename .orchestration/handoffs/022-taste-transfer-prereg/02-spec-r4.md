# Spec 022 — narrow r4 correction after Codex Stage 5

## Authority

Fresh Codex Stage-5 review of commit `adeec3a` returned `VERDICT: BLOCKER` in `/private/tmp/codex-prereg-stage5-r3-review.md`.

## Single defect

`checks-results.mjs` accepts two `curator_scores` entries that repeat the same valid endpoint codename. The array length remains two, both evidence files may verify, and the opposite arm's missing score only becomes a fail-closed reason rather than a validator error. This can conceal treatment veto/contradiction evidence in a forged non-confirmatory result.

## Required correction

1. Add a RED lifecycle mutation test that replaces one pair's second curator-score reference with a duplicate of the first valid reference while preserving a plausible non-confirmatory result. It must fail under PR-027 result recomputation (not merely because a fixture file is malformed).
2. Require exact curator-score identity coverage for the endpoint-primary pair:
   - exactly two references;
   - exactly the two expected endpoint codenames;
   - no duplicate codename;
   - no duplicate path/evidence substitution that allows one score file to stand in for both arms;
   - every verified score resolves exactly once to control and once to treatment.
3. Any missing, duplicate, or substituted identity must emit a deterministic error, not only append a fail-closed reason.
4. Tighten `schemas/result.schema.json` to `maxItems: 2`. If the local schema validator supports a sound uniqueness contract for objects, use it only with a test proving behavior; otherwise enforce codename/path uniqueness in recomputation rather than adding a vacuous schema keyword.
5. Add positive/regression coverage proving the canonical complete pair remains green and ordinary distinct score references still pass.
6. Do not alter unrelated governance, media, prompt, custody, or rendering behavior.
7. Do not create `runs/`, a commitment, a secret map, renders, or paid-generation artifacts. Do not commit; coordinator owns commits.

## Required gates

- focused failing test RED before implementation;
- focused Spec 022 suite green;
- corpus-backed pre-freeze validator 0/0;
- typecheck, lint, build;
- full project suite;
- git diff --check and forbidden-artifact checks.

Write `/private/tmp/w022-r4.md` with exact files changed, RED/GREEN evidence and gate results, then signal `worker_done`.
