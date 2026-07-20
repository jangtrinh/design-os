# Supervised Figma Loop — Use Cases

## UC-01: Inspect before editing

**Actor:** Figma hand
**Precondition:** Broker and plugin are connected.
**Happy path:** resolve a safe target, scan its structure, export a PNG, return a required
visual-check artifact.
**Edge cases:** no target, oversized PNG, plugin unavailable.

## UC-02: Apply selected traits

**Actor:** Figma hand
**Precondition:** Explicit source and target nodes exist.
**Happy path:** copy only allowlisted trait groups; omit text unless explicitly requested;
return changed traits and operation provenance.
**Edge cases:** incompatible node type, unavailable fonts/variables, removed nodes.

## UC-03: Recall a correction

**Actor:** Designer
**Precondition:** An agent operation has stamped affected nodes.
**Happy path:** later human change on the stamped node produces an immutable correction
event linked to the agent operation.
**Edge cases:** agent-origin changes, unrelated edits, stale stamp, repeated edits.

## UC-04: Synchronize correction memory

**Actor:** Figma hand
**Precondition:** Either project or Figma edge store contains events.
**Happy path:** merge unique event IDs, copy missing events, quarantine hash conflicts,
apply tombstones, compact within retention limits.
**Edge cases:** schema mismatch, corrupt hash, offline project, storage limit.

## Acceptance Criteria

```gherkin
Given a resolvable Figma target
When inspect runs
Then structure and a required PNG visual artifact are returned
```

```gherkin
Given source and target nodes
When traits layout, fills/variables, typography, spacing, and text are requested
Then only those traits are copied and text requires explicit opt-in
```

```gherkin
Given an immutable project event and a distinct immutable Figma event
When memory synchronizes
Then both appear in the merged result in deterministic order
```

```gherkin
Given the same event ID with two content hashes
When memory synchronizes
Then both are quarantined, the project copy stays active, and a diagnostic is returned
```

```gherkin
Given a captured correction
When no governed promotion decision exists
Then knowledge is not modified
```

## Error States

| State | Behavior |
|---|---|
| No target | Fail with `E_INVALID_ARGS`; list accepted target sources |
| Destructive implicit target | Refuse; require explicit node ID |
| Hash conflict | Quarantine and report; never overwrite |
| Edge store full | Compact resolved old events; retain unresolved corrections |
| Screenshot failure | Mutation cannot claim verified completion |

## Design-System Check

No new visual tokens or components. Reuse the existing compact status/activity panel.

## Appetite Check

| UC | Effort | Value | Ship |
|---|---|---|---|
| Inspect contract | Medium | High | Yes |
| Trait operations | High | High | Yes |
| Correction capture | High | High | Yes |
| Dual-store sync | High | High | Yes |
| Ambient cowork | High | Medium | Defer |
