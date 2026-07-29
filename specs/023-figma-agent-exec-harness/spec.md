---
title: "figma-agent — Tầng B exec harness (canonical tree)"
description: "Make exec-js fail loud: normalization + warning envelope, --undo-group rollback, granular commitUndo, fail-loud ui.* stdlib."
status: pending
priority: P1
effort: 6h
branch: spec/021-scrollworld-gflow-video-track
tags: [figma-agent, plugin, exec-js, undo, data-integrity]
created: 2026-07-29
---

# Spec — Tầng B exec harness

**Target: the `figma-agent` workspace of the `ease-design` monorepo** (root `package.json`
`workspaces: ["a11y","figma-agent","recall"]`) — **not** a standalone repo.

**Implementation venue: `/Users/jang/orca/workspaces/ease-design/opah/figma-agent`**, branch
`jangtrinh/opah`, clean tree at `c591c4b` (includes the `figma-agent.localhost` probe fix).
Anchors below were first read in `/Users/jang/Products/ease-design/figma-agent` (`ddf451e`) and then
**verified byte-identical in the opah checkout** — all 12 anchor files `diff`-clean:
`plugin/src/main/{executor-ops,main,executor-variables,resolve-main-component,serialize-node}.ts`,
`shared/protocol.ts`, `cli/src/commands/{exec-js,scan-node,seat}.ts`,
`plugin/src/ui/activity-summary.ts`, `cli/src/util/json-out.ts`,
`cli/src/transport/protocol-helpers.ts` (plus `plugin/src/ui/ui-relay.ts`, which this phase does not
touch). Line numbers therefore hold in either checkout; implement in opah.

> **Process — RULED (lead, 2026-07-29):** implementation lands on `jangtrinh/opah` now; at
> finalization the polished spec + phase files are copied into `specs/NNN-exec-harness/` in-repo to
> satisfy the constitution's committed-spec rule (the lead does that at commit time). No spec-kit
> ceremony blocks implementation.
>
> Sha note: `7f25e38` was amended to `c591c4b` (commit-message trailer dropped per repo rules) — same
> tree, so the anchor diff-verification against `c591c4b` stands.

> ⛔ **Phase 01 is obsolete.** It was authored against `/Users/jang/Products/figma-design-agent`, a
> stale snapshot frozen 2026-07-02; backlog 1.4/1.5 were stale-toolchain artifacts (fixed and verified
> upstream: 0 disconnects/150s). The canonical broker already has a per-instance plugin registry,
> app-level PING/PONG, and request parking. See the banner in `phase-01-hotfix-eviction-fileguard.md`
> for the evidence and the two pieces still worth harvesting later (`--file`/`expectedFile` guard and
> `fileContext` echo — both verified absent upstream).

Direction (locked, do not relitigate): `direction-brief.md` in this folder.
Evidence: `plans/reports/research-260729-1006-figma-agent-improvement-verification.md`.
Backlog items covered by this wave: 2.1, 2.2, 2.4, 2.5, 3.1, 3.2, 3.4, part of 2.3, 4.1.
(1.4 + 1.5: resolved upstream / by the toolchain fix — no code.)

## Outcome

Two shippable phases (02 first — it is in flight; 03 rebases onto it):

| Phase | File | Kills |
|---|---|---|
| 02 | `phase-02-exec-harness.md` | silent-null exec-js (2.1 + 2.5), one-giant-undo-step (2.4), no rollback on partial failure (2.2), silent bind/prop failures (3.1/3.2/3.4) |
| 03 | `phase-03-file-guard-filecontext.md` | "which file did that land in?" — per-request `--file` routing + execution-time guard (`E_WRONG_FILE`) + `fileContext` echo on every reply (harvest of 1.4's data-integrity half) |
| 01 | `phase-01-hotfix-eviction-fileguard.md` | **OBSOLETE — do not implement** (kept for the harvest notes) |

Shared-file anchors between 02 and 03 are tabulated in `phase-03 §12`; they are additive at
different lines, but 03 must be rebased on 02's `main.ts` handler, not applied blind.

## Constraints (canonical tree + monorepo constitution)

- No MCP; the plugin (Plugin API, Figma Free) is the write path; the broker relays and never
  interprets `cmd`/`params` (`figma-agent/package.json` description; `cli/src/transport/broker-daemon.ts`
  header). The monorepo constitution (`.specify/memory/constitution.md`) governs on conflict.
- `PROTOCOL_VERSION` stays `1` (`shared/protocol.ts:5`). **Every wire change additive and optional** —
  the repo already holds this line explicitly for `RequestMsg.activity` (`shared/protocol.ts:50-66`,
  `makeRequestFrame:207` omits the field entirely when unset "so an unlabelled frame serializes
  byte-identically to what every pre-label CLI sent"). Same discipline for `error.rolledBack`.
- Plugin sandbox facts are settled, do not re-research: `AsyncFunction` blocked (only `eval`),
  ES2020 (`plugin/tsconfig.json`), no `setTimeout` in the MAIN thread paths we add, undo order
  exactly as smoke-tested (report §"Smoke tests" 1).
- Repo rules: modularize >200 lines, kebab-case, comments state the invariant — never a plan/phase/
  audit label. Reuse the existing shared leaf instead of a second copy (`resolve-main-component.ts:1-10`).
- Mocks must reproduce the API's **refusals** — never make `tests/helpers/mock-figma.ts` more
  permissive (its header records what that cost).
- Fixtures live on a `[fixture] …` page and are deleted after verification.

## Non-goals (explicitly out of this wave)

- Anything phase 01 designed (slot rejection, grace window, outbox) — superseded upstream.
- `--file`/`expectedFile` guard + `fileContext` echo — verified missing upstream, but a **separate**
  small spec; not folded in here.
- New typed commands (`create-variant-set`, `assert` presets), `nodechange` feed, job visibility,
  indexed scan, rate-limit work.
- Fixing `seat.ts:54`'s envelope-unwrap bug (reported below, untouched).

## Gate

```bash
cd /Users/jang/orca/workspaces/ease-design/opah/figma-agent
npm run typecheck && npm run build && npm test
```
Baseline before touching anything: **453 tests green across 46 suites** (`tests/*.test.ts`) — record
the count again after the change; the three new suites must raise it, and nothing may go red.
`npm test` here = `vitest run --config vitest.config.ts` (`figma-agent/package.json`), the workspace's
own suite — the repo **does** have tests (unlike the stale snapshot), so pure logic added by this
phase ships with coverage. The monorepo root's `npm run lint` globs the root `src tests` only and does
not cover this workspace; root `npm test` runs the `ui` binary suite and must stay untouched.

## Acceptance criteria — concrete checks

Preconditions for canvas checks: Figma Desktop open, plugin rebuilt (`npm run build`) and
**closed + reopened once** after the rebuild (first run after a `code.js` rebuild can serve a stale
bundle), fixture page `[fixture] exec-harness` created on a scratch file.

All canvas commands run from `/Users/jang/Products/ease-design/figma-agent`.

### A1 — SUPERSEDED (phase 01 obsolete)
Eviction loop resolved by the toolchain fix; the canonical broker's per-instance registry
(`cli/src/transport/plugin-registry.ts:57-70`) already refuses to evict a different instance.
Regression cover exists upstream: `tests/plugin-registry.test.ts`, `tests/reconnect-backoff.test.ts`,
`tests/connection-state.test.ts`.

### A2 — `--file` guard: wrong file never executes (phase 03)
```bash
node cli/dist/figma-agent.js exec-js - --file 'Definitely Not A File' <<< 'figma.createFrame().name="SHOULD-NOT-EXIST"; return 1'
```
PASS = exit 1 with `E_NO_PLUGIN` naming `--file "Definitely Not A File"` and listing the connected
files (routing refused first). When the name *does* match a connected plugin but the file has since
been renamed, PASS = `E_WRONG_FILE` + `fileContext` of the real file, and
`figma.currentPage.findChildren(n=>n.name==='SHOULD-NOT-EXIST').length === 0`.

### A2b — routing with TWO files connected (phase 03, the new capability)
```bash
node cli/dist/figma-agent.js exec-js - --file 'Platform - Design System' <<< 'return figma.root.name'
node cli/dist/figma-agent.js exec-js - --file 'VSF - PCP'                <<< 'return figma.root.name'
FIGMA_AGENT_FILE='VSF' node cli/dist/figma-agent.js exec-js - --file 'Platform - Design System' <<< 'return figma.root.name'
```
PASS = each returns its own file name regardless of which panel was touched last; the third proves
precedence `--file` > `FIGMA_AGENT_FILE` > most-recently-active.

### A8 — every reply carries `fileContext.fileName` (phase 03)
```bash
node cli/dist/figma-agent.js get-selection | grep -q '"fileContext"' && echo ok
node cli/dist/figma-agent.js exec-js - <<< 'throw new Error("x")'; echo "exit=$?"
```
PASS = `ok`, and the failing command prints `{"error":{…},"fileContext":{…}}` with exit 1 — including
iframe-originated errors, which never reach the plugin main thread.

### A3 — trailing `;` no longer silently no-ops (backlog 2.5)
```bash
printf '(async () => { const f = figma.createFrame(); f.name = "[fixture] a3"; return f.id })();\n' > /tmp/a3.js
node cli/dist/figma-agent.js exec-js /tmp/a3.js
```
PASS = `result` is the frame id (not `null`), `executed: true`, `mode: "expression"`.
```bash
printf 'const n = figma.currentPage.children.length;\nfigma.createFrame().name = "[fixture] a3b";\n' > /tmp/a3b.js
node cli/dist/figma-agent.js exec-js /tmp/a3b.js
```
PASS = `executed: true`, `mode: "statement"`, `result: null`, `warning` contains
`no explicit return`; the same warning line appears on **stderr** while stdout stays one JSON object.

### A4 — `--undo-group` rolls the script back (backlog 2.2)
```bash
cat > /tmp/a4.js <<'JS'
const f = figma.createFrame(); f.name = "[fixture] a4-created";
figma.currentPage.appendChild(f);
await figma.getNodeByIdAsync(f.id);          // async boundary, as smoke-tested
throw new Error("boom after mutation");
JS
node cli/dist/figma-agent.js exec-js /tmp/a4.js --undo-group
```
PASS = exit 1, `{"error":{"code":"E_EVAL","message":"runtime error: boom after mutation — changes rolled back","rolledBack":true}}`,
and `[fixture] a4-created` does **not** exist afterwards; a frame created by a *previous*, separate
exec-js call still exists (prior undo step untouched).

### A4b — error before any mutation must not eat prior work (new risk, must be measured)
```bash
node cli/dist/figma-agent.js exec-js - --undo-group <<'JS'
const n = await figma.getNodeByIdAsync("1:999999");
n.name = "never";                              // throws before any mutation
JS
```
PASS = error reported, **and** the node created in A4's preceding step is still present
(`getNodeByIdAsync` non-null). This is the sentinel guard described in phase 02 §4.

### A5 — `ui.setProps` (backlog 3.1 + 3.2)
On the fixture page, one instance with an `INSTANCE_SWAP` property and one text property.
```bash
node cli/dist/figma-agent.js exec-js - <<'JS'
const inst = await figma.getNodeByIdAsync("<INSTANCE_ID>");
return await ui.setProps(inst, { Icon: "<COMPONENT_KEY>", Label: "hello" });
JS
```
PASS = returned props map shows the swap applied; verify independently
`(await inst.getMainComponentAsync()).id` equals the imported component id.
```bash
node cli/dist/figma-agent.js exec-js - <<'JS'
const inst = await figma.getNodeByIdAsync("<INSTANCE_ID>");
return await ui.setProps(inst, { Icn: "x" });
JS
```
PASS = `E_EVAL` whose message lists the available property names.

### A6 — granular undo (backlog 2.4, manual)
Run three mutating commands (`create-frame` ×2, `set-text` ×1). In Figma press ⌘Z three times:
each press reverts exactly one command; the fourth press reaches pre-session state. Record the
observation in the phase-02 validation log.

### A7 — gate green
`npm run typecheck && npm run build && npm test` exits 0 in `figma-agent/`.

### A9 — unit coverage lands with the logic (canonical repo convention)
```bash
npx vitest run --config vitest.config.ts tests/exec-js-normalize.test.ts tests/exec-undo-group.test.ts tests/exec-stdlib-props.test.ts
```
PASS = three new suites green, covering: expression-vs-statement mode selection incl. the trailing-`;`
regression, `resultWarning` classification (undefined/null/[]/{} warn; `0`/`false`/`''`/`{a:1}` do not),
`summarize` of node-ish values, the `begin→commit` / `begin→rollback` undo order via an injected
bracket, and `resolvePropKey` (exact / `#id` suffix / miss lists available / ambiguous throws).

### A10 — internal EXEC_JS callers unaffected
```bash
node cli/dist/figma-agent.js scan-node <NODE_ID> --depth 1 | head -5
```
PASS = a spec, not an envelope — both unwrappers key off `'result' in r && ('console' in r || 'ms' in r)`
(`cli/src/commands/scan-node.ts:46-56`, `plugin/src/ui/activity-summary.ts:33-39`), which the new
`executed`/`mode`/`warning` fields do not disturb.

## Risk register (phase-level detail in each phase file)

| Risk | L×I | Mitigation |
|---|---|---|
| `--undo-group` `triggerUndo` eats the *previous* undo step when the script threw before mutating | M×H | sentinel node makes the group provably non-empty; A4b measures it on real canvas |
| A `--undo-group` script calls `figma.commitUndo()` itself → partial rollback reported as full | L×H | contract in `--help` + module comment; not detectable in-sandbox |
| CLI `E_TIMEOUT` while the script keeps running and mutating (no plugin-side cancellation) | M×M | documented limit; callers split long scripts |
| Expression-form normalization changes semantics of scripts that relied on the old fallback | L×M | strip only trailing `;`/whitespace; the statement attempt still receives the original source; unit-tested (A9) |
| New envelope fields break an internal EXEC_JS consumer | L×H | 5 call sites enumerated in phase 02 §6; both unwrappers match by shape, not by exhaustive keys — A10 |
| Per-command `commitUndo` splits a command from its correction-memory bookkeeping | L×M | commit placed after `recordAgentMutation`, never inside `dispatch` |
| Old plugin bundle + new CLI (user forgets to reload) | M×M | all fields optional; `undoGroup` unknown to an old plugin ⇒ ignored (no rollback, same as today); "reload the plugin" is in the validation steps |

## Rollback

One commit. Rollback = `git revert <sha>`, `npm run build`, reload the plugin in Figma. Scripts
written against `ui.*` then fail loudly (`ui is not defined`) rather than silently — the reason the
stdlib is an injected parameter, not a monkey-patch on `figma`.

## Unresolved questions

1. ~~Process~~ — **RESOLVED 2026-07-29 (lead):** implement on `jangtrinh/opah`; the polished spec +
   phase files are copied into `specs/NNN-exec-harness/` at commit time by the lead, satisfying the
   constitution's committed-spec rule. No spec-kit step gates implementation.
2. `--undo-group` stays opt-in this wave; default-on only after A4/A4b pass on real canvas twice.
3. Plugin-side execution timeout cannot exist in the MAIN sandbox (no `setTimeout`, `eval`
   uninterruptible). `params.timeoutMs` is sent (`cli/src/commands/exec-js.ts`) and ignored; a CLI
   `E_TIMEOUT` abandons the reply while the script keeps mutating, so `--undo-group` cannot rescue a
   timed-out run. Documented in `--help`; do not design Tầng A assuming cancellation.
4. Pre-existing bug observed, not fixed: `cli/src/commands/seat.ts:54-55` reads `res?.wrote` off the
   EXEC_JS **envelope** instead of `res.result.wrote`, so the seat probe's `writeOk` can never be
   `true`. Own fix, own commit — flagged so it is not attributed to this wave.
5. ~~Harvest question~~ — **RESOLVED:** approved and authored as
   `phase-03-file-guard-filecontext.md` (routing precedence + guard + `fileContext` echo).
