# Phase 02 — panel IA v2: three blocks, three sizes, one font, zero text glyphs

Venue: `/Users/jang/orca/workspaces/ease-design/opah/figma-agent`, branch `jangtrinh/opah`, HEAD
`42fd3a9` **plus the uncommitted phase-01 skin in the working tree** — every anchor below was read in
that tree (`panel.html` is now 826 lines, `panel-ui.ts` 324, the gate test 230).
Builds ON TOP of phase 01; do not revert it. Estimated 6h incl. the preview rebuild.
Gate: repo-root `npx vitest run tests/figma-plugin-panel.test.ts` **and**
`cd figma-agent && npm run typecheck && npm run build && npm test`.

Commit contents (five files + preview): `plugin/src/ui/panel.html`, `plugin/src/ui/panel-ui.ts`,
`plugin/src/ui/panel-model.ts`, `plugin/src/main/main.ts`, `plugin/src/ui/ui-relay.ts`,
`shared/protocol.ts`, `cli/src/transport/broker-daemon.ts`, the new
`plugin/src/ui/activity-sentence.ts`, the regenerated **tracked** `plugin/ui.html`, the gate test,
and `plans/260729-1510-plugin-panel-redesign/preview.html`.

## §1 — owner-locked typography rules (non-negotiable)

**One family.** `--font-family-body` is the single family var for the whole panel. Delete every use
of `--font-family-display` and `--font-mono` from the chrome (`panel.html` current uses at `:325`,
`:377`, `:411`, `:418`, `:433`, `:465`, `:477`, `:507` and every other `font-family:` line) — what
was mono becomes regular. The compiled DS block keeps declaring the other families (the gate asserts
`--font-family-body` exists at `:59`, and the block is regenerated, not hand-edited); they simply
stop being referenced.
*Consequence to keep:* numeric columns lose the mono face, so `font-variant-numeric: tabular-nums`
stays on every live-updating number (`.status-meta`, `.log-meta`, detail values) or the ages jitter.

**Exactly three sizes**, declared in the phase-01 skin `:root` and used nowhere else:

```css
  --fga-font-title: 14px;    /* the ONE title: the status sentence (block 1) */
  --fga-font-body: 13px;     /* every value, row label, activity sentence, button */
  --fga-font-caption: 11px;  /* labels above values, timestamps, the build id */
```
Mapping of every current usage (no other `font-size` may survive):

| Current | New token |
|---|---|
| `.brand-title` `--font-size-xs` | `--fga-font-caption` (the masthead is chrome, not a heading) |
| `.status-pill` / status sentence `--font-size-sm` | `--fga-font-title` |
| `.status-meta`, `.detail-cell dd`, `.log-label`, buttons, links, onboarding | `--fga-font-body` |
| `.section-label`, `.detail-cell dt`, `.log-meta`, `#fga-version` | `--fga-font-caption` |
| `--font-size-2xs` / `--font-size-3xs` (panel-only sizes added in P5) | **deleted** from the override `:root` (`panel.html:231-232`) |

`13px` and `11px` are below taste-lint's `tiny-body-text` threshold (≤13px is an **error**) — but the
rule fires on literal `font-size: Npx` declarations, and these are custom-property *declarations*
consumed via `var()`, exactly as `--font-size-2xs/3xs` are today (that is why the current file
passes). **Verify this before writing the rest of the CSS**: add the three tokens, run
`npx vitest run tests/figma-plugin-panel.test.ts`, confirm 0 taste errors.

**If it does fire (lead ruling):** the owner's three-size rule **wins for this surface** — caption
stays 11px. Record the collision as a *scoped exemption* in the gate, next to the assertion, naming
both rules and why this surface departs (a 240px-wide dense agent panel is not a page surface, the
same argument the existing 12/11px feed tokens already carry at `panel.html:221-226`). **Report it in
the phase report either way** — neither rule may be silently relaxed, and a future page surface must
not inherit the exemption.

**No text glyphs — anywhere.** Banned from markup *and* from CSS `content:`: `✗ ✓ ⟳ • ✕ × ↻ ●` and
friends. Current offenders: `panel-ui.ts:121` (`dot.textContent = state === 'failed' ? '✗' : ''`) and
any `content:` string that draws a mark. Every status glyph becomes an inline Phosphor SVG,
`aria-hidden="true"`, `fill="currentColor"`, sized by CSS:

| Meaning | Phosphor icon | Where |
|---|---|---|
| success / done | `check-circle` | activity row, connected status |
| failure | `x-circle` | activity row, broken status |
| in-flight | `circle-notch` (rotates; reduced-motion stops it) | pending activity row |
| warning / attention | `warning` | probing-too-long, sync failure |
| plain state dot | `circle` (filled) | status dot, peers indicator |

They are one family (Phosphor, matching the existing caret at `panel.html`'s footer) — taste-lint
errors on two icon families, so do not mix in another set. Add them as a small
`ICONS: Record<string, string>` map of path `d` strings in `panel-ui.ts`, injected with
`createElementNS` (never `innerHTML`), each `<svg aria-hidden="true" viewBox="0 0 256 256">`.
The row's state must still be readable without colour: keep the existing `aria-label` on the mark
(`panel-ui.ts:117`) and let the ICON SHAPE carry it visually.

## §2 — IA v2: three blocks + the sync prompt

The panel serves ONE file; the system serves many. Blocks, in DOM order:

### Block 1 — STATUS (sticky, `aria-live="polite"`)
`[dot icon] [one plain-language sentence]`. No pill/label/meta split, no error codes, no port
numbers. When the link is broken the sentence names **the problem and the next action**:

| State | Sentence |
|---|---|
| connected | `Connected — the CLI can drive this file.` |
| probing (<10s) | `Looking for the broker…` |
| probing (≥10s) | `Broker not running — run figma-agent status in a terminal.` |
| handshake | `Connecting…` |
| disconnected, never connected | `Not connected yet — your first CLI command starts the broker.` |
| disconnected, was connected | `Connection lost — reconnecting automatically.` |

These six strings live in `panel-model.ts` as one pure function
`statusSentence(state, ageMs, hadConnection): { text: string; tone: Tone }` — it replaces
`stateView` + `troubleshootHint` + `compactMeta` (all three currently split what is now one
sentence). Unit-test all six branches in `tests/panel-model.test.ts`.

### Block 2 — CONTEXT
Three label-over-value rows (phase-01's `.detail-cell` pattern, `--fga-font-caption` label over
`--fga-font-body` value):

| Row | Value | Source |
|---|---|---|
| File | this file's name + a `command target` indicator when this plugin is the broker's routing target + `N other files connected` when N>1 | `FILE_INFO` (existing) + the new `PEERS` event (§3) |
| Page | current page name | `FILE_INFO` (existing `page` field, `main.ts:52-58`) |
| Selection | first selected node's name + `+N more`, or `Nothing selected` | the new `selectionchange` announcement (§3) |

### Block 3 — ACTIVITY
Newest first, each row: `[icon] [sentence]` + a caption line with relative time. The sentence says
what the agent **did**, in English, with node names where the reply carries them — never a command
name. Pure mapping module in §4.

### The sync prompt stays
Unchanged behaviour (`#fga-sync`, `#fga-sync-msg`, `#fga-sync-now`, `#fga-sync-later`), restyled to
the new type scale; its copy already reads as a sentence (`panel-model.ts:105-123`).

### CUT ENTIRELY
Docs link (`#fga-docs`), Copy button (`#fga-copy`), the Details toggle (`#fga-toggle`,
`#fga-toggle-label`, `#fga-expanded`) and the four debug cells (`#fga-d-port`, `#fga-d-proto`,
`#fga-d-heartbeat`, `#fga-d-attempts`). Debug lives in `figma-agent status`.

**Consequences to carry out, not to discover later:**
- `panel-model.ts`: `PanelMode`, `togglePanelMode`, `detailsLabel`, `compactMeta` lose their
  consumer — delete them **and their tests** (`figma-agent/tests/panel-model.test.ts:84-87` plus the
  compact-meta cases). `stateView`/`troubleshootHint` are replaced by `statusSentence` (§2).
  **`showOnboarding` STAYS** — the onboarding card survives the cut (see below).
- **`PANEL_HEIGHT` collapses to one number** (`export const PANEL_HEIGHT = 420;`). Consumers in the
  working tree: `main.ts:47` (`figma.showUI(… PANEL_HEIGHT.compact)`) and the inline clamp in the
  `PANEL_RESIZE` handler (`main.ts:196` — note: phase-01 §10 specified a `resolvePanelSize` helper,
  but the tree has the clamp **inline**; there is no such export, so do not go looking for it).
- **Delete the `PANEL_RESIZE` path entirely.** Its only emitter is the Details toggle
  (`panel-ui.ts:307` region), which this phase removes — the handler at `main.ts:193-197` becomes
  unreachable code. Remove both. **This supersedes phase-01 §10** (width-preserving resize): with no
  programmatic resize left, a user-dragged width simply persists, which is what §10 was trying to
  buy. Phase-01's A5b acceptance is therefore satisfied by construction; note it in the report rather
  than re-testing a toggle that no longer exists.
- `panel-ui.ts`: delete the mode state, `applyMode`, the toggle listener, the copy handler and
  `fallbackCopy`, `renderDetails`' four debug writes, and the now-unused imports.
- `activity-feed.ts`: `activityLabel` and `activityMeta` lose their only consumer once rows render
  sentences. Delete them **and their cases in `figma-agent/tests/activity-feed.test.ts`**; keep
  `ActivityRecord` (its `label?`/`result?`/`pending` fields feed the sentence module and the root
  gate asserts them at `tests/figma-plugin-panel.test.ts:97-103`), `timeAgo`, `formatTimestamp`,
  `pushActivity`, `resolveActivity`, `toActivityRecord`, `toActivityResult`. `humanizeTool` moves to
  `activity-sentence.ts` as the unknown-command fallback stem.
- The **onboarding card** (`#fga-onboarding`) **stays — restyled, and it is priority-1 content**
  (lead ruling): in the disconnected state it *is* the problem-and-next-action answer Block 1 exists
  to give. It merely lived inside the deleted `#fga-expanded`; re-parent it directly under the status
  sentence, still driven by `showOnboarding` (first-run only, never after a successful connection),
  and restyle it to the new three-size scale — it is not a debug affordance and does not go with the
  cut controls.

### New id inventory (23 → 15 script-resolved; every one must resolve or the panel throws)
`fga-panel`, `fga-status` (block 1 section), `fga-dot`, `fga-sentence`, `fga-onboarding`,
`fga-ctx-file`, `fga-ctx-file-note` (target/peers line), `fga-ctx-page`, `fga-ctx-selection`,
`fga-activity`, `fga-sync`, `fga-sync-msg`, `fga-sync-now`, `fga-sync-later`, `fga-version`.
Plus two markup-only block containers the gate checks for DOM order: `fga-context`,
`fga-activity-block`, each carrying `class="fga-block"`.
(`fga-pill`, `fga-meta`, `fga-hint`, `fga-expanded`, `fga-toggle`, `fga-toggle-label`, `fga-d-port`,
`fga-d-proto`, `fga-d-heartbeat`, `fga-d-attempts`, `fga-d-file`, `fga-d-page`, `fga-copy`,
`fga-docs` are gone; `fga-d-file`/`fga-d-page` are renamed to the `fga-ctx-*` ids above.)

## §3 — the two additive behaviours

### (a) Selection in `FILE_INFO` — `plugin/src/main/main.ts`
`announceFileInfo` (`:52-58`) gains selection fields, and a `selectionchange` subscription joins the
existing `currentpagechange` one (`:60`):

```ts
function selectionSummary(): { selectionName: string | null; selectionCount: number } {
  const sel = figma.currentPage.selection;          // sync getter, allowed under dynamic-page
  return { selectionName: sel.length > 0 ? sel[0].name : null, selectionCount: sel.length };
}

function announceFileInfo(): void {
  figma.ui.postMessage({ type: 'FILE_INFO', data: {
    fileName: figma.root.name, page: figma.currentPage.name,
    fileKey: figma.fileKey ?? null, ...selectionSummary(),
  } });
}
figma.on('currentpagechange', announceFileInfo);
figma.on('selectionchange', announceFileInfo);      // NEW
```
Cost check: `selectionchange` fires on every click. `announceFileInfo` is a `postMessage` of five
scalars — no scene traversal, no async — so it is cheap; do **not** add debouncing (it would delay
the panel behind the user's own click).
Downstream: `ui-relay.ts:244-246` already forwards `FILE_INFO` verbatim to the broker and
`panel-ui.ts:207` already reads it — the new fields ride along with no relay change. The broker's
registry stores them via `updateScene` (`broker-daemon.ts:350`), which is additive
(`PluginScene` is `[k: string]: unknown`).

### (b) `PEERS` — a new additive `EventMsg` type
`shared/protocol.ts:123-125`: add `'PEERS'` to the `EventMsg` union. `PROTOCOL_VERSION` stays 1 (the
event is additive and ignorable).

Broker (`cli/src/transport/broker-daemon.ts`) — the target is **recency-based**, so registration and
disconnection are not the only things that move it: `updateScene` bumps `lastActiveAt`
(`plugin-registry.ts:74`, reached from the `FILE_INFO` branch at `broker-daemon.ts:350`) and every
reply calls `touchActive` (`:323`). Broadcasting only on register/remove would leave panels claiming
`command target` after the target has moved. Broadcast on **all four**, de-duplicated by signature so
a busy command stream does not spam the socket:

```ts
let lastPeersSig = '';
/** Tell every connected plugin how many peers exist and which one is the routing target. */
const broadcastPeers = (): void => {
  const target = st.registry.selectTarget(currentFilter());
  const entries = st.registry.liveEntries();
  const sig = `${entries.length}|${target?.instanceId ?? ''}`;
  if (sig === lastPeersSig) return;          // nothing a panel would render differently
  lastPeersSig = sig;
  for (const entry of entries) {
    const frame: EventMsg = { type: 'PEERS', data: {
      count: entries.length,
      isActiveTarget: target?.instanceId === entry.instanceId,
    } };
    try { if (entry.ws.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify(frame)); }
    catch { /* peer gone */ }
  }
};
```
Call sites: after `register` (`:335`), after `removeByWs` (`:295`), after `updateScene` (`:350`), and
after `touchActive` in the reply path (`:323`) — the signature check makes the last one nearly free.
This is **envelope-level fan-out to plugins**, not command interpretation — the broker still never
reads `cmd`/`params`, so the pure-relay rule (`DECISIONS.md:10`) holds. Keep it out of
`broadcastToClients` (that targets CLI clients).

Relay (`plugin/src/ui/ui-relay.ts`, beside the `SYNC_RESULT` branch at `:162`) — **a CustomEvent on
the iframe's own `window`, not `parent.postMessage`**: `parent.postMessage` goes iframe → plugin
main, and the panel listens on the iframe window (`panel-ui.ts:197`), so a posted frame would never
arrive. Copy the pattern `SYNC_RESULT` already uses:
```ts
  if (msg.type === 'PEERS') {
    try { window.dispatchEvent(new CustomEvent('figma-agent:peers', { detail: msg.data ?? {} })); }
    catch { /* no DOM event support */ }
    return;
  }
```
Panel (`panel-ui.ts`, beside the other `window.addEventListener` handlers at `:166`/`:177`):
`window.addEventListener('figma-agent:peers', …)` → store `{count, isActiveTarget}`, re-render
Block 2. Copy comes from a pure `panel-model.ts` helper `fileNote(count, isActiveTarget)`:

| count | isActiveTarget | Note under the file name |
|---|---|---|
| 1 | true | `command target` |
| 1 | false | *(empty — cannot happen today; render nothing rather than guess)* |
| >1 | true | `command target · N other files connected` |
| >1 | false | `N other files connected — commands go to another file` |

Unit-test all four branches. **This is the panel's honest answer to "which file will my command hit?"
— it must never say `command target` when the broker's target is elsewhere.**

## §4 — activity sentences: `plugin/src/ui/activity-sentence.ts` (NEW, pure, ~120 lines)

The feed currently prints `activityLabel` (the CLI's intent label or a humanized cmd) plus
`activityMeta` (duration + age + result fragment) — `activity-feed.ts:39`, `:99`. IA v2 needs one
English sentence about what happened. New module, no DOM, no Figma API, fully unit-tested in
`figma-agent/tests/activity-sentence.test.ts`:

```ts
export interface SentenceInput {
  tool: string;            // wire cmd — CREATE_FRAME, EXEC_JS, IMPORT_PAYLOAD…
  label?: string;          // the CLI's intent label, when it sent one
  result?: string;         // the plugin-derived result summary
  errorCode?: string;      // wire ErrorCode, when the reply failed
  errorMessage?: string;   // the plugin's own (already human) message
  nodeName?: string;       // ONLY when the reply actually carried a name
  pending: boolean;
  ok: boolean;
}

/** One English sentence about what the agent DID — never a command name. */
export function activitySentence(input: SentenceInput): string;
```

**Two data-plumbing facts checked in the tree — the module cannot invent what the wire discards:**

- **`errorCode` does not currently survive.** `ui-relay.ts:71` flattens a failed reply through
  `summarizeError` into a single `result` string, and `ActivityResult` keeps only `result`
  (`activity-feed.ts:129-136`). So phase 02 must carry it: add `code` to the `figma-agent:activity`
  `done` detail in `ui-relay.ts`, read it in `toActivityResult` (`:138`), store it on the record, and
  pass it here. Three additive lines; no new event.
- **`nodeName` needs a source — and the lead ruled the micro-addition IN SCOPE.** `IMPORT_PAYLOAD`
  already returns `{id, name, warnings}` and scan replies carry names, but three executors return an
  id only. Add an additive `name` to each (3 one-liners, `plugin/src/main/executor-ops.ts`):

  | Anchor | Today | Becomes |
  |---|---|---|
  | `:108` `opCreateFrame` (sig `:101`) | `return { id: frame.id };` | `return { id: frame.id, name: frame.name };` |
  | `:129` `opCreateInstance` (sig `:111`) | `{ id, mainComponent: {…} }` | `{ id: instance.id, name: instance.name, mainComponent: {…} }` |
  | `:194` `opSetText` (sig `:169`) | `return { id: node.id };` | `return { id: node.id, name: node.name };` |

  Purely additive: `cli/src/commands/create-frame.ts` / `create-instance.ts` / `set-text.ts` return
  the reply verbatim, and no consumer destructures a closed shape — but widen the two declared return
  types (`:101` `Promise<{ id: string }>` → `Promise<{ id: string; name: string }>`, `:169` likewise)
  or typecheck fails. `opCreateInstance` is already `Record<string, unknown>`.
  **Test note:** add one case per command to `figma-agent/tests/` asserting the reply carries a
  non-empty `name` (the mock's `FakeNode` maintains `name`, and `setProperties`/`createFrame` already
  exercise it — see `tests/helpers/mock-figma.ts` on `name` being a required property), plus a
  sentence test that `Created frame "Hero card"` renders when the record has one.

Rules (each a test case):
- pending → present continuous: `Creating a frame…`, `Running a script…`, `Importing a design…`
- success **with** a name on the reply → `Created frame "Hero card"`, `Imported "Hero card"`,
  `Set text on "Title"` — now reachable for create-frame / create-instance / set-text too, via the
  additive `name` field above.
- success without one (a script, a batch, an unknown command) → the plain past tense:
  `Ran a script`. Never fabricate a name.
- success carrying a count → `Scanned 42 nodes`, `Imported 3 components`.
- **failure → the reason, never a code**: `Colour bind failed — variable "brand/primary" does not exist`.
  Map the wire codes to sentence stems (`E_WRONG_FILE` → `That command was meant for another file`,
  `E_NO_PLUGIN` → `The plugin was not connected`, `E_EVAL` → `The script stopped: <message>`,
  `E_INVALID_ARGS` → `<message>`), then append the plugin's own message, which is already
  human-readable (phase-02 of the exec wave made those messages sentences).
- unknown `tool` → `humanizeTool` as the fallback stem (`Ran create variant set`), never a bare cmd.
- The caption line keeps `timeAgo` (`activity-feed.ts:78`), which is already relative.

`activity-feed.ts` keeps the record plumbing; `activity-summary.ts` keeps producing `result`.
Neither is rewritten — the sentence module consumes their output.

## §5 — gate extension (emitter + linter pairing, same commit)

Add to `tests/figma-plugin-panel.test.ts` (repo root), reusing the phase-01 `chrome`/`rules` helpers:

```ts
describe("figma-agent panel — typography contract (owner-locked)", () => {
  it("uses exactly one font family, through the single body var", () => {
    const families = [...chrome.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect([...new Set(families)]).toEqual(["var(--font-family-body)"]);
  });

  it("declares exactly three panel font sizes and uses no other size source", () => {
    const skin = [...html.matchAll(/:root\s*\{([\s\S]*?)\}/g)].at(-1)?.[1] ?? "";
    const declared = [...skin.matchAll(/(--fga-font-[a-z]+)\s*:/g)].map((m) => m[1]).sort();
    expect(declared).toEqual(["--fga-font-body", "--fga-font-caption", "--fga-font-title"]);
    const sizes = [...chrome.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    const bad = sizes.filter((v) => !/^var\(--fga-font-(title|body|caption)\)$/.test(v));
    expect(bad, `font-size values outside the three tokens: ${bad.join(" | ")}`).toEqual([]);
  });

  it("draws every mark as an SVG — no text glyphs in markup or CSS content", () => {
    const GLYPHS = /[✗✓⟳•✕×↻●○◆▪]/u;
    expect(GLYPHS.test(chrome), "glyph in CSS/markup").toBe(false);
    const contents = [...chrome.matchAll(/content:\s*(["'])(.*?)\1/g)].map((m) => m[2]);
    expect(contents.filter((c) => c.trim() !== ""), "content: must stay decorative-empty").toEqual([]);
  });
});

describe("figma-agent panel — IA v2 structure", () => {
  it("ships exactly three blocks, in order, plus the sync prompt", () => {
    const order = ["fga-status", "fga-context", "fga-activity-block", "fga-sync"]
      .map((id) => html.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0), `a block container is missing: ${order.join()}`).toBe(true);
    expect(order, "blocks must appear in IA order").toEqual([...order].sort((a, b) => a - b));
    // exactly three block sections — a fourth means the IA drifted
    expect((html.match(/class="[^"]*\bfga-block\b/g) ?? []).length).toBe(3);
  });

  it("keeps every id the panel script resolves, and the live regions", () => {
    for (const id of ["fga-panel", "fga-status", "fga-dot", "fga-sentence", "fga-onboarding",
                      "fga-ctx-file", "fga-ctx-file-note", "fga-ctx-page", "fga-ctx-selection",
                      "fga-activity", "fga-sync", "fga-sync-msg", "fga-sync-now", "fga-sync-later",
                      "fga-version"]) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
    expect((html.match(/aria-live="polite"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("has dropped the debug controls entirely — markup AND their dead CSS", () => {
    for (const gone of ["fga-docs", "fga-copy", "fga-toggle", "fga-toggle-label", "fga-expanded",
                        "fga-pill", "fga-meta", "fga-hint",
                        "fga-d-port", "fga-d-proto", "fga-d-heartbeat", "fga-d-attempts",
                        "fga-d-file", "fga-d-page"]) {
      expect(html, `${gone} must be gone`).not.toContain(gone);
    }
  });
});
```
**Existing assertions this phase invalidates — update them in the same commit, or the gate goes red
for the wrong reason:**

| Assertion | Why it breaks | Action |
|---|---|---|
| `tests/figma-plugin-panel.test.ts:120` `<a … target="_blank">` | the Docs link is cut | delete |
| `:82-88` — the four `stateView` keys **and** the verbatim strings `Ready — the CLI can drive this file.` / `The broker starts automatically on your first CLI command.` | `stateView` is replaced by `statusSentence` and both strings change (§2 Block 1) | rewrite against `statusSentence`: assert all four states still have copy and assert the two NEW sentences verbatim |
| `:97-106` — `label?:` / `result?:` / `pending:` on the feed + `summarizeResult`/`summarizeError` | still true: `ActivityRecord` keeps those fields and `activity-summary.ts` stays | keep, and **add** an assertion that `activity-sentence.ts` exists and exports `activitySentence`, else the old label/result split alone would satisfy the gate |
| phase-01 responsive block: `.footer-actions { flex-wrap: wrap }` | Details/Docs/Copy are the entire contents of that row; the row is deleted | drop `.footer-actions` from the wrap list (keep `.sync-actions`, `.identity-row`) |
| the new removed-id gate vs phase-01 CSS | phase-01 rules reference `#fga-expanded` (`panel.html:712`) and the toggle (`:687`) | those rules are dead after the cut — **delete them from `panel.html`** in this phase; "phase-01 blocks stay untouched" applies to the *test file's* skin/responsive blocks, not to CSS for deleted elements |

**The glyph ban must scan the TypeScript too.** The current `✗` is written by JS
(`panel-ui.ts:121`) and `Synced ✓` comes from `syncResultLabel` (`panel-model.ts:122`) — a
`panel.html`-only regex catches neither:
```ts
  it("draws every mark as an SVG — no text glyphs in markup, CSS, or the panel scripts", () => {
    const GLYPHS = /[✗✓⟳•✕×↻●○◆▪]/u;
    for (const [name, src] of [["panel.html", chrome], ["panel-ui.ts", panelUi], ["panel-model.ts", model]]) {
      expect(GLYPHS.test(src), `glyph in ${name}`).toBe(false);
    }
  });
```
(`panelUi` is a new `readFileSync` of `panel-ui.ts` beside the existing `MODEL`/`FEED` reads at
`tests/figma-plugin-panel.test.ts:19-30`.) Removing `✓` from `syncResultLabel` also breaks
`figma-agent/tests/panel-model.test.ts:109` and `figma-agent/tests/figma-sync-summary.test.ts:83`,
which assert that character — **update both** to the icon-free copy (`Synced — <summary>`), and let
the `check-circle` SVG carry the mark.

## §6 — preview rebuild (the owner's checkpoint artifact)

Regenerate `plans/260729-1510-plugin-panel-redesign/preview.html` in the **same gallery format**: 6
states × 3 widths, static HTML with the real panel markup + CSS inlined per cell, no JS.
States: connected · disconnected+onboarding · broker-not-running (the ≥10s sentence) · activity with
three sentences (one pending, one ok with a node name, one failure with a reason) · sync prompt ·
multi-file (`command target · 2 other files connected`, selection populated).
Widths: 240 / 320 / 480. Each cell labelled with state + width.

## §7 — post-implement audit, BEFORE the preview reaches the owner

Sequencing fix per `DECISIONS.md` (correctness is a gate, excellence is scored; the maker never
scores its own work):
1. **Correctness gate**: the 4 linters + the new blocks + `typecheck && build && test`, 0 errors.
2. **Excellence + duel**: a **fresh judge** — a subagent given ONLY the preview screenshots, the
   brief's signature list, `references/Reference.png`, and `knowledge/taste-rubric.md`; never the
   build transcript. It scores the rubric and duels the reference on: two-tier surfaces, dotted
   dividers, label-over-value, active row + accent, underlined inline links, footer identity.
   A clear loss on ≥2 signatures fails the pass.
3. Only after both: hand the preview to the owner.

## Validation

```bash
cd /Users/jang/orca/workspaces/ease-design/opah
npx vitest run tests/figma-plugin-panel.test.ts
cd figma-agent && npm run typecheck && npm run build && npm test
```
Then on the live plugin (rebuild, close + reopen once):
1. **Selection** — click a node, then several, then deselect: Block 2's Selection row tracks each
   change within a frame or two, and the panel does not stutter while dragging a selection.
2. **Peers** — open the plugin in a second file: both panels show the peer count, exactly one says
   `command target`, and it is the one `figma-agent status` reports as `activePlugin`. Close one:
   the survivor drops to `command target` alone.
3. **Activity sentences** — run `create-frame`, a failing `exec-js`, and a long script: rows read as
   sentences, the failure names a reason, the pending row shows the rotating `circle-notch`.
4. **Status sentences** — kill the broker, wait 10s: the sentence becomes
   `Broker not running — run figma-agent status in a terminal.`
5. **Typography** — devtools: every element's computed `font-family` is identical; computed
   `font-size` takes exactly three distinct values.
6. Re-run the phase-01 width matrix (240/280/320/480/640) — IA v2 must not reintroduce overflow.
7. §7 audit, then the preview.

## Risk & rollback

| Risk | L×I | Mitigation | Detect |
|---|---|---|---|
| 13px/11px tokens trip taste-lint's `tiny-body-text` (≤13px = error) | M×H | verified by adding the tokens FIRST and running the gate before any other edit; if it errors, stop and report — owner/doctrine call, not an implementation workaround | gate run, step 1 |
| Cutting ids breaks a surviving `el()` lookup → blank panel | M×H | §2 new inventory (15 ids) is the checklist; delete the const AND its uses together | panel blank on reload |
| `selectionchange` on every click floods the iframe | L×M | the handler posts five scalars, no traversal; measured by dragging a marquee in step 1 | panel stutter |
| `PEERS` says `command target` on the wrong plugin | L×H | the broker computes it from `selectTarget(currentFilter())` — the same call routing uses — and re-broadcasts on every registry change | step 2 vs `figma-agent status` |
| `PANEL_HEIGHT` shape change breaks `main.ts` | M×M | both consumers listed in §2 (`main.ts:47` and the `PANEL_RESIZE` clamp, which is deleted with the handler) | typecheck |
| An existing assertion still encodes the OLD IA and fails for the wrong reason | H×M | §5 tabulates all five (docs link, `stateView` strings, `.footer-actions` wrap, glyph asserts in two `figma-agent/tests/*`, the removed-id vs phase-01 CSS clash) with the action for each | gate run |
| `PEERS` or the error code is dropped in the relay plumbing | M×H | §3 uses the `CustomEvent` path `SYNC_RESULT` already proves, and §4 lists the three additive lines that carry `code` through `toActivityResult` | validation steps 2–3 |
| Sentence mapping invents facts the reply never carried | M×H | the module only renders fields present on the record; unknown tool → humanized stem; no default node name | unit tests |

Rollback: `git revert <sha>` + `npm run build` + reload. Phase 01 stays intact (separate commit).

## Conflicts — ALL FIVE RULED (lead, 2026-07-29)

1. **Three sizes vs taste-lint's 14px floor** → *proceed as specified* (tokens first, stop if it
   fires). If it fires, the **owner's 3-size rule wins for this surface**: caption stays 11px and the
   gate carries a scoped, documented exemption naming both rules. Report it either way; never
   silently relax either side. (§1)
2. **Onboarding card** → **KEEP, restyled** — it is priority-1 content, the problem-and-next-action
   answer for the disconnected state, not a debug affordance. (§2 CUT list)
3. **`PANEL_HEIGHT` → one number** → accepted. (§2)
4. **Node names** → **IN SCOPE** as a micro-addition: `CREATE_FRAME` / `CREATE_INSTANCE` / `SET_TEXT`
   gain an additive `name` on their results (3 one-liners + 2 return-type widenings, anchors in §4),
   so the feed carries real node names per the owner's priority. (§4)
5. **Phase-01 §10 (width-preserving resize) → superseded by construction**, accepted: this phase
   deletes the Details toggle, the only `PANEL_RESIZE` emitter, so nothing overrides a user-dragged
   width any more and the whole path is removed. Phase-01 A5b is satisfied by construction; note it
   in the report instead of testing a toggle that no longer exists. (§2)
