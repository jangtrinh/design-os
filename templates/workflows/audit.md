---
description: "Audit a Figma file against its design system and normalize the violations. Use when the user says 'audit', 'fix violations', 'normalize to the DS', or wants raw hex / detached instances / raw icons / off-grid spacing / deprecated components cleaned up."
---

# Workflow — `/ui:audit`

Given a **design system** (tokens + component registry) and target **Figma frames**,
find every DS violation and normalize the file back to the system: raw hex → token,
detached instance → real instance, raw icon → Icon component, off-grid radius/spacing →
snapped, deprecated component → current. This is the highest-ROI recurring designer job —
it runs on any seat.

The split that keeps it cheap and honest: **detection is a zero-token `ui` binary
(`ui audit`)** — the model never eyeballs a node tree hunting for violations; the
**canvas edits are the hand** (the seat-adaptive bridge). The model only judges taste and
sequences the fixes.

## Cost budget (state this to the user up front)

| Sub-step | Who | Cost |
|---|---|---|
| Violation detection, remap table, per-round re-audit | **`ui audit`** (zero-token binary) | 0 tokens, deterministic |
| Node export (one structured read of the target) | the hand (`scan` / one `exec-js` walk) | one read, cached — never re-read per round |
| Normalize sequencing + taste judgment on the SEE step | model | small, bounded |
| Reads | cheapest-first ladder: `get_metadata` → low-res screenshot → full only on demand | never a blind 25K `get_design_context` |
| Rounds | capped | ≤ 5 |

A whole-screen audit is **one structured node read + N zero-token `ui audit` runs + a
handful of minimal screenshots** — bounded and surfaced. Honor a user-set depth/budget.

## Bridge + prerequisites

Pick the write bridge once via the seat selector (never hardcode) —
`knowledge/figma-agent-hand.md` → "Bridge selection":

```bash
figma-agent seat        # → {seat, bridge, reason}; free → figma-agent CLI, paid → official Figma MCP
```

You also need the DS spec as files the binary can read:
- **tokens** — a DTCG token file (e.g. from `ui ds context --format json` / the project DS).
- **registry** — the component registry JSON (`ui registry list --json` / `design/component-registry.json`).

Read `knowledge/figma-craft/canvas-operations.md` before touching the file — it is the
operating brain for this job (real-instance rule, resolve-by-NAME, idempotent tagging,
clone-safety + await-swap, section-aware sweeps, semantic-token audit).

## The lifecycle (the uniform F0 shape, parameterized for audit)

### REFERENCE — the DS is the source of truth
The "reference" here is not inspiration images — it is the **design system**. Confirm the
tokens + registry files exist and are current; they are the spec every violation is judged
against. No canvas reads yet.

### SCOPE — confirm what + where, cheapest reads only
Confirm the target (a frame, a page, a section) with the user. Read only **names/structure**
first (`get_metadata`, or `figma-agent get-selection --depth 2`) to bound the work — never a
full `get_design_context` yet. State what will be swept (a full-page audit walks `SECTION`
children — R6; no silent truncation).

### PLAN — the audit (zero-token, NO writes)
Produce the structured node export once (a depth-capped `exec-js` walk emitting
`{name,type,fills:[{hex,boundToken}],cornerRadius,itemSpacing,padding*,mainComponent,detached,role,characters,children}`
per node — cache it), then run the binary:

```bash
ui audit nodes.json --tokens tokens.json --registry registry.json --json
```

The `--json` envelope is the **plan**: `violations` (by node NAME + `detail`), per-rule
`counts`, and a `remap` table (`{kind,from,to,nodeName}`) that pairs each raw
color/radius/spacing with its snapped target. Show the counts to the user; no file has
been touched. Exit 1 signals violations exist.

### BUILD — normalize on the canvas (the hand), in dependency order
Trust & safety first (F0 §5): default to a **clone on a new page** (`[FA …]`), never mutate
a team-owned frame in place. Then fix **in dependency order** so earlier fixes don't get
re-detected — apply, `tag each fixed node` with the run id (R4, idempotent re-runs), batch
the ops (F0 cost §6):

1. **Enhance the master / re-instance** — replace detached/lookalike frames with real
   `create-instance` of the registry component (resolve by NAME — R2). Deprecated-component
   instances swap to the current component.
2. **Icon swap** — replace raw icons (glyph/vector) with the Icon component instance,
   recolored by bound stroke (R3).
3. **Snap radius / spacing** — apply the `remap` table's radius/spacing targets.
4. **Remap color / font by exact fill** — bind each `raw-hex-vs-token` fill to the semantic
   token from the remap table (semantic layer only — R8).

Use the **narrowest** targeted edits (specific node ids, never page-wide `findAll`
mutations).

### SEE — the eyes (owed after every mutation)
Export the changed region at the minimal scale that answers the question, **2–3 times** to
beat paint lag (R7), `Read` the last stable PNG, and give the honest 2–3 lines: what
changed, does it meet intent, what's still off — plus the PNG path (auto-open where the
runtime supports it; degrade to the path otherwise).

### ITERATE — re-audit per dimension (zero-token), capped
Re-run `ui audit` on a fresh export — the binary is free, so re-audit **every round** and
after **each dimension** until `total` is 0 or the round cap (≤5). Tags let a re-run skip
already-fixed nodes (resume, don't rebuild — R4). An honest STOP with the remaining count
beats a discounted "done".

### LAND — await swap, record, summarize
On team-owned frames, **await the user's swap** — present the normalized clone and let them
replace the original (R5). Update the registry / `ui memory` if the DS learned something,
then a one-line summary: `audited <target>: N violations across <rules> → M fixed, K
remaining`.

## Inputs

- `<target>` — the frame/page/section to audit (URL, node id, or current selection).
- `--tokens <file>` / `--registry <file>` — the DS spec (auto-resolve from the project DS if omitted).
- *(optional)* `--grid <n>` — base grid for the off-grid check (default 4).
- *(optional)* `--budget <n>` — cap the rounds / reads.

## Outputs

- **Text (always):** the violation report (by node NAME + counts), the remap table, and a
  one-line landing summary — the runtime-neutral floor.
- **PNG paths:** minimal before/after captures of the normalized region.
- A normalized clone on a `[FA …]` page awaiting the user's swap (team-owned) or the
  in-place fix (own file), every fixed node run-tagged for idempotent re-runs.

## Quality gate

The audit is its own gate: **`ui audit` must reach `total: 0`** (or an explicit,
user-acknowledged remainder) before LAND. Detection is deterministic — there is no "looks
clean" shortcut past a non-zero count. Correctness (a violation) is a gate, not a deducted
point.
