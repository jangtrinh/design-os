# Spec 022 — Stage 4 coordinator validation (r4)

**Verdict: YES**

Base reviewed by prior Codex Stage 5: `adeec3a` (`VERDICT: BLOCKER`).
Correction authority: `.orchestration/handoffs/022-taste-transfer-prereg/02-spec-r4.md`.
Worker evidence: `/private/tmp/w022-r4.md`.

## Defect disposition

The duplicated-valid-codename curator-score bypass is closed. Result recomputation now emits deterministic errors for duplicate codenames/paths, unexpected or unresolved codenames, duplicate arm resolution, missing expected codename coverage, and missing arm evidence. `curator_scores` also has `maxItems: 2`; object uniqueness remains in semantic recomputation because the local schema engine does not implement `uniqueItems`.

The new RED case is non-vacuous: it targets a non-confirmatory pair, where the pre-fix validator accepted duplicated valid curator evidence with zero errors. It therefore proves exact identity coverage rather than incidental truth-table failure.

## Independent gates

1. Corpus-backed pre-freeze validator: exit 0; 0 errors, 0 warnings.
2. Focused Spec 022 suite: 9 files; 237/237 passed.
3. Typecheck, lint, build: all exit 0.
4. Full project suite: 164 files; 2,558 passed, 6 skipped (2,564 total).
5. `git diff --check`: clean.
6. Forbidden artifacts remain absent: no `runs/`, randomization commitment, owner secret map, renders, or paid-generation artifacts.

Mutation-fixture error output is expected; all test commands exited 0.

## Stage boundary

This YES authorizes committing the r4 correction and rerunning fresh Codex Stage 5 on the resulting immutable commit. It does not authorize Fable Stage 6 unless Codex passes, and it does not authorize rendering before PR/CI merge and freeze.
