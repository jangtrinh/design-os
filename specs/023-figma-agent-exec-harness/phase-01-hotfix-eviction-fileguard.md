> # ⛔ OBSOLETE — DO NOT IMPLEMENT (2026-07-29)
>
> This phase was authored against `/Users/jang/Products/figma-design-agent`, a **stale standalone
> snapshot frozen 2026-07-02**. The canonical live tree is
> **`/Users/jang/Products/ease-design/figma-agent/`** (monorepo workspace; the Figma manifest points
> there). Backlog **1.4** (eviction loop) and **1.5** (~30s socket death) were **stale-toolchain
> artifacts** — a wrong symlink ran the dead snapshot's binary. Toolchain fixed and verified by the
> lead: 0 disconnects in 150s.
>
> The canonical broker already solves what this phase designed, better:
> - **per-instance registry, no eviction** — `cli/src/transport/plugin-registry.ts:1-7` ("replaces the
>   old single `pluginWs` — two Figma files open at once used to evict each other on every
>   PLUGIN_HELLO"), `register()` at `:57-70` "NEVER evicts a DIFFERENT instance", routing by recency
>   at `:148-155`;
> - **application-level PING/PONG heartbeat** (a browser WebSocket cannot send protocol pings) —
>   `shared/protocol.ts:84-88`, `PLUGIN_HEARTBEAT_INTERVAL_MS` / `PLUGIN_PONG_TIMEOUT_MS`;
> - **request parking instead of instant `E_NO_PLUGIN`** — `PLUGIN_WAIT_MS = 12_000`
>   (`shared/protocol.ts`), `forwardToPlugin` parks + `flushWaiting` re-dispatches
>   (`cli/src/transport/broker-daemon.ts:195-240`) — a superset of this phase's grace window;
> - **reconnect backoff + jitter** constants (`shared/protocol.ts`, `RECONNECT_BACKOFF_*`).
>
> Kept for the record (and for the two harvestable pieces below), per the lead's instruction.
>
> ## Harvest verdict against the canonical tree — checked, not assumed
>
> `grep -rn "expectedFile\|fileContext" plugin/src cli/src shared` in the canonical tree → **0 hits.**
>
> | Piece | Still missing upstream? | Notes |
> |---|---|---|
> | `--file` / `expectedFile` per-request guard (§1, §3, §6, §7 below) | **YES — worth harvesting** | Canonical has only a **broker-process-wide env pin**: `FIGMA_AGENT_FILE` read by `currentFilter()` (`broker-daemon.ts:47-52`, used `:196`, `:201`, `:238`, `:343`, `:388`). It is case-insensitive **substring** matching, set once for the whole daemon, and it selects a *routing target* — it never asserts, at execution time inside the plugin, that the file about to be mutated is the intended one. A per-invocation `--file` + `main.ts` guard is strictly additional safety. |
> | `fileContext` echo on every reply (§1, §3, §4) | **YES — worth harvesting** | Absent. Partial mitigations exist: `opStatus()` returns `fileName`, `figma-agent status` lists `plugins[]` with `fileName`/`page` (`PluginStatusEntry`, `shared/protocol.ts`), and the panel shows File/Page (`main.ts:47-54 announceFileInfo`). None of those proves *which file answered this particular command*. |
> | Rejection flow, `PLUGIN_REJECTED`, close code 4001, panel Retry, grace timer, ui-relay outbox, `scripts/check-broker-slot.mjs` | **NO — superseded** | Registry + heartbeat + parking cover the ground; re-implementing would fight the upstream design. |
>
> Harvest, if the owner wants it, is a **separate small spec** (~1–2h) against the canonical tree, not
> this file. Everything below this banner describes the stale tree's line numbers and is retained
> only as design rationale.

# Phase 01 — hotfix: single-slot rejection + file guard + fileContext echo + reconnect grace

Repo: `/Users/jang/Products/figma-design-agent` (branch `master`, clean at `873f69f`).
Ship alone. Estimated 4h incl. one canvas run. Gate: `npm run typecheck && npm run build`.

Covers backlog **1.4** (eviction loop, wrong-file mutation) and **1.5** (30s socket lifetime →
spurious `E_NO_PLUGIN` + lost replies; measured 2026-07-29, see §2b/§4 outbox).

## Context

`broker-daemon.ts:147` terminates the incumbent plugin on every `PLUGIN_HELLO`; the evicted plugin
auto-reconnects (`ui-relay.ts:206-210` → `scheduleReconnect` at `:217`, 1s backoff) and evicts back
— 463 re-registers in 6 minutes, and while the storm runs a CLI command lands in whichever file
holds the slot at that instant (wrong-file mutation).

Second gap found while reading: **`FILE_INFO` is never produced.** `ui-relay.ts:19` initialises
`fileInfo = {}` and `:133` only forwards a `FILE_INFO` message from main — but no `figma.ui.postMessage`
in `plugin/src/main/*` ever sends one (verified: the only `FILE_INFO` occurrences in the repo are
`broker-daemon.ts:153`, `ui-relay.ts:19/133/135/211`, `shared/protocol.ts:68`). So `PLUGIN_HELLO`
today carries no `fileName`, and neither slot arbitration nor `fileContext` echo can work without
fixing it. That fix is part of this phase.

Data flow after this phase:

```
main (figma.root.name)
  ──FILE_INFO──▶ ui-relay (cached fileInfo)
                   ──PLUGIN_HELLO{fileName}──▶ broker (slot arbitration; envelope only)
CLI --file X ──RequestMsg{expectedFile:X}──▶ broker (relayed verbatim) ──▶ ui-relay
                   ──postMessage{expectedFile}──▶ main: guard vs figma.root.name → dispatch | E_WRONG_FILE
main reply {ok,result,fileContext} ──▶ ui-relay ──▶ ReplyMsg{fileContext} ──▶ broker ──▶ CLI stdout

~30s socket death (plugin-side, iframe survives):
  broker: hold st.pending 5s, defer PLUGIN_GONE ──▶ same-file PLUGIN_HELLO ──▶ pending resumes (id-correlated)
  iframe: replies produced while ws is down go to the outbox ──▶ flushed right after PLUGIN_HELLO
```

## Changes by file

### 1. `shared/protocol.ts` — additive only, `PROTOCOL_VERSION` stays 1

At `:46-64` (envelopes) and `:67-70` (events) and `:84-92` (errors):

```ts
// after the BrokerAdvertisement block (~:23), new exported type
/** File identity echoed on every reply so a caller can prove which file answered. */
export interface FileContext {
  fileName: string;
  fileKey?: string | null; // undefined for non-org plugins — never used for routing
}

export interface RequestMsg {
  id: string;
  cmd: CommandName;
  params: unknown;
  v: number;
  expectedFile?: string; // envelope-level so the broker can route on it later without parsing params
}

export interface ReplyOk  { id: string; ok: true;  result: unknown; fileContext?: FileContext }
export interface ReplyErr { id: string; ok: false; error: WireError; fileContext?: FileContext }

/** Reply error payload. `rolledBack` is set by EXEC_JS --undo-group (phase 02). */
export interface WireError { code: ErrorCode; message: string; rolledBack?: boolean }

export interface EventMsg {
  type: 'BROKER_HELLO' | 'PLUGIN_HELLO' | 'FILE_INFO' | 'PLUGIN_GONE' | 'PLUGIN_REJECTED';
  data: Record<string, unknown>;
}

export type ErrorCode =
  | 'E_NO_BROKER' | 'E_NO_PLUGIN' | 'E_TIMEOUT' | 'E_INVALID_ARGS' | 'E_PLUGIN_ERROR'
  | 'E_EVAL' | 'E_VERSION_MISMATCH' | 'E_CHUNK_LOST'
  | 'E_WRONG_FILE';

/** WS close code the broker uses when refusing a second plugin (slot already held). */
export const WS_CLOSE_SLOT_HELD = 4001;
```

`ReplyErr.error` was inline `{ code; message }` at `:62` — replacing it with `WireError` is
structurally identical plus one optional field (no consumer break; `broker-daemon.ts:43` and
`ui-relay.ts:53` keep compiling).

### 2. `cli/src/transport/broker-daemon.ts` — refuse, never terminate

State (`:20-26`) gains the rejection log throttle; keep `pluginInfo` as the holder record:

```ts
interface BrokerState {
  pluginWs: WebSocket | null;
  pluginInfo: Record<string, unknown> | null;
  cliClients: Set<WebSocket>;
  pending: Map<string, WebSocket>;
  lastBusyAt: number;
  rejectLog: { at: number; suppressed: number };  // ≤1 warning line per REJECT_LOG_WINDOW_MS
  takeovers: number[];                            // takeover timestamps — flap guard
  graceTimer: ReturnType<typeof setTimeout> | null; // pending survives a plugin reconnect (1.5)
}
```
**The initializer at `:74` must be updated in the same edit** (otherwise TS2741 — missing property):
```ts
const st: BrokerState = {
  pluginWs: null, pluginInfo: null, cliClients: new Set(), pending: new Map(),
  lastBusyAt: Date.now(),
  rejectLog: { at: 0, suppressed: 0 },   // 0, not Date.now(): the FIRST rejection must log
  takeovers: [],
  graceTimer: null,
};
```
Add near `IDLE_CHECK_MS` (`:16`):
```ts
const REJECT_LOG_WINDOW_MS = 60_000;
const FLAP_WINDOW_MS = 60_000;
const FLAP_MAX_TAKEOVERS = 3;   // more than this in the window ⇒ refuse everyone for a while
// Measured 2026-07-29: the plugin↔broker socket dies on a hard ~30.0s cadence (plugin-side,
// traffic-independent, same iframe throughout) and ui-relay is back in ~0.6s. Hold in-flight
// work across that gap instead of failing it. Same 5s shape as
// reference/figma-console-mcp/src/core/websocket-server.ts:586-609.
const PLUGIN_GRACE_MS = 5_000;
```

Helpers (place above `handleMessage`, after `handleClose` at `:130`):

```ts
const holderFileName = (): string | null => {
  const n = st.pluginInfo?.fileName;
  return typeof n === 'string' && n ? n : null;
};
const holderFileKey = (): string | null => {
  const k = st.pluginInfo?.fileKey;
  return typeof k === 'string' && k ? k : null;
};

/**
 * Same-file identity: fileKey when BOTH sides have one (non-org plugins get undefined),
 * otherwise fileName. Two files that share a name and have no key are indistinguishable —
 * that residual case is bounded by the flap guard below, not by this comparison.
 */
const isSameFile = (inName: string | null, inKey: string | null): boolean => {
  const hKey = holderFileKey();
  if (inKey && hKey) return inKey === hKey;
  const hName = holderFileName();
  return !!inName && !!hName && inName === hName;
};

/** More than FLAP_MAX_TAKEOVERS slot handovers in a minute = something is ping-ponging: refuse all. */
const isFlapping = (): boolean => {
  const now = Date.now();
  st.takeovers = st.takeovers.filter((t) => now - t < FLAP_WINDOW_MS);
  return st.takeovers.length >= FLAP_MAX_TAKEOVERS;
};

/** Fail every in-flight request bound to the plugin slot (holder is being replaced/lost). */
const failPending = (message: string): void => {
  for (const [id, client] of st.pending) sendReplyErr(client, id, 'E_NO_PLUGIN', message);
  st.pending.clear();
};

const logRejection = (incoming: string | null, held: string | null): void => {
  const now = Date.now();
  if (now - st.rejectLog.at < REJECT_LOG_WINDOW_MS) { st.rejectLog.suppressed++; return; }
  const extra = st.rejectLog.suppressed > 0 ? ` (+${st.rejectLog.suppressed} suppressed)` : '';
  log(`WARN slot held by "${held ?? '?'}" — refused plugin from "${incoming ?? '?'}"${extra}`);
  st.rejectLog.at = now;
  st.rejectLog.suppressed = 0;
};
```

Replace the `PLUGIN_HELLO` branch (`:146-151`) with:

```ts
if (msg.type === 'PLUGIN_HELLO') {
  const incomingFile = typeof msg.data.fileName === 'string' ? msg.data.fileName : null;
  const incomingKey = typeof msg.data.fileKey === 'string' ? msg.data.fileKey : null;
  const held = holderFileName();
  const holder = st.pluginWs;
  const holderLive = !!holder && holder !== ws && holder.readyState === WebSocket.OPEN;
  // Same file reconnecting (Figma kills the plugin iframe on its own) takes the slot over;
  // a different file must never displace the holder — that ping-pong is the eviction loop.
  const sameFile = isSameFile(incomingFile, incomingKey);
  const flapping = isFlapping();
  if (holderLive && (!sameFile || flapping)) {
    st.cliClients.delete(ws);
    const rejected: EventMsg = {
      type: 'PLUGIN_REJECTED',
      data: {
        reason: flapping ? 'FLAPPING' : 'SLOT_HELD',
        heldBy: { fileName: held },
        message: flapping
          ? `figma-agent slot changed hands ${FLAP_MAX_TAKEOVERS}+ times in a minute — refusing new registrations; close every figma-agent plugin panel but one, then press Retry`
          : `figma-agent is already connected to "${held ?? 'another file'}" — close the plugin there first`,
      },
    };
    try { ws.send(JSON.stringify(rejected)); } catch { /* peer already gone */ }
    try { ws.close(WS_CLOSE_SLOT_HELD, 'slot held by another file'); } catch { /* ignore */ }
    logRejection(incomingFile, held);
    return;
  }
  if (holder && holder !== ws) {
    // Same file (or a dead holder): close the stale socket and clear its in-flight work.
    st.takeovers.push(Date.now());
    failPending('Figma plugin reconnected mid-request');
    try { holder.close(1000, 'replaced by reconnect from the same file'); } catch { /* ignore */ }
  }
  st.cliClients.delete(ws);
  st.pluginWs = ws;
  st.pluginInfo = msg.data;
  log(`plugin registered: ${JSON.stringify(msg.data)}`);
}
```

Notes for the implementer:
- `ws.send()` then `ws.close()` on the `ws` package writes the data frame before the close frame
  (same socket, ordered) — but the plugin must not depend on it: `ui-relay` also treats close code
  `4001` as a rejection (below). Two independent signals by design.
- A rejected socket was removed from `cliClients`, so its later `close` takes the harmless
  else-branch of `handleClose`.

#### 2b. `handleClose` (`:118-130`) — hold pending across the 30s reconnect (backlog 1.5)

The plugin socket dies every ~30.0s on its own (plugin-side close, phase-locked to the connection,
unaffected by app traffic; the iframe survives — same `instanceId` — and reconnects in ~0.6s).
Today `handleClose` fails every pending request and clears the map, so ~2% of commands get a
spurious `E_NO_PLUGIN` and any exec-js straddling the deadline loses its reply while its side
effects stand. Replace the plugin branch with a grace window:

```ts
  const handleClose = (ws: WebSocket): void => {
    if (ws === st.pluginWs) {
      st.pluginWs = null;
      // pluginInfo is deliberately KEPT: it is the identity a reconnecting plugin is matched
      // against (isSameFile), and it is what tells us whom the slot still belongs to.
      log(`plugin disconnected — holding ${st.pending.size} pending for ${PLUGIN_GRACE_MS}ms`);
      if (st.graceTimer) clearTimeout(st.graceTimer);
      st.graceTimer = setTimeout(() => {
        st.graceTimer = null;
        if (st.pluginWs) return;                      // defensive: PLUGIN_HELLO already cleared it
        st.pluginInfo = null;
        log('grace expired → PLUGIN_GONE');
        failPending('Figma plugin disconnected mid-request');
        broadcastToClients(JSON.stringify({ type: 'PLUGIN_GONE', data: {} } satisfies EventMsg));
      }, PLUGIN_GRACE_MS);
    } else {
      st.cliClients.delete(ws);
      for (const [id, client] of st.pending) if (client === ws) st.pending.delete(id);
    }
  };
```

Decisions this encodes (all deliberate, all verified against the current code):

- **`PLUGIN_GONE` is deferred to grace expiry.** CLI clients treat it as terminal — `broker-client.ts:79-81`
  rejects the in-flight request with `E_NO_PLUGIN` the moment it arrives — so broadcasting it during
  the window would defeat the window. Reconnect within 5s ⇒ the event is never sent at all.
- **`st.pending` stays intact and keeps working after the reconnect.** Traced: the reply is produced
  by the plugin MAIN thread, posted to the *surviving* iframe, and written by `ui-relay` to whatever
  socket is current; the broker accepts replies from `st.pluginWs` (`handleMessage:139/142`) and
  `routeFromPlugin` (`:110-116`) resolves the requester purely by request **id** — the socket the
  request was sent on is never consulted. So a reply arriving on the NEW socket for a request sent
  on the OLD one routes correctly, by design.
- **`setInterval`/`setTimeout` are Node-side here** — the sandbox restriction applies only to
  `plugin/src/main/*`.
- The grace timer must be cleared on broker `shutdown` paths only insofar as the process exits
  anyway; no extra bookkeeping needed.

And in the `PLUGIN_HELLO` registration path, immediately before promoting the socket (after the
takeover branch), close the window:

```ts
  if (st.graceTimer) {
    clearTimeout(st.graceTimer);
    st.graceTimer = null;
    // During grace st.pluginWs is null, so the rejection branch above cannot fire and a DIFFERENT
    // file is able to claim the free slot. Its replies would answer another file's requests — so
    // that case, and only that case, fails the held work immediately (no PLUGIN_GONE broadcast:
    // failPending already answers exactly the affected requests, and the new plugin is live).
    if (!isSameFile(incomingFile, incomingKey)) {
      failPending('Figma plugin was replaced by a different file mid-request');
    }
  }
```
- Import `WS_CLOSE_SLOT_HELD` in the existing `shared/protocol.ts` import block (`:8-11`).
- Nothing here reads `cmd` or `params` — the broker stays a pure relay (DECISIONS.md:10).

### 3. `plugin/src/main/main.ts` — FILE_INFO, expectedFile guard, fileContext on every reply

Imports/consts after `:22` (`figma.showUI`):

```ts
/** Sync getters only — figma.root.name is cheap and safe under dynamic-page. */
function fileContext(): { fileName: string; fileKey: string | null } {
  let fileKey: string | null = null;
  try { fileKey = (figma as unknown as { fileKey?: string }).fileKey ?? null; } catch { fileKey = null; }
  return { fileName: figma.root.name, fileKey };
}
function postFileInfo(): void {
  figma.ui.postMessage({ type: 'FILE_INFO', data: fileContext() });
}
```

`UiRequest` (`:26`) gains `expectedFile?: string`. Rewrite the handler (`:28-37`):

```ts
figma.ui.onmessage = async (msg: unknown) => {
  const req = msg as (Partial<UiRequest> & { type?: string }) | null;
  if (!req) return;
  if (req.type === 'UI_READY') { postFileInfo(); return; } // the iframe pulls identity when it is ready
  if (typeof req.requestId !== 'string' || typeof req.cmd !== 'string') return; // relay chatter
  const ctx = fileContext();
  try {
    if (typeof req.expectedFile === 'string' && req.expectedFile.trim() !== ''
        && req.expectedFile.trim() !== ctx.fileName.trim()) {
      // Guard runs BEFORE dispatch: a wrong-file command must never touch the scene.
      throw withCode(
        new Error(`this plugin is connected to file "${ctx.fileName}", command expected "${req.expectedFile}" — nothing was executed`),
        'E_WRONG_FILE',
      );
    }
    const result = await dispatch(req.cmd, req.params ?? {});
    figma.ui.postMessage({ requestId: req.requestId, ok: true, result, fileContext: ctx });
  } catch (err) {
    figma.ui.postMessage({ requestId: req.requestId, ok: false, error: shapeError(err), fileContext: ctx });
  }
};
```

Guard placement is deliberate: it is **outside** `dispatch`, so `runBatch` (`:128`) and
`importPayload` (`:72`) recursion is checked once, at the wire boundary, not per sub-op.

`shapeError` (`:39-43`) stays; `withCode` is already imported (`:12`).

Also send the identity proactively once, right after `figma.showUI` (`:22`) — belt and braces with
the `UI_READY` pull, because a `postMessage` fired before the iframe registers its listener can be
dropped:

```ts
figma.showUI(__html__, { visible: true, width: 280, height: 160 });
postFileInfo();
```
(height 140 → 160 to fit the new status/retry row in `ui.html`.)

### 4. `plugin/src/ui/ui-relay.ts` — stop reconnecting when rejected, defer HELLO until named

Import block (`:7-10`) — the new names are otherwise TS2304 (`WS_CLOSE_SLOT_HELD` is a value, the
other two are types):

```ts
import {
  CHUNK_LIMIT, PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION, WS_CLOSE_SLOT_HELD,
  type ChunkMsg, type ErrorCode, type FileContext, type ReplyMsg, type RequestMsg, type WireError,
} from '../../../shared/protocol';
```

State block (`:17-20`):

```ts
let ws: WebSocket | null = null;
let reconnectBackoffMs = 1000;
let fileInfo: Record<string, unknown> = {};
let helloSent = false;      // PLUGIN_HELLO is sent once per socket, only with a fileName
let slotHeldBy: string | null = null; // set on PLUGIN_REJECTED → reconnect loop stops
const chunkBuffers = new Map<string, string[]>();
const HELLO_FALLBACK_MS = 3_000;
```

`sendErr` (`:53-55`) — iframe-originated failures (`E_CHUNK_LOST` at `:86`, missing HTML at `:104`,
render errors at `:123`) never reach main, so they must attach the cached identity themselves,
otherwise "every reply carries fileContext" (A8) is false for exactly the replies that matter most:

```ts
function localFileContext(): FileContext | undefined {
  const name = fileInfo.fileName;
  return typeof name === 'string' && name
    ? { fileName: name, fileKey: (fileInfo.fileKey as string | null | undefined) ?? null }
    : undefined;
}

function sendErr(id: string, code: ErrorCode, message: string): void {
  wsSend({ id, ok: false, error: { code, message }, fileContext: localFileContext() });
}
```

New helper (next to `sendErr`):

```ts
/** Register identity; deferred until FILE_INFO arrives so the broker can arbitrate by file. */
function sendHello(): void {
  if (helloSent || !ws || ws.readyState !== WebSocket.OPEN) return;
  helloSent = true;
  wsSend({ type: 'PLUGIN_HELLO', data: { ...fileInfo, pluginVersion: PLUGIN_VERSION, protocolV: PROTOCOL_VERSION } });
  flushOutbox();   // replies produced during the gap go out AFTER the broker promotes this socket
}
```

**Outbox (the other half of backlog 1.5 — cut this block if the smallest possible hotfix is wanted,
but then the reply of any command finishing inside the ~0.6s reconnect gap is still lost).**
Broker grace keeps the *request* alive; it cannot help a reply that `wsSend` drops on the floor at
`ui-relay.ts:35` (`if (!ws || ws.readyState !== WebSocket.OPEN) return;`). Buffer instead:

```ts
const OUTBOX_MAX = 20;
const outbox: (ReplyMsg | { type: string; data: Record<string, unknown> })[] = [];

// in wsSend, replacing the silent early return at :35-36:
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (outbox.length >= OUTBOX_MAX) outbox.shift();   // oldest first; a reply this stale has timed out
    outbox.push(msg);
    return;
  }

/** Flush in order, after PLUGIN_HELLO — the broker only accepts replies from the promoted socket. */
function flushOutbox(): void {
  const queued = outbox.splice(0, outbox.length);
  for (const msg of queued) wsSend(msg);
}
```
Buffer the *message*, never the chunk frames: `wsSend` re-chunks on flush, so a >512KB reply still
arrives as a valid `ChunkMsg` sequence. Ordering is preserved because `sendHello` runs before any
new inbound request can be handled on the fresh socket.

`handleWireData` (`:58-73`) — events are currently ignored; handle the rejection before the
request branch:

```ts
  if (msg.type === 'PLUGIN_REJECTED') {
    const held = (msg.data as { heldBy?: { fileName?: string } } | undefined)?.heldBy?.fileName ?? null;
    slotHeldBy = held ?? 'another file';
    setStatus(`rejected — connection held by "${slotHeldBy}"`, 'err',
      'close the figma-agent plugin in that file, then press Retry');
    return;
  }
```

`handleRequest` (`:99-125`) — **thread the envelope field to main in BOTH branches**, otherwise the
guard never sees it and `--file` is decorative:

```ts
    if (req.cmd === 'HTML_TO_FIGMA') {
      …unchanged render…
      parent.postMessage({ pluginMessage: {
        requestId: req.id, cmd: 'IMPORT_PAYLOAD', expectedFile: req.expectedFile,
        params: { payload, x: p.x, y: p.y, parentId: p.parentId, replaceId: p.replaceId },
      } }, '*');
    } else {
      parent.postMessage({ pluginMessage: {
        requestId: req.id, cmd: req.cmd, params: req.params, expectedFile: req.expectedFile,
      } }, '*');
    }
```
(The HTML render still runs before main rejects a wrong-file `HTML_TO_FIGMA` — wasted work, but the
iframe cannot touch the scene, so the data-integrity guarantee holds.)

`window` message listener (`:128-151`) — cache and forward, then release a deferred HELLO:

```ts
  if (pm.type === 'FILE_INFO') {
    fileInfo = (pm.data as Record<string, unknown>) ?? {};
    wsSend({ type: 'FILE_INFO', data: fileInfo });
    sendHello();               // first HELLO of this socket, now that we have a fileName
    return;
  }
```
and in the reply branch (`:140-150`) carry the context through:

```ts
    const ctx = pm.fileContext as FileContext | undefined;
    const reply: ReplyMsg = pm.ok
      ? { id: pm.requestId, ok: true, result: pm.result, fileContext: ctx }
      : { id: pm.requestId, ok: false,
          error: (pm.error as WireError | undefined) ?? { code: 'E_PLUGIN_ERROR', message: 'main thread returned no error detail' },
          fileContext: ctx };
```

`adoptSocket` (`:200-215`) — replace the unconditional HELLO at `:212`:

```ts
function adoptSocket(socket: WebSocket): void {
  ws = socket;
  reconnectBackoffMs = 1000;
  helloSent = false;
  chunkBuffers.clear();
  socket.onmessage = (ev) => handleWireData(String(ev.data));
  socket.onerror = () => { /* onclose drives the reconnect */ };
  socket.onclose = (ev) => {
    ws = null;
    if (ev.code === WS_CLOSE_SLOT_HELD) {           // second signal: rejection without the event frame
      slotHeldBy = slotHeldBy ?? 'another file';
      setStatus(`rejected — connection held by "${slotHeldBy}"`, 'err', 'close that plugin, then press Retry');
      return;                                        // no reconnect: this is what killed the loop
    }
    setStatus('broker connection lost — reconnecting…', 'err');
    scheduleReconnect();
  };
  if (Object.keys(fileInfo).length > 0) sendHello();
  else {
    parent.postMessage({ pluginMessage: { type: 'UI_READY' } }, '*');   // pull identity from main
    // Timer is bound to THIS socket: a fallback from a dead socket must never register a newer one
    // unnamed (helloSent would then be stuck true and FILE_INFO could not correct it).
    setTimeout(() => { if (ws === socket) sendHello(); }, HELLO_FALLBACK_MS);
  }
  const url = socket.url.replace(/\/$/, '');
  setStatus('connected', 'ok', `broker at ${url} · protocol v${PROTOCOL_VERSION}`);
}
```

`scheduleReconnect` (`:217-220`) and `connectLoop` (`:222-236`) both bail when rejected:

```ts
function scheduleReconnect(): void {
  if (slotHeldBy) return;                            // rejected: the loop stays dead until Retry
  setTimeout(() => void connectLoop(), reconnectBackoffMs);
  reconnectBackoffMs = Math.min(reconnectBackoffMs * 2, RECONNECT_BACKOFF_MAX_MS);
}
```

Retry wiring, appended before `void connectLoop()` (`:238`):

```ts
document.getElementById('retry')?.addEventListener('click', () => {
  slotHeldBy = null;
  reconnectBackoffMs = 1000;
  setStatus('retrying…');
  void connectLoop();
});
```
`setTimeout` is available here — this file is the **iframe** (DOM + WebSocket), not the plugin
sandbox (`ui-relay.ts:4-5`).

Also send `UI_READY` once at startup (next to `void connectLoop()`), so `fileInfo` is warm even if
main's proactive `postFileInfo()` landed before the listener existed:
```ts
parent.postMessage({ pluginMessage: { type: 'UI_READY' } }, '*');
void connectLoop();
```

### 5. `scripts/build.mjs` — panel markup for the retry button

In the `ui.html` template (`:46-56`) add after `<div id="detail"></div>`:
```html
<button id="retry" style="margin-top:6px;font:11px -apple-system,sans-serif;padding:3px 8px">Retry connection</button>
```

### 6. `cli/src/transport/broker-client.ts` — thread `--file`, capture `fileContext`

```ts
let expectedFile: string | undefined;
let lastFileContext: FileContext | undefined;

/** Set once per CLI invocation from the global --file flag; sent on every request envelope. */
export function setExpectedFile(name: string | undefined): void { expectedFile = name; }
export function getLastFileContext(): FileContext | undefined { return lastFileContext; }
```

In `exchange` (`:47-103`): capture the context on the reply branch (`:86-92`) before settling
(`if (msg.fileContext) lastFileContext = msg.fileContext;`), and send the new envelope field at
`:98`:
```ts
sendWireMsg(ws, { id, cmd, params, v: PROTOCOL_VERSION, ...(expectedFile ? { expectedFile } : {}) });
```
Rejection mapping stays as-is: `reject(new CliError(reply.error.code, reply.error.message))` — an
`E_WRONG_FILE` reply flows through the existing path untouched.

### 7. `cli/src/figma-agent.ts` — global `--file`, fileContext in stdout

`main()` (`:129-136`):

```ts
  const args = parseArgs(argv.slice(1));
  setExpectedFile(args.str('file'));   // global guard flag — no command owns --file today (grepped)
  try {
    const result = await command.run(args);
    printJson(withFileContext(result));
    process.exit(0);
  } catch (err) {
    printErrorJson(err, getLastFileContext());
  }
```

`withFileContext` lives in `cli/src/util/json-out.ts` next to `printJson`:

```ts
/** Attach the answering file to a plain-object result; arrays/primitives pass through unchanged. */
export function withFileContext(result: unknown): unknown {
  const ctx = getLastFileContext();
  if (!ctx || result === null || typeof result !== 'object' || Array.isArray(result)) return result;
  return { ...(result as Record<string, unknown>), fileContext: ctx };
}

export function printErrorJson(err: unknown, fileContext?: FileContext): never {
  const error = err instanceof CliError
    ? { code: err.code, message: err.message }
    : { code: 'E_INTERNAL', message: err instanceof Error ? err.message : String(err) };
  process.stdout.write(`${JSON.stringify(fileContext ? { error, fileContext } : { error })}\n`);
  process.exit(1);
}
```
(`printErrorJson`'s second parameter is optional — the two other call sites, `figma-agent.ts:127`
and `:138`, keep compiling.)

`HELP` (`:90-111`): add one line under `Usage:`
```
Global: --file <name>   refuse to run unless the connected plugin is in that Figma file
```

### 8. `scripts/check-broker-slot.mjs` — deterministic slot check (new, ~70 lines)

Node script, `ws` only, no Figma. Preconditions in a header comment: the real plugin must be closed.

```js
// Verifies the single-plugin slot contract without Figma: a second file is refused,
// the incumbent survives, and a same-file reconnect takes over.
// Usage: node scripts/check-broker-slot.mjs   (close the Figma plugin first)
async function hello(port, fileName) -> { ws, events: [], closes: [] }
// asserts, in order:
//  1 A("File A") registers, no PLUGIN_REJECTED within 500ms
//  2 B("File B") gets PLUGIN_REJECTED{reason:'SLOT_HELD', heldBy:{fileName:'File A'}} and close 4001
//  3 A.readyState === OPEN after step 2
//  4 C("File A") registers; A closes with code 1000
//  5 GRACE: a sim-CLI socket sends a RequestMsg (the sim plugin never replies), then C's socket is
//    destroyed and D("File A") registers ~1s later. Assert the sim-CLI received NOTHING in the
//    2.5s after the kill — no {ok:false,error:{code:'E_NO_PLUGIN'}}, no {type:'PLUGIN_GONE'}.
//    (A natural E_TIMEOUT much later is fine and out of scope; the claim is "no premature failure
//    inside the grace window".) Then, with no plugin reconnecting, kill D and assert the sim-CLI
//    DOES get E_NO_PLUGIN after PLUGIN_GRACE_MS — the window closes, it does not leak.
// prints "ok <n> …" per assertion, exits 1 on the first failure
```
Use `ws.terminate()` (not `close()`) for the kill in assertion 5 — an abrupt drop is what the 30s
plugin-side close looks like from the broker's side.
Broker port: read `/tmp/figma-agent-broker.json` (`BROKER_FILE`, `shared/protocol.ts:13`); start the
broker first with `node cli/dist/figma-agent.js status` (it spawns the daemon; the `E_NO_PLUGIN`
result is expected and ignored by the script).

## Validation

```bash
cd /Users/jang/Products/figma-design-agent
npm run typecheck && npm run build          # gate (no lint/test scripts exist)
node cli/dist/figma-agent.js status         # spawns the broker; E_NO_PLUGIN is fine
node scripts/check-broker-slot.mjs          # A1 — 5× ok (5 = grace window, backlog 1.5)
```
Grace check with the real plugin (no script): with the plugin connected, run a 45s script that
straddles at least one ~30s socket death and returns a value —
```bash
cat > /tmp/grace.js <<'JS'
const t0 = Date.now(); let n = 0;
// Await-yield, never a blocking while(){} — the MAIN thread has no timers and a hard spin
// freezes Figma's UI thread handling.
while (Date.now() - t0 < 40000) { await figma.getNodeByIdAsync('0:0'); n++; }
return { survived: true, iterations: n };
JS
node cli/dist/figma-agent.js exec-js /tmp/grace.js --timeout 60000
```
PASS = `result.survived === true` (before this phase: `E_NO_PLUGIN` mid-flight, or a dropped reply).
Watch `tail -f /tmp/figma-agent-broker.log` for `holding N pending` followed by `plugin registered`
with **no** `grace expired → PLUGIN_GONE` line.
Canvas run (budget: one). Reload the plugin in Figma **twice** after the build (first run after a
`code.js` rebuild can serve a stale bundle):
1. Open the plugin in file X → panel `connected`.
2. Open it in file Y → panel `rejected — connection held by "X"`; `tail -f /tmp/figma-agent-broker.log`
   shows ≤1 `WARN slot held` line per minute and **no** repeating `plugin registered`.
3. Close the plugin in X, press **Retry** in Y → Y connects.
4. `node cli/dist/figma-agent.js status` → `fileContext.fileName` present (A8).
5. A2 wrong-file checks (both `status` and the `exec-js` scene check).

Record results in `plans/reports/` per repo practice; delete any `[fixture]` page used.

## Risk & rollback

| Risk | L×I | Mitigation | Detect |
|---|---|---|---|
| Legit reconnect (iframe killed by Figma, #67) rejected → agent stuck | M×H | same-`fileName` takeover + `readyState !== OPEN` takeover + Retry button | panel shows `rejected` while only one file has the plugin open |
| `PLUGIN_HELLO` still nameless (FILE_INFO path broken) → every reconnect looks foreign | M×H | `UI_READY` pull + proactive push + 3s degraded HELLO | `plugin registered: {...}` log line without `fileName` |
| A reply arrives on the NEW socket for a request sent on the OLD one | H×L (accepted by design) | `routeFromPlugin:110-116` correlates by request **id** only, and the slot holds exactly one plugin identity (same file, same iframe, same `instanceId` across the 30s reconnect) — so "the other socket" is the same plugin, not another answerer. A different file taking the slot during grace fails the held work instead | check-broker-slot assertion 5 |
| Grace window swallows a genuine plugin shutdown for 5s (user closed the panel) | H×L | 5s is below every command timeout (min 15s, `DEFAULT_TIMEOUT_MS`); after expiry the old `E_NO_PLUGIN` + `PLUGIN_GONE` behaviour returns unchanged | assertion 5's second half |
| Two different files share a name and neither exposes `fileKey` → mutual takeover | L×H | `isSameFile` prefers `fileKey`; flap guard refuses everyone after 3 takeovers/60s (`reason:'FLAPPING'`, same panel handling) | broker log shows repeated `plugin registered` then a `FLAPPING` rejection |
| Rejection frame lost before close | L×M | close code `4001` is an independent signal | panel reconnect storm returns |
| `--file` collides with a command flag | L×L | grepped `cli/src`: no command reads `--file` today | typecheck / manual |
| Result objects gain a `fileContext` key that a downstream script does not expect | L×M | additive key only, never replaces existing fields | consumer scripts in VSF-PCP |

Rollback: `git revert <sha> && npm run build`, reload plugin. No persisted state, no migration —
the only durable artifacts are the log file and the advertisement JSON, both unchanged in shape.
