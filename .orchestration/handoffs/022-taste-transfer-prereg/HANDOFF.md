# HANDOFF — Spec 022 taste-transfer preregistration

## Stage

Stage 2 specification is complete. Stage 3 builder must implement and verify the preregistration artifact set only. Do not render or generate experiment arms.

## Authoritative inputs

Read all of these before editing:

1. `/private/tmp/fable-prereg-architecture.md` — Fable 5 Stage-1 architecture, 501 lines. Transcribe sections explicitly marked authored/verbatim; do not re-decide them.
2. `/private/tmp/PREREGISTRATION-final.md` — frozen protocol, authoritative over conflicts.
3. `/private/tmp/prereg-builder-spec-draft.md` — Stage-2 implementation/verification contract.
4. `/private/tmp/mengto-crossmodel-strategy.md` — corrected strategy.
5. `/private/tmp/mengto-skills` at commit `21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49` — pinned corpus.

## Owner pins

The owner selected the recommended default bundle:

- Builder: Sonnet 5, exact runtime/model ID and fixed generation parameters must be recorded from the real runtime rather than guessed.
- Curator: Codex GPT-5, independent from the builder lineage. Record the exact real runtime/model identity when known; do not invent a model ID.
- `control_commit`: use the preregistration commitment commit, as specified by Fable's default. Where self-reference prevents a literal value in the first freeze commit, use the two-commit choreography and validator semantics from the architecture rather than a placeholder hash.
- Secret map custody: `~/.design-os/prereg-022/randomization-map.secret.json`, mode 0600, outside repository.
- Media: construct a licence-cleared media pack, with per-asset role, licence, source note and SHA-256. Do not use the corpus's curated provider URL lists and do not fabricate provenance. If no licence-cleared local/project asset can satisfy a required role, stop and report the exact missing roles rather than downloading or inventing silently.

## Build scope

Create `specs/022-taste-transfer-prereg/` exactly per the Fable file plan, including:

- spec/protocol/roles/prompt files;
- complete 121-record selection manifest and empty failure envelope;
- exact 12-candidate manifest;
- 16 Phase-A and 36 Phase-B briefs;
- 4 family and 12 candidate patches;
- 10 schemas;
- repair/owner/curator/reconciliation documents and five hash-locked reconciliation copies;
- media asset manifest and licence-cleared media assets if available;
- dependency-free scripts: enumerate selection, validate prereg, make randomization map, build judging bundle;
- focused tests and minimal package-script wiring.

Do not create `runs/`, render artifacts, owner votes, curator scores, or reveal data in this stage.

## Freeze choreography

This builder task ends after the first freeze commit candidate is fully implemented and validated. Do not commit unless the coordinator explicitly asks; leave changes reviewable. `randomization-commitment.json` is a second-commit artifact and must only be generated after the first freeze commit exists. Never create a fake commitment or placeholder secret hash.

## Required validation

- focused Spec-022 tests with adversarial mutations for every fail-closed validator class;
- validator pre-freeze with `--corpus /private/tmp/mengto-skills`;
- typecheck, lint, build, full tests;
- secret/provider/source-token scans and `git diff --check`;
- report exact commands and outputs.

## Invariants

No provider coupling; no source URLs or source prose in patches/briefs; no Neuform copying/vendoring/fixtures; reject personal voice corpus; no global defaults; no deterministic or legal originality assurance; no model-specific routing policy; deterministic checks prove floors only; owner preference remains the taste endpoint; all candidates in a surviving family proceed; 2/3 is record-and-reject; no retune/rerun.

## Completion protocol

Send `worker_done` with files modified, validation results, blockers and any OWNER-PIN value that cannot be represented honestly. If blocked on media, give exact role/count requirements and stop without weakening the gate.
