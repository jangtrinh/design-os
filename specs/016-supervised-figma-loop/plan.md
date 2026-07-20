# Supervised Figma Loop — Technical Plan

## Architecture

1. Add pure target-resolution and trait-selection modules.
2. Add typed protocol commands for inspect, trait cloning, and correction-memory access.
3. Compose inspect from scoped node scan plus PNG evidence.
4. Stamp successful agent mutations with operation provenance in Figma shared data.
5. Convert later local changes on stamped nodes into immutable correction events.
6. Add pure canonical hashing, union merge, conflict quarantine, tombstones, and retention.
7. Synchronize Figma edge events through broker transport; persist canonical events under
   project `design/memory`.
8. Emit existing memory/learning records only through current governed paths.
9. Update figma-hand workflow knowledge and command help.

## Guardrails

- `ui` core additions remain pure; command layer owns filesystem I/O.
- Plugin and broker remain the only Figma/network boundary.
- Destructive commands never accept inferred targets.
- Text trait copying is explicit opt-in.
- Every visual mutation requires post-edit inspect evidence at workflow level.
- Existing user changes are not reformatted or overwritten.

## Verification

- Pure tests: target precedence, trait allowlist, canonical hash, merge, quarantine,
  tombstone, retention.
- Plugin tests: trait compatibility, text opt-in, provenance stamping, correction origin
  filtering, shared-data bounds.
- CLI tests: inspect artifact contract, dual-store read/write, structured errors.
- Required gates: typecheck, lint, build, tests for root and figma-agent workspace.

## Delivery Slices

1. Contracts and pure synchronization model.
2. Trait executor and safe target resolution.
3. Inspect evidence command.
4. Plugin correction capture and edge storage.
5. Project-store synchronization command.
6. Workflow documentation, review, and full gates.
