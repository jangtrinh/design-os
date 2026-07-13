# canvas-operations — operate on a live file safely & idempotently

The generic disciplines for *operating on an existing, possibly team-owned Figma file* —
rebuilding a screen against a live library, auditing/normalizing violations, re-running a
build without duplicating work. These are universal Figma-authoring truths (they hold on
any file, any seat, either bridge — the figma-agent CLI or the official Figma MCP), not
recipes for one design system.

Read this BEFORE any operation that touches a file you did not create fresh — i.e. every
rebuild, audit, migration, or re-run. The build-from-scratch craft lives in the sibling
references (`layout-mastery.md`, `components-variables-styles.md`, `visual-craft.md`,
`structure-hygiene.md`, `intent-recipes.md`); this file is the *operating* brain.

## The disciplines (rules)

### R1 — Real-instance rule
Reusable UI = an **instance of a library component**, never a re-drawn lookalike frame.
Inline-styling a standalone frame to look like a `Button`/`Card`/`Badge` is the failure
mode — it drifts from the library the moment the component changes. Before authoring any
recognizable component, run the design-system inventory (`scan-design-system`) and
`create-instance` the match; only build from primitives when no component exists (then
make the component first). This is philosophy #3 in `figma-craft.md`, enforced as lint L7;
here it is the *operating* rule for a live library: resolve the component, instantiate,
override — do not paint a copy.

### R2 — Resolve by NAME, never by id
Node/component/variable/style **ids renumber on library sync, publish, and import** — an id
captured last run points at nothing (or the wrong node) this run. The **name is the stable
key**. Resolve everything by name: components by `name` (or `key` for published library
components), variables/collections by name (the resolve-or-create pattern already codified
in `components-variables-styles.md` §3.6–3.7), nodes in an audit/reconcile by their
role-based name. Any table that keys work by id across runs is a latent bug; key it by name
and diff by name.

### R3 — Icons are component instances, recolored by stroke
An icon is an **instance of an icon component**, recolored by setting its **stroke** (or
fill) — never a text glyph from an icon-font, never a recolor achieved by editing vector
glyph geometry. A raw `TEXT` node holding `` or a detached vector standing in for an
icon is a defect: it won't swap, won't theme, won't bind to a token. Swap icons via
`INSTANCE_SWAP` component properties (see `components-variables-styles.md`), recolor via the
bound stroke/fill variable.

### R4 — Node-tagging for idempotent re-runs
Tag every node your operation creates or fixes with `setSharedPluginData(namespace, key,
value)` — a `run_id` plus a per-node marker (e.g. `fixed:radius`, `instanced`, `built`).
On a re-run, **skip any node already tagged for this run/step** so the operation is
idempotent: re-running never duplicates a frame or re-applies a fix. This is what turns a
one-shot build into a *resumable* one (F0 cost contract §7, "resume, don't rebuild") and
lets an audit-normalize loop re-audit only what changed.

```js
const NS = 'easeDesign';
// tag on write:
node.setSharedPluginData(NS, 'run', runId);
node.setSharedPluginData(NS, 'op', 'radius-snapped');
// skip on re-run:
if (node.getSharedPluginData(NS, 'run') === runId) return; // already handled this run
```

**Persist a state ledger to DISK for long builds (E2).** On any long operation — a 20–100
call build or sweep — the model's own context truncates: the created-node ids, the
section→node-id map, and the "which step am I on" all fall out of the window mid-run.
Node tags survive on the canvas, but you still need an off-canvas index to know *what to
look up*. Keep a JSON ledger on disk (`/tmp/easeDesign-{runId}.json`) — node ids, section
map, completed steps, pending fixes — **write it after each step and RE-READ it at the top
of each turn**. The file, not the conversation, is the source of truth for run state; that
is what makes a half-finished build resumable after a stall. (Pairs with the E1 phase-gated
recipe in `intent-recipes.md`, which drives this ledger phase by phase.)

### R5 — Clone-to-a-new-page safety + await-user-swap on team-owned frames
Never mutate a **team-owned** frame in place. Default to writing to a **clone on a new page**
(`figma.createPage()` + `setCurrentPageAsync`, page named `[FA …]`), do the work there, then
**await the user's swap** — present the clone and let them replace the original when they
approve. This generalizes to the F0 trust contract (§5): preview → confirm → write to a
clone/new page by default → idempotent tag → easy undo. Destructive or ambiguous edits
confirm first; in-place mutation of a shared frame without asking is never the default.

### R6 — Section-aware full-page sweeps
A full-page operation (audit, recolor, normalize) must **walk `SECTION` children**, not just
the page's top-level frames. `SECTION` nodes group frames and are themselves `ChildrenMixin`
containers; a naive `page.children` sweep silently skips everything nested inside a section.
Recurse through `SECTION` (and every `ChildrenMixin`) so no frame is missed. State what was
swept — never silently truncate the node set.

```js
const walk = (n, visit) => {
  visit(n);
  if ('children' in n) for (const c of n.children) walk(c, visit); // SECTION recurses too
};
```

### R7 — Screenshot ×2–3 to beat paint lag
Figma's render is asynchronous: an `export-png` (or the official MCP screenshot) taken
immediately after a mutation can capture a **stale, mid-paint frame**. Take the screenshot
**2–3 times** (or re-export after a short beat) and trust the last, stable capture before you
judge the result. A "the fix didn't apply" verdict off a single screenshot is often just
paint lag — verify with a second capture before retrying (see R8). Keep to the *minimal*
scale that answers the question (F0 cost contract §3, minimal vision).

**Screenshot individual sections by node id, not one reduced-res full view (D3).** A single
whole-page capture is downscaled so far that the defects that matter — truncated text, a
gray placeholder that never got a real image, a component showing the WRONG variant — are
invisible at that resolution. For verification, screenshot each SECTION / major frame **by
its node id** at a legible scale and inspect them one at a time. The full-view capture is
for composition/spacing sanity only; correctness verdicts need per-section shots. (Balance
against the F0 minimal-vision budget: shoot the sections you actually changed, not all.)

### R8 — Semantic-token-only color audit
When auditing color, compare against the **semantic token layer only** (e.g.
`color/surface`, `color/text-primary`) — never against raw primitive hexes or a flat palette
dump. A fill is a violation when it is a raw hex where a **semantic** token exists, or when
it binds a primitive instead of the semantic alias. Auditing against primitives produces
false "clean" verdicts (a raw hex that happens to equal a primitive) and false violations
(a legitimately-bound primitive). Resolve the semantic layer, then check each fill's bound
variable against it.

### R9 — Traverse indexed, scope tight, batch awaits (performance)
Big files punish naive traversal and serial awaits. Three habits keep operations fast (F1):
- **Prefer `findAllWithCriteria({ types: [...] })` over `findAll(predicate)`.**
  `findAllWithCriteria` is served from Figma's internal index and is dramatically faster than
  a predicate `findAll`, which visits and tests every descendant in JS.
- **Scope to the smallest KNOWN ancestor — never `figma.root.findAll`.** Search inside the
  specific section/frame you already hold, not the whole document. A document-wide walk on a
  large file is the classic hang; a scoped one is instant.
- **Batch independent awaits with `Promise.all`.** Awaiting in a loop serializes network/IPC
  round-trips. Fire independent async calls together — component imports, `getVariableByIdAsync`
  lookups, `loadFontAsync` for a known font set — and await them as one:
  ```js
  await Promise.all(fonts.map(f => figma.loadFontAsync(f)));         // not a serial for-await loop
  const [vA, vB] = await Promise.all([                               // parallel lookups
    figma.variables.getVariableByIdAsync(idA),
    figma.variables.getVariableByIdAsync(idB),
  ]);
  ```
  (Only batch *independent* awaits — keep true dependencies sequential.)

### R10 — Verified means measured — geometry is a NUMERIC assert, not a screenshot
A screenshot proves nothing about geometry. **Correctness is measured**: geometry gets numeric
asserts read from `get_metadata` (or an exec-js bounds read), structure gets metadata reads, state
gets property dumps. Screenshots are for taste and humans only — two real defects shipped in one day
because a layout "looked aligned" and a cell "looked like an instance." The canonical case: a table's
header row and its data rows are separate masters and Figma keeps **nothing** structural in sync
across them, so after building or editing any table, assert per column that the header box `x`/`width`
matches every row's within **≤0.5px**:

```js
for (let i = 0; i < COLUMNS.length; i++) {
  const h = headerInst.children[i];
  const drift = Math.max(...rowInsts.map(r =>
    Math.abs(r.children[i].x - h.x) + Math.abs(r.children[i].width - h.width)));
  if (drift > 0.5) throw new Error(`column ${COLUMNS[i].name} drifts ${drift}px`);
}
```

The table that carried this latent bug *looked* perfectly aligned in a screenshot. Write the assert,
not a prose reminder — an executable check is the operating form of the loop-closure rule
(`figma-craft.md` → "Fix the class, not the symptom"). Complements R7 (screenshot the RESULT past
paint lag); R10 says the screenshot never *verifies* the numbers in the first place.

### R11 — `get_screenshot` render bounds INCLUDE effect bleed — confirm the layout box first
A render's reported bounds include **effect bleed**: a drop shadow extends `offset + radius` past the
node's layout box (a button with a soft shadow can bleed 30+px below its box). A reported height taller
than the layout box is almost always shadow bleed, **not** a gap or an overflow. Confirm the true
layout box via `get_metadata` (or a child-bounds measurement) **before** "fixing" a perceived
misfit — chasing a shadow deforms a layout that was already correct. (`contentsOnly:true` excludes
overlapping *canvas* content but still includes the node's own effects.) Pairs with R10: the measured
box is truth, the rendered bleed is not.

### R12 — After an AMBIGUOUS write, re-read state before you report OR retry
Tool errors lie in **both** directions: a "connection lost"/timeout may have already committed the
mutation, and a clean return may have been rolled back. After any ambiguous write (error, timeout,
harness throw), do a read-only check — `get_metadata`, a child-count/bounds read, or a stable
screenshot (R7) — **before** reporting success/failure or retrying. Retrying a write that actually
landed duplicates nodes; reporting failure on a write that landed corrupts your ledger (R4). Rollback
scope is per-bridge: on the official Figma MCP a failed batched call rolls back the **whole** call
(atomic — nothing partial); on the non-atomic figma-agent `exec-js` bridge a throw can leave lines
`1..k` committed (see "Script atomicity is PER-BRIDGE" below). Either way the rule is identical:
**never ASSUME partial success or full failure — CHECK.**

### R13 — Micro-test before retrying a failed batch — isolate, don't iterate
When a long batched write fails, do **not** blind-retry the whole script. Isolate: reproduce the
failure with ONE throwaway instance, probe the exact property/node that threw, then remove the probe.
One cheap call finds the real cause; three blind retries of a 150-line script cost far more and can
half-apply on a non-atomic bridge (R12). Stack-trace line numbers have pointed at the **wrong** node —
trust a fresh reproduction over the trace. Then root-cause the bug **class**, not the instance:
"cell width wrong" was really "instances default to HUG" — fixing one cell would have left the class
alive in every table (`figma-craft.md` → "Fix the class, not the symptom").

### R14 — Capture before destroy — dump data to JSON before instancing/replacing
Before instancing, replacing, or variant-switching anything that **carries data** (table rows,
per-instance text/fill overrides, form values), dump that content to JSON **first**. Node replacement
and variant switches **reset overrides** — `swapComponent` / `setProperties({Variant})` re-apply the
master's defaults, and you cannot recover an override you did not capture. Procedure for a shared-master
replacement: (1) walk file-wide for direct usages, capturing each usage's overrides on the doomed node
(texts, fills); (2) swap/replace the node in the master; (3) re-apply the captured overrides onto the
new node per usage (plus any overrides that live at deeper composition levels). This is "read before
write" for destructive edits; it is the safety net for when the swap's name-matching heuristic
(`components-variables-styles.md` §2.3) can't carry an override across.

### R15 — One live file is SEQUENTIAL — never fan out parallel agents against it
A live Figma file is ONE connection, rate-limited, and the user may be editing it in parallel:
mutations are inherently **sequential**. Never fan out parallel agents (or concurrent sessions) that
all **write** the same file — they race, blow the rate limit, and corrupt each other's ledger (R4/E2).
Multi-screen or multi-component work is a **stepwise checklist** (a `plans/` file, one step per screen)
driven one step at a time WITH per-step verification (R10) before advancing. Parallelism belongs to
independent READ fan-out and to batching independent awaits *within* one script (R9) — never to
concurrent writes on the shared file.

## Cross-bridge harness gotchas

Facts that bite when driving *either* write bridge. Generic — they hold regardless of which
seat/bridge the selector chose (`figma-agent-hand.md` → Bridge selection).

- **No async-IIFE wrap on the official Figma MCP (`use_figma`).** The official MCP runs your
  Plugin-API code in an already-async top-level context — wrapping it in an
  `(async () => { … })()` IIFE breaks it. The async-IIFE-with-`return` convention is
  **figma-agent `exec-js` only** (`figma-agent-hand.md` → exec-js). Match the wrapper to the
  bridge.
- **Verify before retry.** After any write op, confirm the result (read-back or a stable
  screenshot per R7) **before** retrying. A silent partial success followed by a blind retry
  duplicates nodes. Never retry on a single stale screenshot.
- **Script atomicity is PER-BRIDGE — verify ours before relying on it (A8). ⚠️ CAVEATED.**
  On the official Figma MCP (`use_figma`), a script runs **atomically**: if it throws
  partway, nothing it did is committed — the canvas is exactly as before. There the retry
  discipline is *stop → read the error → fix the script → re-run whole*, and blind retry is
  never needed because a failed script left no partial mutation. **Our figma-agent `exec-js`
  bridge is NOT atomic** — a script that throws on line 20 has already committed lines 1–19
  (partial mutation). **✅ VERIFIED 2026-07-09** — a probe that created a node then threw left
  the node on the canvas. So treat exec-js as non-atomic: make scripts
  idempotent (R4 tags, resolve-or-create), read back what actually landed after a throw, and
  never blind-retry a script that may have half-applied. The per-bridge difference changes
  the whole retry contract — match it to the bridge you're on (`figma-agent-hand.md` →
  Bridge selection).
- **New nodes default to (0,0).** A freshly created node lands at `(0,0)` in its parent —
  explicitly set `x`/`y` (or append into an auto-layout parent) or every new node stacks at
  the origin. (figma-agent's import path centers roots; raw `create*` calls do not.)
- **`COMPONENT_SET` does not auto-grow.** Adding a variant to a component set does **not**
  resize the set's bounding frame — the new variant can land outside it. Resize / reflow the
  set frame yourself after adding variants. (Complements the structure lint: every child of a
  `COMPONENT_SET` must be a variant named with `=` properties.)
- **`get_design_context` 25K pivot → screenshot.** A structured `get_design_context` read
  (official MCP) can exceed ~25K tokens on a full screen — one screen can burn a large slice
  of a daily budget. Follow the cheapest-first read ladder (F0 cost contract §2):
  `get_metadata` (names/structure) → low-res screenshot → full `get_design_context` **only on
  demand**; when the structured context blows the budget, **pivot to a screenshot** read
  instead of blind-fetching the whole context.

## Checkable subset (construction lints)

Several disciplines above are mechanically checkable — run them in the same combined
`exec-js` walk as the L1–L14 construction lints in `figma-craft.md` (extend that harness):

- **L15 icon-is-instance** — no `TEXT` node whose characters are icon-font glyphs, and no
  detached vector, standing in for an icon; icons must be `INSTANCE` (R3).
- **L16 semantic-token-color** — every solid fill either matches a **semantic** token or is a
  deliberate, named exception; no raw hex where a semantic token exists (R8).
- **L17 section-sweep-complete** — a full-page operation visited every frame including those
  nested in `SECTION` nodes; report any unvisited frame (R6).
- **L18 run-tagged** — every node the operation created/fixed carries its `run_id` +
  op-marker shared-plugin-data, so a re-run is idempotent (R4).

Fix each hit with the **narrowest** targeted `exec-js` (specific node ids, never page-wide
`findAll` mutations), then re-run the affected lint until clean.

## Provenance

Generic Figma-authoring disciplines distilled from real full-file rebuild + DS-audit work.
No design-system specifics are encoded here — resolve names, tokens, and components from the
live file (`scan-design-system`) at run time. API facts (`setSharedPluginData`, `SECTION`
as a `ChildrenMixin`, async export timing, `COMPONENT_SET` sizing) verified against
https://developers.figma.com/docs/plugins/.

R10–R15 distilled from the VSF-PCP `figma-idp-rebuild` field skill (dogfood 2026-07-13) —
principles only, no project-specific inventory.
