# Phase 03 — `--file` guard + routing precedence + `fileContext` echo (harvest)

**Venue/anchors: `/Users/jang/orca/workspaces/ease-design/opah/figma-agent`** (branch
`jangtrinh/opah`, committed at `c591c4b`), which is the canonical tree. Every anchor below was read
**there**. Phase 02 is being implemented in the same checkout right now — see §12 for the anchors
that will shift and must be re-verified at implement time.
Estimated 3h incl. vitest + one canvas run (two files open).
Gate: `cd figma-agent && npm run typecheck && npm run build && npm test` (baseline 453 tests / 46 suites).

Harvest of the two pieces verdicted YES in the phase-01 banner; everything else there stays obsolete.

## Context — what exists upstream, and the exact gap

- **No per-request file targeting.** Routing is `PluginRegistry.selectTarget(filter)`
  (`cli/src/transport/plugin-registry.ts:147-158`): most-recently-active live plugin, optionally
  narrowed by a **case-insensitive substring** filter that comes from **one process-wide env var**,
  `FIGMA_AGENT_FILE` (`cli/src/transport/broker-daemon.ts:47-52`, used at `:196`, `:238`, `:343`,
  `:388`). One value for the whole daemon; a single CLI invocation cannot say which file it means.
- **No execution-time guard.** `grep -rn "expectedFile\|fileContext" plugin/src cli/src shared` → 0
  hits. `main.ts` runs whatever arrives (`plugin/src/main/main.ts:190-202`), so "the plugin the
  broker happened to pick" and "the file the caller meant" are never compared.
- **No proof of which file answered.** Replies are `{id, ok, result}` / `{id, ok, error}`
  (`shared/protocol.ts:71-81`; built in `plugin/src/ui/ui-relay.ts:242-256`). File identity is only
  visible out-of-band: `opStatus()`, `figma-agent status` `plugins[]`, and the panel
  (`main.ts:47-54 announceFileInfo`, which today sends `{fileName, page}` — **no `fileKey`**).
- `figma.fileKey` **is** reachable in this plugin: `main.ts:154` already sends
  `fileKey: figma.fileKey ?? null` on every `DOC_CHANGE`. It is `null` for a non-org plugin, so it is
  carried but never used as the routing key.

Data flow after this phase:

```
figma-agent <cmd> --file "VSF - PCP"
  └─ CLI: setExpectedFile → RequestMsg{…, expectedFile}                     (envelope, optional)
     └─ broker: routeFilter = --file (exact) > FIGMA_AGENT_FILE (substring) > active plugin
        ├─ match  → forward to THAT plugin's socket
        └─ none   → park (bounded), then E_NO_PLUGIN listing connected files
           └─ ui-relay: postMessage {requestId, cmd, params, expectedFile}
              └─ main: figma.root.name ≠ expectedFile → E_WRONG_FILE, dispatch NEVER runs
     reply {ok|error, fileContext:{fileName, fileKey|null}} ─ CLI prints it beside the result
```

## Changes by file

### 1. `shared/protocol.ts` — additive only, `PROTOCOL_VERSION` stays 1

Phase 02 already added `WireError` here (`:77-84` in the working tree). Add alongside it:

```ts
/** Which file answered. Echoed on every reply so a caller can prove where a command landed. */
export interface FileContext {
  fileName: string;
  fileKey?: string | null;   // null for non-org plugins — carried, never used for routing
}

export interface RequestMsg {
  …unchanged fields (id, cmd, params, v, activity?)…
  /**
   * The file this command is FOR (`--file`). Envelope-level, exactly like `activity`, so the
   * broker can route on it without parsing `params`. Omitted entirely when unset — an unguarded
   * frame must serialize byte-identically to what a pre-flag CLI sent.
   */
  expectedFile?: string;
}

export interface ReplyOk  { id: string; ok: true;  result: unknown; fileContext?: FileContext }
export interface ReplyErr { id: string; ok: false; error: WireError; fileContext?: FileContext }

export type ErrorCode =
  | …existing 9 codes… ('E_NO_BROKER' … 'E_PLUGIN_STALE')
  | 'E_WRONG_FILE';
```

`makeRequestFrame` (`:207-216`) gains the same omit-when-unset treatment as `activity`:

```ts
export function makeRequestFrame(
  id: string, cmd: CommandName, params: unknown, activity?: string, expectedFile?: string,
): RequestMsg {
  const frame: RequestMsg = { id, cmd, params, v: PROTOCOL_VERSION };
  if (typeof activity === 'string' && activity.trim() !== '') frame.activity = activity;
  if (typeof expectedFile === 'string' && expectedFile.trim() !== '') frame.expectedFile = expectedFile;
  return frame;
}
```

Wire examples:

```jsonc
// request, guarded
{"id":"c_1_1753...","cmd":"EXEC_JS","params":{"code":"…"},"v":1,"activity":"Run script","expectedFile":"VSF - PCP"}
// reply, ok
{"id":"c_1_1753...","ok":true,"result":{…},"fileContext":{"fileName":"VSF - PCP","fileKey":null}}
// reply, guard refused (nothing executed)
{"id":"c_1_1753...","ok":false,
 "error":{"code":"E_WRONG_FILE","message":"this plugin is connected to file \"Platform - Design System\", command expected \"VSF - PCP\" — nothing was executed"},
 "fileContext":{"fileName":"Platform - Design System","fileKey":null}}
```

### 2. NEW `shared/file-match.ts` (~15 lines) + NEW `cli/src/transport/route-filter.ts` (~30 lines) — both PURE

**Ownership decided here, not at implement time:** the comparison is used by the broker *and* by the
plugin main thread, so it lives in `shared/` — the only directory both bundles already import
(`plugin/src/main/main.ts:8-9` imports `shared/protocol`). The plugin bundle must never pull `cli/`
code (esbuild would follow the import even though `plugin/tsconfig.json`'s `include` does not list
it — `include` is not an import allowlist).

```ts
// shared/file-match.ts
/** The ONE file-name comparison: routing (broker) and the guard (plugin) must never disagree. */
export function fileMatches(actual: string | null | undefined, filter: string, exact: boolean): boolean {
  const a = (actual ?? '').trim().toLowerCase();
  const f = filter.trim().toLowerCase();
  return exact ? a === f : a.includes(f);
}
```

The precedence rule lives in one testable place, not scattered through the daemon.

```ts
// Which file a request routes to, and how strictly. PURE — the daemon reads env + envelope and
// asks here, so precedence is a unit test rather than a code path only reachable with two Figma
// files open.
export type FilterSource = 'flag' | 'env' | 'none';

export interface RouteFilter {
  value: string | null;   // trimmed; null = no restriction
  exact: boolean;         // --file must match the WHOLE name; the env pin stays a substring pin
  source: FilterSource;
}

/**
 * Precedence: explicit `--file` (per request) > FIGMA_AGENT_FILE (per daemon) > active plugin.
 *
 * `--file` is EXACT (case-insensitive, trimmed) on purpose: it is the routing half of a guard the
 * plugin re-checks against `figma.root.name`. A substring filter could route "Design" to
 * "Design System" and then have the plugin refuse it with E_WRONG_FILE — routing and guard must
 * agree, so they use the same comparison.
 */
export function resolveRouteFilter(expectedFile?: string | null, envPin?: string | null): RouteFilter {
  const flag = expectedFile?.trim();
  if (flag) return { value: flag, exact: true, source: 'flag' };
  const env = envPin?.trim();
  if (env) return { value: env, exact: false, source: 'env' };
  return { value: null, exact: false, source: 'none' };
}

export { fileMatches } from '../../../shared/file-match.ts';
```

### 3. `cli/src/transport/plugin-registry.ts` — exact-match mode + ambiguity is an ERROR

`selectTarget` (`:147-158`) currently hardcodes `includes` and resolves ties by recency. Recency is
the right answer for an unfiltered/env-pinned call, and the **wrong** answer for `--file`: two Figma
files can carry the same name, and `fileKey` is `null` for this (non-org) plugin, so nothing else
distinguishes them. Picking "most recent" there would mutate a file the caller did not name — the
exact failure this phase exists to prevent. So an explicit `--file` that matches 2+ live plugins is
refused, not guessed.

```ts
  /** Live entries whose fileName matches (unfiltered → all). Ordering: most-recently-active first. */
  matching(filter?: string | null, opts?: { exact?: boolean }): PluginEntry<S>[] {
    const f = filter?.trim();
    const live = this.liveEntries();
    const hits = f ? live.filter((e) => fileMatches(e.scene.fileName as string | undefined, f, opts?.exact === true)) : live;
    return [...hits].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  selectTarget(filter?: string | null, opts?: { exact?: boolean }): PluginEntry<S> | null {
    return this.matching(filter, opts)[0] ?? null;   // unchanged semantics for existing callers
  }
```
Existing callers pass no `opts` → substring + recency preserved (covered by
`tests/plugin-registry.test.ts`). The daemon uses `matching()` for the `--file` path (§4).

### 4. `cli/src/transport/broker-daemon.ts` — per-request routing

The env pin becomes the *fallback*, not the only input.

- `ParkedRequest` (`:56-62`) gains the request's own filter, so a parked request keeps its target
  when it is retried:
  ```ts
  interface ParkedRequest { id: string; from: WebSocket; rawText: string; deadline: number; filter: RouteFilter }
  ```
- `forwardToPlugin` (`:195-225`) takes the envelope value and resolves precedence:
  ```ts
  const forwardToPlugin = (from: WebSocket, id: string, rawText: string, cmd?: string, expectedFile?: string): void => {
    const filter = resolveRouteFilter(expectedFile, currentFilter());
    let targetWs = st.dispatchedTo.get(id);
    if (targetWs && targetWs.readyState !== WebSocket.OPEN) targetWs = undefined;
    let target: PluginEntry<WebSocket> | null = null;
    if (!targetWs) {
      const hits = st.registry.matching(filter.value, { exact: filter.exact });
      // An explicit --file that matches two open files is AMBIGUOUS: same-named files are
      // indistinguishable here (fileKey is null for a non-org plugin), and guessing by recency
      // is how a command lands in the file the caller did not name.
      if (filter.source === 'flag' && hits.length > 1) {
        const ids = hits.map((e) => `${e.scene.fileName ?? '(unnamed)'}#${e.instanceId}`).join(', ');
        sendReplyErr(from, id, 'E_INVALID_ARGS',
          `--file "${filter.value}" matches ${hits.length} connected files [${ids}] — close one panel, or rename the files apart`);
        return;
      }
      target = hits[0] ?? null;
      targetWs = target?.ws;
      // A plugin that predates the guard would ignore expectedFile and run anyway; refuse BEFORE
      // forwarding rather than discovering it from a reply that has already mutated a file.
      if (filter.source === 'flag' && target && !pluginSupportsFileGuard(target)) {
        sendReplyErr(from, id, 'E_PLUGIN_STALE',
          `the plugin open in "${target.scene.fileName ?? '?'}" predates --file support — rebuild (npm run build) and reopen the panel`);
        return;
      }
    }
    if (!targetWs) {
      const parkable = !(cmd && WAIT_EXEMPT.has(cmd)) && PLUGIN_WAIT_TIMEOUT_MS > 0;
      if (!parkable) { sendReplyErr(from, id, 'E_NO_PLUGIN', noPluginMessage(st.registry, filter)); return; }
      st.waiting.push({ id, from, rawText, deadline: Date.now() + PLUGIN_WAIT_TIMEOUT_MS, filter });
      log(`parked ${id}${cmd ? ` (${cmd})` : ''}${filter.value ? ` [${filter.source}="${filter.value}"]` : ''} — awaiting ${filter.value ? 'matching ' : ''}plugin (${st.waiting.length} queued)`);
      return;
    }
    …unchanged pending/dispatchedTo/send…
  };
  ```
- `flushWaiting` (`:228-247`) must test **each request's own** filter instead of the env pin:
  ```ts
      if (st.registry.selectTarget(req.filter.value, { exact: req.filter.exact })) {
        forwardToPlugin(req.from, req.id, req.rawText, undefined, req.filter.source === 'flag' ? req.filter.value ?? undefined : undefined);
        delivered++;
      } else { st.waiting.push(req); }
  ```
  (Re-passing `expectedFile` keeps `resolveRouteFilter` the single source of the decision; the env
  fallback is re-read anyway.)
- `handleMessage` request branch (`:294`) forwards the envelope field:
  ```ts
    } else if (isRequestMsg(msg)) {
      forwardToPlugin(ws, msg.id, text, msg.cmd, msg.expectedFile);
  ```
- **The wait-window sweeper** (`:377-389`) must report the request's OWN filter, not the env pin —
  otherwise a timed-out `--file` request blames `FIGMA_AGENT_FILE` (or prints the generic message):
  ```ts
        sendReplyErr(req.from, req.id, 'E_NO_PLUGIN', noPluginMessage(st.registry, req.filter));
  ```
- **Capability flag (guards §3's stale-plugin refusal).** `PLUGIN_HELLO` gains an additive
  `caps: string[]`; the relay sends `caps: ['fileGuard']` (§8) and the daemon reads it off the
  registry scene:
  ```ts
  /** A plugin advertises the guard it honours; absence means "older bundle, cannot be trusted with --file". */
  function pluginSupportsFileGuard(entry: PluginEntry<WebSocket>): boolean {
    const caps = entry.scene.caps;
    return Array.isArray(caps) && caps.includes('fileGuard');
  }
  ```
  `extractScene` (`plugin-registry.ts:31-35`) keeps unknown keys, so `caps` lands in `scene`
  automatically — verify at implement time that `caps` is **not** added to `PROTOCOL_KEYS` (`:27`).
- The broker still reads **only the envelope** — no `params`, no `cmd` semantics. Pure relay holds.

**Known limit, document it in the daemon comment and in `--help`:** a request larger than
`CHUNK_LIMIT` (512KB — `IMPORT_PAYLOAD`, big `HTML_TO_FIGMA`) reaches the broker as `ChunkMsg`
frames (`:288-290`), which carry no `expectedFile`; those route by env pin / most-recent as today.
The **guard still fires** — `ui-relay` reassembles and forwards `expectedFile` to main — so the worst
case is `E_WRONG_FILE` instead of correct routing, never a silent wrong-file mutation.

### 5. `cli/src/transport/broker-status.ts` — name the right knob in the error

`noPluginMessage` (`:52-62`) hardcodes `FIGMA_AGENT_FILE`, which would be wrong advice for a `--file`
miss. Take the resolved filter instead:

```ts
export function noPluginMessage(registry: PluginRegistry<RegistrySocket>, filter?: RouteFilter | null): string {
  const f = filter?.value?.trim();
  const live = registry.statusList();
  if (f && live.length > 0) {
    const names = live.map((p) => p.fileName ?? '(unnamed)').join(', ');
    const knob = filter?.source === 'flag' ? `--file "${f}"` : `FIGMA_AGENT_FILE="${f}"`;
    const fix = filter?.source === 'flag'
      ? 'Open that file\'s panel, or drop --file.'
      : 'Open that file\'s panel, or unset FIGMA_AGENT_FILE.';
    return `no Figma plugin matching ${knob} — connected files: [${names}]. ${fix}`;
  }
  return 'no Figma plugin connected — open the figma-agent plugin in Figma';
}
```
`tests/broker-status.test.ts` must be updated to the new parameter shape (it currently passes a
string) — both branches asserted.

### 6. CLI wiring — one choke point, no per-command edits

`cli/src/transport/broker-client.ts`:
```ts
let expectedFile: string | undefined;
let lastFileContext: FileContext | undefined;

/** Set once per CLI invocation from the global --file flag; stamped on every request envelope. */
export function setExpectedFile(name: string | undefined): void { expectedFile = name; }
export function getLastFileContext(): FileContext | undefined { return lastFileContext; }
```
- in `exchange` (`:48-110`): send `makeRequestFrame(id, cmd, params, activity, expectedFile)` (`:105`)
  and, in the reply branch (`:93-101`), capture before settling:
  `if (msg.fileContext) lastFileContext = msg.fileContext;`
- error path unchanged: an `E_WRONG_FILE` reply already flows through `new CliError(code, message)`.

`cli/src/figma-agent.ts` `main()` (`:112`) — a safety flag must never fail open:
```ts
  const args = parseArgs(argv.slice(1));
  // `--file` with no value parses as boolean true and str() then returns undefined
  // (arg-parse.ts:27-34) — a typo would run UNGUARDED, so refuse instead.
  if (args.bool('file') && (args.str('file') ?? '').trim() === '') {
    printErrorJson(new CliError('E_INVALID_ARGS', '--file needs a file name, e.g. --file "VSF - PCP"'));
  }
  setExpectedFile(args.str('file'));   // global flag — verified: no command reads --file today
  try {
    const result = await command.run(args);
    printJson(withFileContext(result));
    process.exit(0);
  } catch (err) {
    printErrorJson(err, getLastFileContext());
  }
```
`cli/src/util/json-out.ts`:
```ts
/**
 * Attach the answering file to a plain-object result. Two cases must NOT be silently mangled:
 * a non-object result (EXEC_JS can return a string/array) has nowhere to put the key, and a result
 * that already owns `fileContext` belongs to the command, not to transport metadata. Both fall back
 * to stderr, so stdout keeps its exactly-one-JSON-object contract and the proof is still visible.
 */
export function withFileContext(result: unknown): unknown {
  const ctx = getLastFileContext();
  if (!ctx) return result;
  const plain = result !== null && typeof result === 'object' && !Array.isArray(result);
  if (!plain || 'fileContext' in (result as Record<string, unknown>)) {
    process.stderr.write(`fileContext: ${JSON.stringify(ctx)}\n`);
    return result;
  }
  return { ...(result as Record<string, unknown>), fileContext: ctx };
}

export function printErrorJson(err: unknown, fileContext?: FileContext): never { … prints {error[, fileContext]} … }
```
(`printErrorJson`'s new parameter is optional — the other call sites, `figma-agent.ts:109` and `:120`,
keep compiling.)

`cli/src/commands/status.ts` — `--file` must not make the diagnosis self-contradictory. Today the
`BROKER_HELLO` fields (`activePlugin`, `pluginConnected`, `pluginInfo`) are computed by the broker
from **`FIGMA_AGENT_FILE` only** (`broker-status.ts:26-46`), while the follow-up `STATUS`
round-trip (`status.ts:44`) would now carry `expectedFile` — so `status --file A` could report
`activePlugin: B` next to A's scene. Make `status` filter-aware locally:

```ts
  const wanted = _args.str('file');            // status takes the same global flag
  const all = Array.isArray(hello.plugins) ? (hello.plugins as PluginStatusEntry[]) : [];
  const plugins = wanted ? all.filter((p) => fileMatches(p.fileName, wanted, true)) : all;
  const activePlugin = wanted
    ? plugins[0]?.fileName ?? null                       // the file the caller asked about
    : (hello.activePlugin as string | null | undefined) ?? null;
  let connected = wanted ? plugins.length > 0 : hello.pluginConnected === true;
```
and, in the enrich block (`:42-56`), treat `E_WRONG_FILE` exactly like the existing `E_NO_PLUGIN`
race branch (report `connected:false`, do not throw) — `status` must stay a diagnosis tool that
never fails. Keep the full list available as `pluginsAll` when `--file` filtered it, so the user can
still see what *is* connected.

`HELP` (`cli/src/figma-agent.ts:63-95`) gains a global line:
```
Global: --file "<exact file name>"   route to that file's plugin AND refuse to run anywhere else
                                     (exact, case-insensitive; beats FIGMA_AGENT_FILE; payloads
                                      >512KB route by the env pin but are still guarded)
```

### 7. `plugin/src/main/main.ts` — identity, guard, echo

1. `announceFileInfo` (`:47-52`) carries the key too, so the registry slot and `figma-agent status`
   see it (`PluginScene` is open-ended — `shared/protocol.ts:112-116`):
   ```ts
     data: { fileName: figma.root.name, page: figma.currentPage.name, fileKey: figma.fileKey ?? null },
   ```
   (`figma.fileKey ?? null` is already used at `:154`, so no new access pattern.)
2. Helper next to it, **with rename self-healing**. `announceFileInfo` fires only at startup
   (`:53`) and on `currentpagechange` (`:54`); renaming the Figma FILE fires neither, so the
   registry would keep routing the old name (and the guard would then refuse the new one). Reading
   `figma.root.name` per request is cheap, so re-announce whenever it drifts:
   ```ts
   let announcedFileName = '';

   /** Sync getters only — safe under dynamic-page and cheap enough to read per request. */
   function fileContext(): FileContext {
     const ctx = { fileName: figma.root.name, fileKey: figma.fileKey ?? null };
     // A file rename has no event of its own; the next command re-announces identity so routing
     // and the guard converge within one round-trip instead of staying stale until reload.
     if (ctx.fileName !== announcedFileName) { announcedFileName = ctx.fileName; announceFileInfo(); }
     return ctx;
   }
   ```
   (`announceFileInfo` sets `announcedFileName` too, so the startup announce does not double-fire.)
3. `UiRequest` (`:167`) gains `expectedFile?: string`; the handler (`:190-202`) guards **before**
   `dispatch` and echoes on both paths:
   ```ts
     const req = msg as Partial<UiRequest> | null;
     if (!req || typeof req.requestId !== 'string' || typeof req.cmd !== 'string') return;
     const ctx = fileContext();
     try {
       if (typeof req.expectedFile === 'string' && req.expectedFile.trim() !== ''
           && !fileMatches(ctx.fileName, req.expectedFile, true)) {
         // Guard runs at the wire boundary, BEFORE any executor: a wrong-file command must not
         // touch the scene, and must not be recorded as an agent mutation either.
         throw withCode(new Error(
           `this plugin is connected to file "${ctx.fileName}", command expected "${req.expectedFile}" — nothing was executed`,
         ), 'E_WRONG_FILE');
       }
       const targetIds = mutationTargetIds(req.cmd as CommandName, req.params ?? {});
       beginAgentMutation(targetIds);
       … unchanged dispatch + recordAgentMutation + commitIfMutating (phase 02) …
       figma.ui.postMessage({ requestId: req.requestId, ok: true, result, fileContext: ctx });
     } catch (err) {
       figma.ui.postMessage({ requestId: req.requestId, ok: false, error: shapeError(err), fileContext: ctx });
     }
   ```
   Placement matters twice: the guard is **outside** `dispatch`, so `runBatch` children are checked
   once at the boundary rather than per op; and it precedes `beginAgentMutation`, so a refused
   command leaves no correction-memory trace.

### 8. `plugin/src/ui/ui-relay.ts` — thread it in, echo it out

- `handleRequest` (`:190-220`) — **both** `postMessage` branches carry the field, or the guard never
  sees it and `--file` is decorative:
  ```ts
      parent.postMessage({ pluginMessage: {
        requestId: req.id, cmd: 'IMPORT_PAYLOAD', expectedFile: req.expectedFile,
        params: { payload, x: p.x, y: p.y, parentId: p.parentId, replaceId: p.replaceId },
      } }, '*');
      …
      parent.postMessage({ pluginMessage: {
        requestId: req.id, cmd: req.cmd, params: req.params, expectedFile: req.expectedFile,
      } }, '*');
  ```
  (The HTML render at `:200-202` still runs before main can refuse a wrong-file `HTML_TO_FIGMA` —
  wasted work only; the iframe cannot touch the scene.)
- Reply path (`:242-256`) copies main's context onto the wire envelope:
  ```ts
      const ctx = pm.fileContext as FileContext | undefined;
      const reply: ReplyMsg = pm.ok
        ? { id: pm.requestId, ok: true, result: pm.result, fileContext: ctx }
        : { id: pm.requestId, ok: false,
            error: (pm.error as WireError | undefined) ?? { code: 'E_PLUGIN_ERROR', message: 'main thread returned no error detail' },
            fileContext: ctx };
  ```
- `sendErr` (`:133-135`) — iframe-originated failures (`E_CHUNK_LOST` at `:177`, missing HTML at
  `:196`, render errors at `:217`) never reach main, so they attach the cached identity themselves;
  otherwise "every reply carries fileContext" is false for exactly the replies that matter most:
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
  `fileInfo` is populated from main's `FILE_INFO` (`:228-231`) and now includes `fileKey` (§7.1).
  **Race:** an iframe error raised before the first `FILE_INFO` lands has nothing to attach. Close it
  by pulling identity at relay boot instead of only waiting for main's push — add next to the
  `PLUGIN_HELLO` send (`:346-349`):
  ```ts
  if (Object.keys(fileInfo).length === 0) parent.postMessage({ pluginMessage: { type: 'UI_READY' } }, '*');
  ```
  and in `main.ts`'s `figma.ui.onmessage`, beside the existing `PANEL_RESIZE` / `SYNC_CONFIG` /
  `SYNC_DONE` branches (`:172-189`):
  ```ts
  if (chrome && chrome.type === 'UI_READY') { announceFileInfo(); return; }
  ```
  Residual window (both messages in flight) stays possible; `fileContext` therefore remains
  **optional** on the wire, and the acceptance claim is "every reply from a registered plugin",
  not "every byte ever sent".
- `PLUGIN_HELLO` (`:346-349`) advertises the capability the broker's stale-plugin refusal reads (§4):
  ```ts
  wsSend({ type: 'PLUGIN_HELLO', data: { ...fileInfo, instanceId: INSTANCE_ID, caps: ['fileGuard'],
                                         pluginVersion: PLUGIN_VERSION, protocolV: PROTOCOL_VERSION } });
  ```

## Tests (vitest, pure logic)

1. `tests/route-filter.test.ts` — the precedence rule:
   - `--file` set + env set → `{source:'flag', exact:true, value:'<flag>'}`;
   - only env → `{source:'env', exact:false}`; neither → `{source:'none', value:null}`;
   - whitespace-only `--file` is treated as unset (falls through to env);
   - `fileMatches('Design System','design',false)` true; `(…,'design',true)` false;
     `fileMatches('VSF - PCP',' vsf - pcp ',true)` true (trim + case-insensitive).
2. `tests/plugin-registry.test.ts` (extend) — with fake sockets whose scenes are `Design System`,
   `Design`, and a second `Design`:
   - `selectTarget('design')` → most-recently-active of the substring matches (unchanged);
   - `selectTarget('design',{exact:true})` → only an exact-named one;
   - `matching('design',{exact:true}).length === 2` for the duplicate pair — the input the daemon
     turns into the ambiguity refusal;
   - a filter matching nothing → `[]` / `null` (the park path).
3. `tests/broker-status.test.ts` (update) — `noPluginMessage` takes a `RouteFilter`: names
   `--file "X"` for `source:'flag'`, `FIGMA_AGENT_FILE="X"` for `source:'env'`, lists the connected
   files in both, and falls back to the plain message when nothing is connected.
4. `tests/file-guard-plumbing.test.ts` (new, pure) — the two fail-open holes:
   - `makeRequestFrame(id,cmd,params,undefined,'  ')` omits `expectedFile` entirely (byte-identical
     to a pre-flag frame) while `makeRequestFrame(…,'VSF - PCP')` includes it;
   - `withFileContext` — plain object gains the key; an array/string/number is returned **unchanged**
     (context to stderr); a result that already owns `fileContext` is returned unchanged.

Not unit-tested (no socket/Figma in vitest, verified on canvas instead): the daemon threading, the
plugin guard, the rename self-heal, and the reply echo.

## Validation

```bash
cd /Users/jang/orca/workspaces/ease-design/opah/figma-agent
npm run typecheck && npm run build && npm test     # baseline 453 → 453 + new cases, all green
```

Canvas run (budget: one) with **two files open, both panels connected** — e.g. `VSF - PCP` and
`Platform - Design System`. Reload both plugins after the build.

1. **Routing by `--file`** (the new capability):
   ```bash
   node cli/dist/figma-agent.js status | python3 -c "import json,sys; d=json.load(sys.stdin); print([p['fileName'] for p in d['plugins']])"
   node cli/dist/figma-agent.js exec-js - --file 'Platform - Design System' <<< 'return figma.root.name'
   node cli/dist/figma-agent.js exec-js - --file 'VSF - PCP' <<< 'return figma.root.name'
   ```
   PASS = each returns **its own** file name regardless of which panel was touched last, and each
   reply carries the matching `fileContext.fileName`.
2. **Guard** (routing and guard agree, nothing executes on a miss):
   ```bash
   node cli/dist/figma-agent.js exec-js - --file 'Definitely Not A File' <<< 'figma.createFrame().name="SHOULD-NOT-EXIST"; return 1'
   ```
   PASS = exit 1 with `E_NO_PLUGIN` naming `--file "Definitely Not A File"` and listing both
   connected files (routing refused before anything ran). Then, with the plugin closed in the target
   file only, the same command parks and fails the same way after `PLUGIN_WAIT_MS`.
   Wrong-file *execution* is impossible by construction, but assert the plugin-side path too by
   temporarily renaming a file mid-flight, or by calling with `--file` matching a connected file
   whose name you then change: expect `E_WRONG_FILE` + `fileContext` of the actual file, and
   `figma.currentPage.findChildren(n=>n.name==='SHOULD-NOT-EXIST').length === 0`.
3. **Precedence**:
   ```bash
   FIGMA_AGENT_FILE='VSF' node cli/dist/figma-agent.js __broker &   # daemon pinned to VSF
   node cli/dist/figma-agent.js exec-js - --file 'Platform - Design System' <<< 'return figma.root.name'
   ```
   PASS = `Platform - Design System` (flag beats env). Without `--file`, the same command returns the
   VSF file (env beats most-recent).
4. **`fileContext` everywhere**:
   ```bash
   node cli/dist/figma-agent.js status | grep -c fileName
   node cli/dist/figma-agent.js get-selection | grep -q '"fileContext"' && echo ok
   node cli/dist/figma-agent.js exec-js - <<< 'throw new Error("x")' ; echo "exit=$?"
   ```
   PASS = `get-selection` result carries `fileContext`; the failing exec-js prints
   `{"error":{…},"fileContext":{…}}` and exits 1.
5. **Rename self-heal** — rename the target Figma file, then re-run the `--file` command with the
   NEW name. PASS = it routes and runs within one round-trip (the plugin re-announced identity); the
   OLD name now returns `E_NO_PLUGIN` listing the current names.
6. **Fail-closed flag** — `node cli/dist/figma-agent.js status --file` (no value) → exit 1 with
   `E_INVALID_ARGS`, **not** an unguarded run.
7. **Stale-plugin refusal** — check out the pre-phase-03 plugin bundle (`git stash` the plugin build
   or reopen an old `code.js`), then run any `--file` command. PASS = `E_PLUGIN_STALE` naming the
   file and telling the user to rebuild — the command must not execute.
8. **Same-name ambiguity** — open two files named identically (duplicate a file), both panels
   connected, then `--file '<that name>'`. PASS = `E_INVALID_ARGS` listing both `name#instanceId`
   pairs; nothing runs.
9. **No regression with a single plugin and no flags** — `scan-node`, `mirror-verify`, `audit-ds`
   behave exactly as before (unset `expectedFile` ⇒ frame byte-identical to today).
10. Log the run in `plans/reports/`.

## Risk & rollback

| Risk | L×I | Mitigation | Detect |
|---|---|---|---|
| Routing picks a file the guard then refuses (substring vs exact mismatch) | M×H | one comparison (`fileMatches`) used by both; `--file` is exact on both sides | validation 1+2 |
| Chunked (>512KB) requests cannot carry `expectedFile` to the broker | M×M | documented; the guard still fires after reassembly, so the failure mode is `E_WRONG_FILE`, never a wrong-file mutation | validation with a large `html-to-figma` under `--file` |
| A parked request retried after a *different* file connects, or timing out with the wrong knob named | M×H | `ParkedRequest.filter` keeps the request's own target; `flushWaiting` **and** the timeout sweeper both use it | `tests/plugin-registry.test.ts` + validation 2 |
| Two open files share a name → routing guesses | M×H | `--file` matching 2+ live plugins is refused (`E_INVALID_ARGS`, both instanceIds listed), never resolved by recency | validation 8 |
| A plugin bundle predating the guard ignores `expectedFile` and runs anyway | M×H | `caps:['fileGuard']` on `PLUGIN_HELLO`; the broker refuses a `--file` request to a plugin without it (`E_PLUGIN_STALE`) **before** forwarding | validation 7 |
| `--file` typed without a value silently disables the guard | M×H | `main()` refuses `--file` present-but-empty with `E_INVALID_ARGS` | validation 6 |
| File renamed mid-session → stale routing name | M×M | `fileContext()` re-announces when `figma.root.name` drifts (no rename event exists) | validation 5 |
| A non-object or `fileContext`-owning result loses the proof | L×M | falls back to a stderr line; stdout keeps its one-JSON-object contract | unit test 4 |
| `status --file X` reports another file as active | M×M | `status` filters `plugins[]` locally and treats `E_WRONG_FILE` like the existing `E_NO_PLUGIN` race branch | validation 1 |
| `--file` collides with an existing command flag | L×L | verified: no command in `cli/src/commands/` reads `--file` (grep) | typecheck + validation 5 |
| Result objects gain a `fileContext` key a downstream script does not expect | L×M | additive key on plain objects only; arrays/primitives untouched | consumers in VSF-PCP |
| Old plugin bundle + new CLI: `expectedFile` ignored ⇒ command runs unguarded | M×H | prevented at the broker by the `caps` check above (row 3), not merely detected afterwards | validation 7 |

Rollback: `git revert <sha>` + `npm run build` + reload both plugins. No persisted state, no
migration; every field is optional, so reverting one side leaves the other harmless.

## §12 — interaction with phase 02 (Sonnet is editing NOW)

Phase 02 touches four of the same files. Nothing conflicts by design, but **re-verify these anchors
at implement time** (they will have moved):

| File | Anchor used here | Why it shifts |
|---|---|---|
| `shared/protocol.ts` | `RequestMsg:50-66`, `ReplyOk:71-75`, `ReplyErr:77-81`, `ErrorCode:145-157`, `makeRequestFrame:207` | phase 02 inserts `WireError` above `ReplyErr` (already in the working tree, +8 lines) |
| `plugin/src/main/main.ts` | handler `:190-202`, `announceFileInfo:47-52`, `UiRequest:167` | phase 02 adds `MUTATING_COMMANDS` + `commitIfMutating` and edits the same handler body — **merge, do not replace**: the guard goes first, `commitIfMutating` stays where phase 02 put it |
| `cli/src/util/json-out.ts` | `printErrorJson:11-17` | phase 02 adds `rolledBack` to the printed error object; this phase adds the optional `fileContext` parameter — both, not either |
| `cli/src/transport/broker-client.ts` | `exchange:48-110`, `runCommand:145-176` | phase 02 passes `rolledBack` into `CliError`; this phase adds `expectedFile` to the frame and captures `fileContext` |
| `cli/src/figma-agent.ts` | `main():112`, `HELP:63-95` | phase 02 rewrites the `exec-js` HELP line; this phase adds a `Global:` line |

Untouched by phase 02 (anchors stable): `broker-daemon.ts`, `plugin-registry.ts`,
`broker-status.ts`, `cli/src/commands/status.ts`, `plugin/src/ui/ui-relay.ts`, and the new
`shared/file-match.ts` + `route-filter.ts`.

Sequence: land phase 02 first (it is in flight), then rebase this phase onto it. If both must land
together, take phase 02's `main.ts` handler as the base and insert the guard block ahead of
`mutationTargetIds`.
