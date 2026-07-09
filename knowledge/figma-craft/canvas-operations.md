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

### R8 — Semantic-token-only color audit
When auditing color, compare against the **semantic token layer only** (e.g.
`color/surface`, `color/text-primary`) — never against raw primitive hexes or a flat palette
dump. A fill is a violation when it is a raw hex where a **semantic** token exists, or when
it binds a primitive instead of the semantic alias. Auditing against primitives produces
false "clean" verdicts (a raw hex that happens to equal a primitive) and false violations
(a legitimately-bound primitive). Resolve the semantic layer, then check each fill's bound
variable against it.

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
