# Integration Brief

| Pattern | Evidence | Rank | Destination mapping | Adaptation | Risk | Verification |
|---|---|---:|---|---|---|---|
| Mandatory visual checkpoint | Cast `inspect` attaches a required screenshot contract | P0 | `figma-agent/cli/src/commands/scan-node.ts`, `export-png.ts`; `templates/agents/figma-hand.md`; workflow knowledge | Add an `inspect` wrapper returning node scan + PNG + explicit verification contract; require after mutations | Agent may still ignore prose-only contract | Unit-test artifact envelope; workflow test refuses completed visual mutation without post-edit artifact |
| Semantic target resolution | Documented explicit ID → selection → recent edit, destructive tools require ID | P1 | new pure helper under `figma-agent/cli/src/`; command parsers; plugin change events | Resolve only non-destructive/single-node edits; surface resolution source in output | Stale recent node | Pure precedence tests; delete/move tests require explicit ID |
| Correction memory | File-local user/agent nodes, traits, events, corrections | P1 | existing `src/core/memory-events.ts`; `knowledge/world-class-learning-loop.md`; plugin `documentchange` capture | Stamp agent operations; compare later human edits; project store is canonical and Figma data is an edge cache; merge immutable hashed events by ID; compact at 30 days or 1,000 project events; keep 250 raw edge events; promote only through existing learning governance | Misattributes edits; divergent copies; overfits file | Fixtures for agent-edit → human-correction; union merge, hash-conflict quarantine, tombstone, compaction, and provenance tests; no auto-promotion |
| Typed trait cloning | Cast clones selected layout/style/history traits without copying text by default | P1 | modular executor commands; shared protocol | Cover layout, fills/variables, typography, spacing, and text; keep every trait named and allowlisted, with text requiring explicit opt-in | Partial fidelity across node types; broad first release | Per-trait unit tests + before/after node scan + PNG |
| File-local procedural tools | CRUD + run scoped tools | P1 | future plugin shared-data module + typed command | Signed/hashed manifest, declared parameters, node scope, no ambient network, provenance log | Persistent executable code | Schema validation, permission tests, tamper hash, source displayed before run |
| Cowork idle loop | Plugin detects designer pause and returns context to external agent | P2 | extend existing idle/live-sync events only after memory exists | Emit a bounded `DESIGNER_PAUSED` event containing changed node IDs and correction refs | Interruptions, false triggers, long-running watcher | Debounce tests, cancellation, one-cycle semantics, no automatic mutation |
| Fixed bridge + active socket | Fixed 7777, most recently connected/activated plugin wins | P3 | none | Reject; ours is more robust | Wrong-file mutation | N/A |
| Generic raw script as routine fallback | Cast exposes `run-script` with reason label | P3 | existing `EXEC_JS` | Keep escape hatch exceptional; prefer typed operations and stronger activity/provenance | Arbitrary mutation/exfiltration inside plugin API | Existing timeout plus future capability gate |

## Suggested sequence

1. Spec and implement visual-check artifact + target-resolution helper.
2. Add agent-operation provenance to change capture.
3. Build dual-store correction-memory MVP with governed promotion into existing learning records.
4. Add all five trait-wrapper groups in independently testable slices: layout,
   fills/variables, typography, spacing, then explicit-opt-in text.
5. Prototype cowork only after correction recall and dual-store synchronization are trustworthy.

## Compatibility

All recommended P0/P1 items are concept reimplementations. They preserve:

- deterministic `ui` kernel / non-deterministic plugin boundary;
- append-only change log and cursor-based reconciliation;
- existing multi-file broker routing;
- current design-memory anti-fabrication and promotion governance.

End decision: **plan**.
