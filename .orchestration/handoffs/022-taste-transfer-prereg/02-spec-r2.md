# Spec 022 — Stage-2 fix specification r2

Status: frozen fix direction for Stage-3 re-entry
Trigger: independently confirmed Codex Stage-5 `VERDICT: BLOCKER`
Source report: `/private/tmp/codex-prereg-stage5-review.md`

## Scope

Fix all confirmed Stage-5 gaps without rendering, creating `runs/`, generating a randomization map, committing, or changing the frozen candidate/brief/patch content. Preserve the now-green pre-freeze gate and media pack.

## F1 — One canonical arm-prompt assembler

Create one dependency-free module used by both future generation tooling and the validator. It must:

1. Load the exact committed brief object by `brief_id` from the appropriate frozen brief file.
2. Project the brief exactly per P7:
   - Phase A removes `brief_id`, `candidate_id`, `family`, `ordinal`, `role`, `is_duplicate_source`, `anti_context_condition`.
   - Phase B removes `brief_id`, `candidate_id`, `family`, `ordinal`, `anti_context.leak_definition`, `anti_context.deterministic_leak_checks`.
   - Phase-B `anti_context.embedded_state` and `anti_context.inactive_requirement` remain.
3. Preserve retained key order and serialize with compact `JSON.stringify`.
4. Assemble exact bytes as template bytes + projected brief bytes + treatment-only patch bytes, with no hidden ingredient or normalization. Control receives no patch bytes.
5. Return the assembled bytes and SHA-256.

`PR-020` must recompute the prompt for every run manifest and reject identity/probe leakage, wrong/missing/extra patch, wrong `patch_path`/`patch_hash`, wrong `prompt_hash`, or cross-field inconsistency. Add mutation tests for each branch.

## F2 — Run and commit evidence must be byte-verifiable

Harden PR-019/020 so every manifest is tied to its directory and frozen inputs:

- path phase/pair/arm equals manifest `phase`, `pair_id`, `brief_id`, `arm`;
- Phase-A `candidate_id` is null; Phase-B candidate/family matches candidate manifest and brief;
- `upstream_commit` equals the pinned full commit;
- `control_commit === prereg_commit` per frozen rule;
- `prereg_commit` is an ancestor of HEAD and is the unique commit containing `randomization-commitment.json` first revision;
- the prereg commit tree contains every frozen file and each byte matches the expected frozen working input or recorded hash;
- brief hash, family/candidate source hashes, patch hash, prompt hash recompute exactly;
- artifact, gate envelope, console log, screenshots, and optional reduced-motion/repaired evidence paths are contained under the run directory, are regular non-symlink files, and match recorded hashes;
- exactly one manifest per expected arm directory; no arm/pair path aliases;
- tree cleanliness is not accepted merely because the manifest says `tree_clean: true`.

Use argv-safe git calls only. Fail closed on unreadable paths, commits, or evidence.

## F3 — Correct phase-mode semantics

`pre-render` alone requires `runs/` absent or empty.

`post-phase-a` must:

- allow and require exactly 32 Phase-A arm manifests for the 16 frozen pairs;
- forbid any Phase-B run/evidence;
- run all applicable post-render integrity, repair, no-regeneration, judging leakage, owner-vote, curator-score, duplicate, contradiction, result-recompute, and truth-table checks for Phase A;
- verify the secret map at the committed external `secret_map_location` in place, read-only, against `secret_map_sha256`; use only Phase-A presentations to resolve votes/results; never copy or disclose Phase-B assignments;
- require exact Phase-A owner-vote presentation coverage (20 forms), exact Phase-A curator-score codename coverage, complete FREEZE manifests, and frozen git commits;
- compute family survivors from the three ordinary briefs only; contradiction brief is diagnostic; require exact agreement with recorded Phase-A results/survival summary;
- forbid Phase-B execution unless this gate passes.

Full `runs/reveal/randomization-map.json` remains forbidden until all Phase-A and Phase-B owner/curator freeze commits exist. Add positive complete Phase-A lifecycle fixture and mutations for non-empty Phase-A runs, Phase-B early run, incomplete coverage, wrong secret hash, wrong survivor, and leak.

## F4 — Result recomputation from primary evidence

PR-027/028/029 must not trust derived fields. Recompute from:

- schema-valid, hash-verified run manifests and gate evidence;
- commitment-verified secret-map assignments;
- exact owner-vote files and endpoint-primary selection;
- exact curator-score files;
- duplicate presentation consistency (same resolved winner arm and same `both_fail`);
- contradiction evidence;
- eligibility and both-fail;
- critical veto and any treatment axis <= control minus 2;
- repair-reduction null rule;
- ordinary-win endpoint and all-candidate advancement.

Compare every recorded derived result field for exact equality. A treatment win is impossible under any fail-closed condition and must carry a non-null reason when non-confirmatory. Add positive and isolated negative mutation tests for each rule.

## F5 — Judging-bundle path and commitment safety

Before any copy/read/write, `build-judging-bundle.mjs` must:

- read and schema-validate the committed commitment and external secret map;
- hash secret map bytes and compare to commitment;
- validate exact map counts and strict `presentation_id`, `pair_id`, codename, phase, and arm enums/patterns;
- resolve output under `runs/judging/<presentation_id>` with strict containment;
- resolve manifests and every artifact/screenshot under their designated run directory;
- reject `..`, absolute paths, path aliases, symlinks, non-regular files, and hash mismatches;
- never copy arbitrary local files;
- fail before creating partial bundles on invalid input (preflight all entries first).

Add traversal, symlink, absolute-path, wrong-hash, wrong-commitment, and valid-bundle tests.

## F6 — Freeze coverage and ordering

Replace loose object-map checking with a defined freeze envelope or strict parser containing its own commit identity and exact file/hash list. Enforce:

- exact expected vote/score files, no omissions, duplicates, extras, aliases, or symlinks;
- every listed file is schema-valid and hash-valid;
- votes freeze commit is ancestor of curator freeze commit;
- both freezes precede the first reveal commit;
- frozen files never mutate after their freeze commit;
- curator cannot see identity mappings before owner votes freeze;
- full reveal remains impossible before both phase-appropriate freezes.

Add commit-backed tests in temporary git repos for valid order and each ordering/mutation failure.

## F7 — Exact media-manifest contract

Extend PR-014 to validate the complete manifest, not only references:

- exactly 30 unique records, IDs, paths, and local SHA-256 values;
- exact role counts 9/6/4/4/6/1 and exact role-to-required-ID mapping;
- every supplied asset reference has the same declared role;
- no unreferenced or substituted record;
- declared width/height equals parsed JPEG/PNG dimensions and ratio contract;
- require creator, allowlisted licence label/URL, Commons File source URL, original URL, downloaded derivative URL, 40-hex source SHA-1, ISO source revision timestamp, crop method;
- require non-empty non-identity/non-endorsement disclaimer for every human role;
- reject duplicate local bytes and duplicate source records unless explicitly allowed by frozen protocol (none are allowed in this pack).

Add mutations for each field/count/duplicate/role/disclaimer failure while preserving the real 30-asset positive fixture.

## F8 — Test and reporting floor

Focused tests must include complete positive fixtures for pre-freeze, pre-render, post-phase-a, post-render, and post-reveal plus isolated mutations across PR-016..PR-029. Warning-only absence is allowed only in a mode where the evidence is genuinely not yet applicable; required evidence in that mode is an error.

Run and report:

1. corpus-backed pre-freeze validator;
2. focused Spec 022 tests;
3. typecheck;
4. lint;
5. build;
6. full suite;
7. `git diff --check`;
8. secret/dangerous-call scan.

No commits. No renders. No `runs/`. No randomization map or commitment. Return exact changed files and any remaining blocker.
