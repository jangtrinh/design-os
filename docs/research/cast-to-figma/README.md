# Cast to Figma Research

Status: complete
Source: https://github.com/newfiction/cast-to-figma
Revision: `e38266008fd6b2a7901589f9443bff30b752591e`
Decision: adapt
Confidence: high for public CLI/bridge; medium for closed plugin behavior

## Executive Finding

Keep ease-design's current Figma architecture. It has the stronger transport, multi-file
routing, typed protocol, HTML-to-Figma import, design-system audit, component live-sync,
and deterministic mirror/reconcile boundary.

Adopt three Cast concepts:

1. **P0 — mandatory inspect → edit → screenshot verification**
2. **P1 — file-local designer correction memory with explicit promotion**
3. **P1 — semantic target fallback: explicit node → selection → recent edit**

Then consider **P1 file-local procedural tools** only after capability controls exist.
Do not adopt Cast's single-active-plugin bridge, unauthenticated generic script surface,
or polling event queue.

## Evidence Summary

- observed — Cast's public repository is CLI + bridge + skill; its plugin source is not
  shipped. Its own test skips plugin parity when that separate source is absent:
  [test evidence](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/bin/cast.test.js#L38-L46).
- documented — Cast's headline differentiation is real-time coworking, correction memory,
  and token-aware editing:
  [README](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/README.md#L9-L21).
- observed — Cast makes screenshot inspection a machine-visible contract:
  [CLI](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/bin/cast#L443-L487).
- observed — ease-design already has multi-file routing, protocol versioning, chunking,
  per-command timeouts, reconnect backoff, and application heartbeats:
  [`figma-agent/shared/protocol.ts`](../../../figma-agent/shared/protocol.ts).
- observed — ease-design captures component changes into an append-only log and keeps
  deterministic reconcile outside the plugin:
  [`figma-agent/plugin/src/main/main.ts`](../../../figma-agent/plugin/src/main/main.ts).

## Applicability Table

| Pattern | Rank | Decision |
|---|---:|---|
| Mandatory screenshot check after visual mutation | P0 | Implement first |
| File-local correction memory | P1 | Adapt to existing design-memory governance |
| Explicit → selection → recent-edit targeting | P1 | Adapt with destructive-command guard |
| Typed trait cloning | P1 | Add wrapped commands, avoid generic scripting |
| File-local procedural tools | P1 | Plan only; needs capability and provenance model |
| Ambient cowork pause/resume cycle | P2 | Prototype after correction memory |
| Single active plugin on fixed port | P3 | Reject |
| Broad `run-script` as normal escape hatch | P3 | Reject |

## Recommended Next Step

Write one implementation spec for a **supervised Figma loop**:

`inspect + screenshot → atomic wrapped edit → screenshot → correction capture → explicit learning promotion`

The first slice should add a visual-check artifact/contract and target-resolution helper.
It is small, reversible, and does not disturb locked deterministic-kernel boundaries.

## Owner Decisions

- Correction memory is stored in both Figma shared plugin data and project
  `design/memory`, with explicit synchronization and provenance.
- Learning promotion reuses the existing governed world-class learning loop; correction
  capture alone never promotes knowledge.
- Trait wrappers cover all five initial groups: layout, fills/variables, typography,
  spacing, and text. Delivery may be phased, but the protocol and spec cover the full set.

### Dual-store conflict policy

- Project `design/memory` is the canonical durable history. Figma shared plugin data is an
  offline-capable edge cache, not an independent source of truth.
- Correction events are immutable and carry `eventId`, `fileKey`, `nodeId`, source,
  timestamp, schema version, causal parent where known, and a content hash.
- Synchronization merges the union of event IDs. An event present in only one store is
  copied to the other.
- The same `eventId` with different content is corruption, not a normal merge conflict:
  quarantine both versions, keep the project copy active, and report a visible diagnostic.
  Never silently use last-write-wins.
- Deletion uses explicit tombstone events. Missing data never means deletion.
- Compacted summaries reference their source event IDs and hashes, allowing provenance
  checks after raw-event pruning.

### Retention policy

- Compact raw events when either limit is reached: **30 days** or **1,000 raw events per
  Figma file**, whichever comes first.
- Before compaction, retain every unresolved correction and every event participating in
  an active learning candidate, regardless of age or count.
- After compaction, retain compact trait summaries, source hash manifests, promotion or
  rejection decisions, and audit provenance permanently in project memory.
- Keep the Figma edge cache bounded to the newest **250 raw events plus unresolved
  corrections**; the project store retains the larger raw window.
- Make thresholds project-configurable later, but use these fixed conservative defaults
  in the first schema to avoid premature configuration surface.

## Risks

- File-local memory can overfit one file and silently encode accidental edits.
- Correction detection needs agent-operation provenance; otherwise ordinary designer work
  may be mislabeled as feedback.
- “Recent edit” targeting becomes dangerous for delete/move/broad operations.
- Executable file-local tools create a persistent code-execution surface.
- Cast plugin internals are unavailable, so its memory quality and storage limits cannot be
  independently verified from source.

## Unresolved Questions

- None for research. Exact schema and synchronization state machine belong in the
  implementation spec.
