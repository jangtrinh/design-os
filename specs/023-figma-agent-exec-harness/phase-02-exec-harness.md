# Phase 02 — exec harness: loud results, undo group, granular undo, fail-loud stdlib

**Target: the `figma-agent` workspace of the `ease-design` monorepo.**
Anchors read in `/Users/jang/Products/ease-design/figma-agent` (`ddf451e`) and **verified
byte-identical** in the implementation venue, `/Users/jang/orca/workspaces/ease-design/opah/figma-agent`
(branch `jangtrinh/opah`, clean at `c591c4b`) — every file cited below `diff`s clean between the two,
so the line numbers hold in either. **Implement in the opah checkout.**
Phase 01 is obsolete (see its banner); this phase stands alone.
Estimated 6h incl. vitest coverage + one canvas run.
Gate: `cd figma-agent && npm run typecheck && npm run build && npm test` (baseline 453 tests / 46 suites green).

## Context — verified in the canonical tree, not inherited

- `opExecJs` lives at `plugin/src/main/executor-ops.ts:211-242` and is **the same dual-eval** as the
  stale snapshot: expression wrap at `:229`, statement wrap at `:231`, `jsonSafe(result)` at `:238`.
  Both silent-failure classes are live upstream:
  - **2.5** a script ending `})();` fails the expression parse (trailing `;`), falls to the statement
    wrap which fires the IIFE and discards its value → `result: null`, no error;
  - **2.1** a leading top-level `const` forces statement form → returns nothing → `null` while the
    side effects applied. `jsonSafe(undefined) → null` (`serialize-node.ts:33-44`) is what makes the
    two indistinguishable from a real `null`.
- **`commitUndo` / `triggerUndo`: 0 call sites** (`grep -rn "commitUndo\|triggerUndo" plugin/src cli/src shared`
  → empty). Figma's default therefore still holds: the whole agent session is ONE ⌘Z (backlog 2.4).
- The CLI command exists — `cli/src/commands/exec-js.ts` — same flags as the snapshot (`--timeout`,
  positional `<file|->`) **plus** an `activity` intent label passed to `runCommand` (`:35`), which the
  panel's feed shows instead of the opaque `cmd`.
- Module conventions in `plugin/src/main/`: one concern per kebab-case file, executors named
  `executor-*.ts`, shared leaves get their own module when two callers need them
  (`resolve-main-component.ts:1-10` says exactly that). New files follow suit.
- **Tests exist here** (unlike the snapshot): `figma-agent/vitest.config.ts` (root pinned to the
  workspace, `include: ['tests/**/*.test.ts']`), ~40 suites in `tests/`, and a strict-contract Figma
  mock at `tests/helpers/mock-figma.ts` (768 lines) whose header records why permissive mocks shipped
  live bugs. Pure logic gets unit tests here; anything needing `figma.root`/undo does **not** get a
  permissive mock stub (see §7).

Data flow after this phase (unchanged design, canonical wiring):

```
exec-js [--undo-group] ─▶ EXEC_JS{code, timeoutMs, undoGroup?} (activity label untouched)
main.ts onmessage ─▶ dispatch ─▶ opExecJs:
   undo bracket begin (commitUndo C0 + sentinel) → eval(normalized)(console, ui)
     ok    → sentinel remove + commitUndo → {result, console, ms, executed:true, mode, warning?}
     throw → commitUndo C1 + triggerUndo → E_EVAL{…" — changes rolled back", rolledBack:true}
main.ts onmessage/runBatch ─▶ commitIfMutating(cmd) after the correction-memory bookkeeping
```

## Changes by file

### 1. `shared/protocol.ts` — one additive optional field

`ReplyErr` is declared at `:77-81` with an inline error object. Replace with a named type so the
rollback flag can ride along; `PROTOCOL_VERSION` stays `1`, the field is optional, so an old CLI
reading a new reply (and vice-versa) is unaffected:

```ts
/** Reply error payload. `rolledBack` is set by EXEC_JS --undo-group. */
export interface WireError { code: ErrorCode; message: string; rolledBack?: boolean }

export interface ReplyErr {
  id: string;
  ok: false;
  error: WireError;
}
```
Do **not** touch `RequestMsg` (`:50-66`) or `makeRequestFrame` (`:207`) — `undoGroup` travels in
`params`, like every other command option, because it is command-specific and the broker must keep
reading only the envelope.

### 2. NEW `plugin/src/main/executor-exec-js.ts` (~140 lines)

`opExecJs` moves out of `executor-ops.ts` (that file is 242 lines; removing `:211-242` brings it to
~210 and keeps the new logic in its own concern). After the move, `executor-ops.ts:11` still needs
`serializeNode` but no longer `jsonSafe`/`safeStringify` (`grep` shows their only uses are `:219`
and `:238`, both inside `opExecJs`) — drop them from that import or typecheck fails on unused… (it
will not error under the current config, but leave the import honest).
`main.ts:25-28` moves `opExecJs` to an import from `./executor-exec-js`.

```ts
// EXEC_JS: normalize → eval (expression first, statement second) → run with the injected `ui`
// stdlib → classify the result so a script can never fail silently. --undo-group brackets the run
// in one undo step; the sentinel guarantees that step is non-empty, so a rollback can never consume
// the CALLER's previous undo step.
import { withCode } from './executor-styles';
import { jsonSafe, safeStringify } from './serialize-node';
import { createExecStdlib } from './exec-stdlib';

const SENTINEL_NAME = '[figma-agent] undo sentinel';

export interface ExecJsResult {
  result: unknown;
  console: string[];
  ms: number;
  executed: true;                    // present on every success — the anti-silent-null marker
  mode: 'expression' | 'statement';
  warning?: string;
}

type ConsoleProxy = Record<'log' | 'info' | 'warn' | 'error', (...args: unknown[]) => void>;
type ExecFn = (console: ConsoleProxy, ui: ReturnType<typeof createExecStdlib>) => Promise<unknown>;

/**
 * PURE. Expression form only ever failed on a TRAILING TERMINATOR — a `;`, or a `;` followed by a
 * comment — and that failure silently discarded whole IIFEs. Each candidate is only ever *parsed*:
 * a wrong strip fails to parse and the next candidate runs, and the statement fallback always gets
 * the ORIGINAL source, so normalization can never change what executes.
 */
export function expressionCandidates(source: string): string[] {
  const out = [source];
  let s = source;
  for (let i = 0; i < 4; i++) {                      // e.g. `f();  // done` → `f();` → `f()`
    const stripped = s
      .replace(/(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*$/, '')
      .replace(/;+\s*$/, '')
      .trimEnd();
    if (stripped === s) break;
    s = stripped;
    out.push(s);
  }
  return out;
}

export function compile(code: string): { fn: ExecFn; mode: 'expression' | 'statement' } {
  const source = code.trim();
  for (const candidate of expressionCandidates(source)) {
    try {
      return { fn: (0, eval)(`(async (console, ui) => (${candidate}\n))`) as ExecFn, mode: 'expression' };
    } catch { /* not an expression in this spelling — try the next strip */ }
  }
  // Statement form gets the ORIGINAL source: stripping a terminator must not change semantics.
  return { fn: (0, eval)(`(async (console, ui) => { ${source}\n })`) as ExecFn, mode: 'statement' };
}

/** PURE. Node-ish values collapse to {id,name,type} instead of exploding through JSON.stringify. */
export function summarize(value: unknown): unknown {
  const n = value as { id?: unknown; type?: unknown; name?: unknown; remove?: unknown };
  if (n && typeof n.id === 'string' && typeof n.type === 'string' && typeof n.remove === 'function') {
    return { id: n.id, name: String(n.name ?? ''), type: n.type };
  }
  if (Array.isArray(value)) return value.map(summarize);
  return jsonSafe(value);
}

/** PURE. Computed on the RAW value — jsonSafe turns `undefined` into `null` and erases the signal. */
export function resultWarning(result: unknown, mode: 'expression' | 'statement'): string | undefined {
  if (result === undefined) {
    return mode === 'statement'
      ? 'no explicit return — the script ran to completion but returned nothing; side effects may still have applied'
      : 'the expression evaluated to undefined';
  }
  if (result === null) return 'returned null — the node or resource may not exist';
  if (Array.isArray(result) && result.length === 0) return 'returned an empty array — the search matched nothing';
  if (typeof result === 'object' && Object.keys(result as object).length === 0) {
    return 'returned an empty object — the operation may have matched nothing';
  }
  return undefined;
}

// ── Undo bracket ────────────────────────────────────────────────────
// Split from opExecJs so the ORDER (the only part that was smoke-tested and the only part that can
// silently destroy the caller's work) is unit-testable without a Figma global.
export interface UndoBracket {
  begin(): void;     // commitUndo C0 — seal everything that happened BEFORE this script
  commit(): void;    // success  — drop the sentinel, commitUndo
  rollback(): void;  // failure  — commitUndo C1 (packages script+sentinel), then triggerUndo
}

const SENTINEL_KEY = 'figmaAgentUndoSentinel';

export function figmaUndoBracket(): UndoBracket {
  let sentinel: SceneNode | null = null;
  return {
    begin() {
      // Identify strays by OUR plugin data, never by name: a user frame that happens to be called
      // "[figma-agent] undo sentinel" must not be deleted by a tool sweep.
      for (const n of figma.currentPage.findChildren((c) => c.getPluginData(SENTINEL_KEY) === '1')) n.remove();
      figma.commitUndo();
      const f = figma.createFrame();
      f.name = SENTINEL_NAME;
      f.setPluginData(SENTINEL_KEY, '1');
      f.resize(1, 1);
      f.x = -1e6; f.y = -1e6;
      f.visible = false;
      figma.currentPage.appendChild(f);
      sentinel = f;
    },
    commit() { if (sentinel) sentinel.remove(); figma.commitUndo(); },
    rollback() { figma.commitUndo(); figma.triggerUndo(); },  // sentinel is reverted BY the undo
  };
}

/**
 * PURE w.r.t. Figma — the bracket is injected, so tests assert the call order with a spy.
 * On failure it tags the ORIGINAL error: `rolledBack` only when rollback actually completed,
 * `rollbackFailed` when the undo API itself threw. Reporting "changes rolled back" because a
 * bracket merely existed would be a lie the caller acts on.
 */
export async function runInUndoGroup<T>(bracket: UndoBracket | null, run: () => Promise<T>): Promise<T> {
  bracket?.begin();
  try {
    const out = await run();
    bracket?.commit();
    return out;
  } catch (err) {
    if (bracket) {
      try {
        bracket.rollback();
        (err as Error & { rolledBack?: boolean }).rolledBack = true;
      } catch (undoErr) {
        (err as Error & { rollbackFailed?: string }).rollbackFailed =
          undoErr instanceof Error ? undoErr.message : String(undoErr);
      }
    }
    throw err;   // always the script's own error — never the undo API's
  }
}

export async function opExecJs(params: Record<string, unknown>): Promise<ExecJsResult> { /* see below */ }
```

`opExecJs` body:

```ts
  const code = params.code ?? params.js;
  if (typeof code !== 'string' || !code.trim()) {
    throw withCode(new Error('EXEC_JS requires params.code (string)'), 'E_INVALID_ARGS');
  }
  const logs: string[] = [];
  const capture = (level: string) => (...args: unknown[]) => {
    logs.push(`[${level}] ${args.map(safeStringify).join(' ')}`);
  };
  const consoleProxy: ConsoleProxy = {
    log: capture('log'), info: capture('info'), warn: capture('warn'), error: capture('error'),
  };

  let compiled: { fn: ExecFn; mode: 'expression' | 'statement' };
  try {
    compiled = compile(code);
  } catch (err) {
    throw withCode(new Error(`syntax error: ${err instanceof Error ? err.message : String(err)}`), 'E_EVAL');
  }

  const bracket = params.undoGroup === true ? figmaUndoBracket() : null;
  const t0 = Date.now();
  try {
    const raw = await runInUndoGroup(bracket, () => compiled.fn(consoleProxy, createExecStdlib()));
    const warning = resultWarning(raw, compiled.mode);
    return {
      result: summarize(raw), console: logs, ms: Date.now() - t0,
      executed: true, mode: compiled.mode, ...(warning ? { warning } : {}),
    };
  } catch (err) {
    // Read the OUTCOME tags set by runInUndoGroup — never infer rollback from `bracket !== null`.
    const rolledBack = (err as { rolledBack?: boolean } | null)?.rolledBack === true;
    const rollbackFailed = (err as { rollbackFailed?: string } | null)?.rollbackFailed;
    const base = `runtime error: ${err instanceof Error ? err.message : String(err)}`;
    const suffix = rolledBack ? ' — changes rolled back'
      : rollbackFailed ? ` — ROLLBACK FAILED (${rollbackFailed}); the canvas may be half-changed`
      : '';
    const wrapped = withCode(new Error(`${base}${suffix}`), 'E_EVAL');
    if (rolledBack) (wrapped as Error & { rolledBack?: boolean }).rolledBack = true;
    throw wrapped;
  }
```

Contract notes (state them in code comments; they are limits, not oversights):
- The commit order is **C0 → script → C1 → triggerUndo**. The naive `commit → mutate → trigger` was
  proven not to roll back at all (smoke test, research report §"Smoke tests" 1). Do not reorder.
- A script that calls `figma.commitUndo()`/`triggerUndo()` itself splits the group; the rollback then
  reverts only the last sub-group while still reporting `rolledBack: true`. **Contract: scripts run
  with `--undo-group` must not call the undo API.** Not detectable in-sandbox.
- `console` and `ui` are **wrapper parameters**, so a script cannot declare its own
  (`const ui = …` at top level is `SyntaxError: Identifier 'ui' has already been declared`, and the
  statement form is the last fallback — it surfaces as `E_EVAL syntax error`). Both names are
  reserved; say so in `--help` rather than pretending shadowing works.
- `params.timeoutMs` is **not enforceable plugin-side** (no `setTimeout` in MAIN, no way to interrupt
  a running `eval`); a CLI `E_TIMEOUT` abandons the reply while the script keeps mutating, so
  `--undo-group` cannot rescue a timed-out run. Callers split long scripts.

### 3. NEW `plugin/src/main/exec-stdlib.ts` (~185 lines, hard cap 200)

Injected as the wrapper's second parameter, so scripts get `ui.*` with no import. Every helper either
returns a **verified** result or throws (→ `E_EVAL`). If the file crosses 200 lines, split
`exec-stdlib-instance.ts` (setProps + swapInstance) and re-export — never shrink the error messages.

**Reuse, do not re-implement** (the repo's own rule — `resolve-main-component.ts:1-10` exists because
a second copy of ref-resolution was the mistake to avoid):

| Need | Existing module |
|---|---|
| component ref → live `ComponentNode` | `resolveMainComponent({componentKey?, componentId?})` — `plugin/src/main/resolve-main-component.ts:24-39` (key first, local id fallback, returns `null`, never throws) |
| variable name/id → `Variable` | `resolveVariable` — `plugin/src/main/executor-variables.ts:187-197` (**currently module-private: add `export`**) |
| bind a variable to a field | `bindVariableToField` — `executor-variables.ts:102-115` (already exported) |
| node → JSON | `serializeNode` / `jsonSafe` — `serialize-node.ts:16` / `:33` |

```ts
export interface ExecStdlib {
  setProps(inst: InstanceNode, props: Record<string, string | boolean>): Promise<Record<string, unknown>>;
  swapInstance(inst: InstanceNode, ref: string): Promise<{ id: string; mainComponent: { id: string; name: string } }>;
  boundFill(node: SceneNode, varName: string, field?: string): Promise<{ id: string; field: string; variable: string }>;
  byPath(rootId: string, names: string[]): Promise<SceneNode>;
  q(target: SceneNode | string, opts?: { depth?: number; fields?: string[] }): Promise<unknown>;
}
export function createExecStdlib(): ExecStdlib;

/** PURE — exported for unit tests: base name → the instance's actual `Name#12:34` key. */
export function resolvePropKey(keys: readonly string[], name: string): string;
```

**`setProps(inst, props)`** — backlog 3.1 + 3.2
1. `inst.type !== 'INSTANCE'` → throw `setProps expects an INSTANCE, got <type>`.
2. Snapshot `const current = inst.componentProperties` (sync getter on the instance; the sync
   `.mainComponent` getter is the one that throws under `documentAccess: dynamic-page`).
3. `resolvePropKey(Object.keys(current), name)`: exact hit, else keys `startsWith(name + '#')`.
   0 matches → throw ``property "<name>" not found on "<inst.name>" — available: <keys.join(', ')>``;
   ≥2 matches → throw `property "<name>" is ambiguous: <matches.join(', ')>`. Never guess.
4. Values are `string | boolean` only — Figma's typings accept `string | boolean | VariableAlias`, and
   the mock enforces the same refusals (`tests/helpers/mock-figma.ts:442-470`). Anything else (numbers
   included) → throw `property "<name>" needs a string or boolean, got <typeof>`. Narrow to `string`
   before step 5 or the call does not typecheck.
5. `current[key].type === 'INSTANCE_SWAP'` and the value is not a node id (`!/^\d+:\d+$/.test(v)`) →
   `const c = await resolveMainComponent({ componentKey: v })`; `null` → throw naming the key. Use
   `c.id` as the **resolved** value. (Verified on canvas 2026-07-29: `setProperties` takes the node
   **id** and rejects the key — backlog 3.2 was a misdiagnosis.)
6. `inst.setProperties(resolved)` in try/catch; rethrow with the resolved map in the message.
   Note the all-or-nothing contract: one bad entry costs the whole call.
7. Re-read `inst.componentProperties` and assert every key equals the **resolved** value
   (`String(reread[key].value) === String(resolved[key])` — comparing against the caller's original
   key always fails after a key→id swap). Mismatch → throw `setProps applied but "<key>" is still <old>`.
8. Return the re-read map as plain `{ key: value }`.

**`swapInstance(inst, ref)`**
- `ref.includes(':')` → `resolveMainComponent({ componentId: ref })`, else
  `resolveMainComponent({ componentKey: ref })`; `null` → throw `component not found: <ref>`.
- `inst.swapComponent(component)`, then assert `(await inst.getMainComponentAsync())?.id === component.id`
  (async getter only — the sync one throws under dynamic-page; mock models this at `:192-205`).
- Return `{ id: inst.id, mainComponent: { id, name } }`.

**`boundFill(node, varName, field = 'fills')`** — backlog 3.4
- `resolveVariable(varName)` (throws `variable not found: …`), then `bindVariableToField(node, field, variable)`.
- **Assert by searching `boundVariables` for the variable id, not by field name.** Figma re-keys some
  bindings (`cornerRadius` surfaces as `topLeftRadius`/`topRightRadius`/`bottomLeftRadius`/
  `bottomRightRadius`; paints surface as arrays), so a field-name check reports successes as failures:
  ```ts
  const bv = (node as unknown as { boundVariables?: Record<string, unknown> }).boundVariables ?? {};
  const hit = Object.values(bv).some((entry) => {
    const list = Array.isArray(entry) ? entry : [entry];
    return list.some((a) => (a as { id?: string } | null)?.id === variable.id);
  });
  ```
  `!hit` → throw ``bind of "<varName>" to <field> did not take on "<node.name>" — boundVariables: <JSON>``.
  This is the point of the helper: `setBoundVariableForPaint(..., undefined)` never throws by itself.
- Return `{ id: node.id, field, variable: variable.name }`.

**`byPath(rootId, names)`** — backlog 2.3
- `names.length === 0` → throw `byPath needs at least one name` (the return type is `SceneNode`; a
  bare root may be DOCUMENT/PAGE).
- `figma.getNodeByIdAsync(rootId)` returns `BaseNode | null` → reject `null`, `DOCUMENT`, `PAGE`
  (same narrowing as `executor-ops.ts:67-74 getSceneNode`).
- Walk to the owning `PAGE` and `await page.loadAsync()` when it is not the current page — under
  `dynamic-page` an unloaded page's children are not enumerable.
- Each step: `const hits = children.filter((c) => c.name === name)` — **`find` would silently pick
  the first of several same-named siblings, which is exactly the wrong answer a fail-loud helper
  exists to prevent**. `hits.length === 0` → throw
  `byPath: "<name>" not found under "<cur.name>" — children: <first 20 names>`;
  `hits.length > 1` → throw `byPath: "<name>" is ambiguous under "<cur.name>" — <n> matches: <ids>`;
  a childless node mid-path → throw `"<cur.name>" (<type>) has no children`.

**`q(target, {depth = 1, fields})`** — backlog 4.1
- ids resolve via `getNodeByIdAsync`, rejecting `null`/`DOCUMENT`/`PAGE` (`serializeNode` wants a `SceneNode`).
- **Validate `fields` against what `serializeNode` actually produces** (`serialize-node.ts:4-13`:
  `id, name, type, x, y, width, height, children`). An unknown field → throw
  `q: unknown field "<f>" — available: name, type, x, y, width, height, children`. Silently
  returning `{id}` for `fields:['componentProperties']` is the same silent-wrong-answer class this
  wave exists to kill.
- `serializeNode(node, depth)`, then project: `id` always kept, plus the requested fields, recursing
  into `children` when present. Without `fields`, return the full serialization. Return `jsonSafe(projected)`.

### 4. `plugin/src/main/main.ts` — commitUndo per mutating command (backlog 2.4)

Add next to the other command-classification helpers (`resultMutationIds:210`, `mutationTargetIds:219`):

```ts
// Each successful mutating command becomes its own undo step. Without commitUndo, Figma's default
// makes an entire agent session ONE ⌘Z. BATCH is absent deliberately: its children commit
// individually, which is the granularity a user wants. Read-only commands never commit.
const MUTATING_COMMANDS: readonly CommandName[] = [
  'CREATE_FRAME', 'CREATE_INSTANCE', 'SET_VARIANT', 'CREATE_VARIABLE', 'BIND_VARIABLE',
  'SET_AUTOLAYOUT', 'SET_CONSTRAINTS', 'SET_TEXT', 'CLONE_TRAITS', 'SET_CORRECTION_MEMORY',
  'EXEC_JS', 'IMPORT_PAYLOAD',
];

/** Commit AFTER the correction-memory bookkeeping so a command and its bookkeeping share one step. */
function commitIfMutating(cmd: CommandName): void {
  if (MUTATING_COMMANDS.indexOf(cmd) !== -1) figma.commitUndo();
}
```
Not in the set (nothing to seal into an undo step): `STATUS`, `GET_SELECTION`,
`SCAN_DESIGN_SYSTEM`, `AUDIT_DS`, `GET_CORRECTION_MEMORY`, `EXPORT_PNG`.
Two notes so the classification is not mistaken for "read-only":
- `AUDIT_DS` **does** move the user's current page (`executor-audit.ts` walks pages via
  `setCurrentPageAsync` and does not restore the original) — page navigation is not undoable, so a
  commit would do nothing. Excluded on that basis, not on innocence. (Not restoring the page is a
  pre-existing UX wart; out of scope here.)
- `SET_CORRECTION_MEMORY` **is** in the set — it writes `figma.root.setSharedPluginData`
  (`correction-edge-store.ts:28-31`).

`HTML_TO_FIGMA` never reaches main (it arrives as `IMPORT_PAYLOAD`).

Four call sites — **not** inside `dispatch`:

1. `figma.ui.onmessage` success path, after the `recordAgentMutation` loop and before/after the
   reply post (`main.ts:196-198`):
   ```ts
     for (const nodeId of changedIds) recordAgentMutation(nodeId, { command: req.cmd });
     commitIfMutating(req.cmd as CommandName);
     figma.ui.postMessage({ requestId: req.requestId, ok: true, result });
   ```
2. `figma.ui.onmessage` catch path (`:199-201`) — commit **on failure too**, so a half-applied
   `IMPORT_PAYLOAD` (styles/variables created before the throw) owns its own undo step instead of
   being swallowed into the next command's:
   ```ts
   } catch (err) {
     commitIfMutating(req.cmd as CommandName);
     figma.ui.postMessage({ requestId: req.requestId, ok: false, error: shapeError(err) });
   }
   ```
3. + 4. `runBatch` (`:330-337`), after each child's success and each child's error, so a batch is
   undone op-by-op. **Scope note (verified, do not "fix" here):** batch children go straight to
   `dispatch` and never touch `mutationTargetIds` / `beginAgentMutation` / `resultMutationIds` /
   `recordAgentMutation` — that bookkeeping runs only for the top-level request (`main.ts:193-197`),
   and `BATCH` itself yields no target ids. So batch children have **no** correction-memory record
   today; per-child commits therefore cannot split a command from bookkeeping that does not exist.
   The gap is pre-existing and stays out of this wave (log it as backlog, do not widen the diff):
   ```ts
     try {
       results.push({ ok: true, cmd: op.cmd, result: await dispatch(op.cmd, op.params ?? {}) });
       commitIfMutating(op.cmd);
     } catch (err) {
       commitIfMutating(op.cmd);
       results.push({ ok: false, cmd: op.cmd, error: shapeError(err) });
       if (stopOnError) break;
     }
   ```

Why not inside `dispatch` (`:229-258`): for the **top-level** request the handler writes agent-mutation
bookkeeping *after* `dispatch` returns (`:196-197`); committing inside `dispatch` would push that write
into the following undo step, where an undo could split a command from its record. (For batch
children the point is moot — see the scope note above.)

`shapeError` (`:204-208`) must widen its return type or the extra field is a TS2353 excess property:

```ts
import type { CommandName, ErrorCode, WireError } from '../../../shared/protocol';

function shapeError(err: unknown): WireError {
  const code = ((err as { code?: string } | null)?.code ?? 'E_PLUGIN_ERROR') as ErrorCode;
  const message = err instanceof Error ? err.message : String(err);
  const rolledBack = (err as { rolledBack?: boolean } | null)?.rolledBack;
  return rolledBack ? { code, message, rolledBack } : { code, message };
}
```

### 5. `cli/src/commands/exec-js.ts` — `--undo-group`, warning on stderr

Keep the `activity` label logic (`:31-35`) untouched:

```ts
  const undoGroup = args.bool('undo-group');
  const out = await runCommand('EXEC_JS', { code, timeoutMs, undoGroup },
    { timeoutMs: timeoutMs + WIRE_MARGIN_MS, activity });
  // stdout stays exactly one JSON object (the CLI contract); the human warning goes to stderr.
  const warning = (out as { warning?: unknown } | null)?.warning;
  if (typeof warning === 'string') process.stderr.write(`warning: ${warning}\n`);
  return out;
```

`cli/src/transport/protocol-helpers.ts:15-22` — `CliError` gains an optional carrier so the flag
survives to stdout:
```ts
export class CliError extends Error {
  readonly code: ErrorCode;
  readonly rolledBack?: boolean;
  constructor(code: ErrorCode, message: string, opts?: { rolledBack?: boolean }) { … }
}
```
`cli/src/transport/broker-client.ts` — where the reply rejects, pass it through:
`reject(new CliError(reply.error.code, reply.error.message, { rolledBack: (reply.error as WireError).rolledBack }))`.
`cli/src/util/json-out.ts:11-17` — include `rolledBack: true` in the printed error **only when set**
(absent field ⇒ byte-identical output to today).

`cli/src/figma-agent.ts` HELP (`:89`) — the contract line ships with the flag:
```
  exec-js              <file|-> [--timeout ms (cap 120000)] [--undo-group]
                       --undo-group brackets the script in ONE undo step and reverts it on error;
                       the script must not call figma.commitUndo/triggerUndo itself, and a timeout
                       cannot stop a running script (the plugin has no cancellation).
                       `console` and `ui` are injected — a script cannot declare its own.
```

### 6. Consumers of the EXEC_JS envelope — enumerated, all safe

Adding `executed` / `mode` / `warning` is additive; both unwrappers recognise the envelope by shape:

| Consumer | file:line | Effect |
|---|---|---|
| `unwrapExecJsReply` | `cli/src/commands/scan-node.ts:46-56` | `'result' in r && ('console' in r \|\| 'ms' in r)` — still true |
| `unwrapExecJs` (panel feed) | `plugin/src/ui/activity-summary.ts:33-39` | same shape test |
| `scanConventions` | `cli/src/commands/scan-conventions.ts:113-120` | reads `.result` directly |
| `mirror-verify` scratch removal | `cli/src/commands/mirror-verify.ts:149-159` | ignores the reply |
| `seat` probe | `cli/src/commands/seat.ts:54-55` | reads `res?.wrote` off the **envelope**, not `res.result.wrote` — a pre-existing bug (`writeOk` can never be `true`); this phase neither fixes nor worsens it. Reported, not touched. |

None of these pass `undoGroup`, so they keep today's semantics exactly.

### 7. Tests (vitest — new here, per repo convention)

`figma-agent/tests/`, run by `npm test` in the workspace (`vitest run --config vitest.config.ts`).
Pure logic only; **do not** add `commitUndo`/`currentPage`/`root` stubs to `tests/helpers/mock-figma.ts`
— that file's whole point is that it models Figma's refusals, and a permissive addition is how the
repo shipped three green suites over live bugs (`mock-figma.ts:1-30`).

1. `tests/exec-js-normalize.test.ts` — imports `compile`, `expressionCandidates`, `resultWarning`,
   `summarize` from `../plugin/src/main/executor-exec-js.ts` (no `figma` global needed at import time;
   keep the module free of top-level figma access so a plain import works):
   - `(async () => { return 1 })();` → `mode === 'expression'`, awaiting `fn` yields `1`
     (the 2.5 regression, locked);
   - **the harder spellings**: `(async () => 1)(); // done`, `(async () => 1)();  /* done */`,
     `(async () => 1)() ;;` → all `expression`;
   - `const a = 1; a + 1` → `statement`, result `undefined`;
   - a string literal ending in `//` (e.g. `"https://x//"`) still compiles as `expression` and keeps
     its value — proof that a bad strip only fails to parse, never corrupts;
   - `figma.currentPage.name` → `expression` (no figma access at compile time);
   - `resultWarning(undefined,'statement')` mentions `no explicit return`; `null`, `[]`, `{}` each
     warn; `0`, `false`, `''`, `{a:1}` do **not**;
   - `summarize` of a `{id,type,name,remove()}` stub → `{id,name,type}`; of an array → mapped.
2. `tests/exec-undo-group.test.ts` — `runInUndoGroup` with a recording bracket:
   - success → `['begin','commit']`, no `rollback`;
   - throw → `['begin','rollback']`, the **script's** error rethrown, tagged `rolledBack === true`;
   - a bracket whose `rollback()` throws → the script's error still rethrown (not the undo error),
     `rolledBack` **unset**, `rollbackFailed` carrying the undo message;
   - `null` bracket → no calls, value/throw passes through untagged.
   This is the order guarantee that protects the caller's previous undo step, plus the honesty
   guarantee on the `rolledBack` flag.
3. `tests/exec-stdlib-props.test.ts` — `resolvePropKey` pure cases (exact, `#id` suffix, miss lists
   available names, ambiguous throws), plus one integration case with `installMockFigma()` +
   `makeMockComponent()` + an INSTANCE whose `componentPropertyDefinitions` include an
   `INSTANCE_SWAP`: key → `importComponentByKeyAsync` → id, asserted through the mock's strict
   `setProperties` (`mock-figma.ts:442-470`).

## Validation

```bash
cd /Users/jang/orca/workspaces/ease-design/opah/figma-agent
npm run typecheck && npm run build && npm test     # baseline: 453 tests, 46 suites, green
```
(The monorepo root's `npm run lint` globs the root `src tests` only — it does not cover this
workspace; root `npm test` runs the `ui` binary suite and is unaffected.)

Canvas run (budget: one; fixture page `[fixture] exec-harness`, deleted afterwards). Rebuild, then
close and reopen the plugin — the first run after a `code.js` rebuild has served a stale bundle before.

1. **Normalization** — `printf '(async () => { const f = figma.createFrame(); f.name = "[fixture] a3"; return f.id })();\n' | node cli/dist/figma-agent.js exec-js -`
   → id returned, `executed:true`, `mode:"expression"`. Then a top-level-`const` script →
   `mode:"statement"`, `result:null`, `warning` present on stdout **and** stderr while stdout stays
   one JSON object (`… exec-js /tmp/a3b.js 2>/dev/null | python3 -m json.tool`).
2. **Rollback after a mutation** — script creates a frame, `await`s, throws →
   `rolledBack:true`, frame gone, a frame created by a *previous* exec-js call still there.
3. **Rollback with no mutation** (the sentinel's reason to exist) — script throws on line 1 →
   the previous frame must still exist. If this fails, stop; do not ship `--undo-group`.
4. **Stdlib** — `ui.setProps` with an INSTANCE_SWAP component key and with a misspelled prop (must
   list available names); `ui.boundFill` with a missing variable (must throw); `ui.byPath` after a
   rename; `ui.q(id,{depth:2,fields:['name','type']})`.
5. **Granular undo** — three mutating commands, then three ⌘Z presses, each reverting one.
6. **No regression for internal callers** — `figma-agent scan-node <id>` and `figma-agent
   mirror-verify …` still work (they unwrap the envelope by shape).
7. Delete the `[fixture]` page; log the run in `plans/reports/`.

## Risk & rollback

| Risk | L×I | Mitigation | Detect |
|---|---|---|---|
| `triggerUndo` eats the caller's previous undo step when the script threw before mutating | M×H | sentinel forces a non-empty group | validation 3 |
| A `--undo-group` script calls `figma.commitUndo()` itself → partial rollback reported as full | L×H | contract in `--help` + module comment; undetectable in-sandbox | script review |
| CLI `E_TIMEOUT` while the script keeps running and mutating | M×M | documented; no plugin-side cancellation exists | `ms` near the timeout, canvas changed after the error |
| Trailing-`;` stripping turns a fire-and-forget statement into an expression returning a huge node | M×M | `summarize()` collapses node-ish values | validation 1 + unit test |
| Per-command `commitUndo` splits a command from its correction-memory bookkeeping | L×M | commit placed **after** `recordAgentMutation`, never inside `dispatch` | code review of the 4 call sites |
| `exec-stdlib.ts` grows past the 200-line rule | M×L | split `exec-stdlib-instance.ts` | `wc -l` at review |
| A script declares `const ui`/`const console` → SyntaxError from the wrapper | L×M | both names reserved and documented in `--help`; the error is loud (`E_EVAL syntax error`), not silent | unit test on a shadowing script |
| `rollback()` itself throws → caller told "rolled back" when nothing was | L×H | `runInUndoGroup` tags `rolledBack` only after a successful rollback, else `rollbackFailed`; the message says the canvas may be half-changed | unit test 2 |
| Sentinel sweep deletes a user frame that happens to share the name | L×H | strays identified by `getPluginData(SENTINEL_KEY)`, never by name | code review + unit-visible constant |
| `byPath` picks the wrong same-named sibling / `q` silently drops an unknown field | M×M | ambiguity throws with ids; `fields` validated against `serializeNode`'s key set | validation 4 |

Rollback: `git revert <sha>` + `npm run build` + reload the plugin. Scripts using `ui.*` then fail
loudly (`ui is not defined`) rather than silently — the reason the stdlib is an injected parameter
rather than a monkey-patch on `figma`.
