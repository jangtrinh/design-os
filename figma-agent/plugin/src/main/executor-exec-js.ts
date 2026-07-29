// EXEC_JS: normalize (exec-js-normalize.ts) → eval → run with the injected `ui` stdlib →
// classify the result so a script can never fail silently. --undo-group brackets the run
// in one undo step; the sentinel guarantees that step is non-empty, so a rollback can never
// consume the CALLER's previous undo step.
import { withCode } from './executor-styles';
import { safeStringify } from './serialize-node';
import { createExecStdlib } from './exec-stdlib';
import {
  compile, resultWarning, summarize, type ConsoleProxy, type ExecFn,
} from './exec-js-normalize';

// Re-exported so existing callers/tests of the normalization functions keep importing them
// from this module — executor-exec-js.ts stays the public face of the EXEC_JS feature, the
// same way exec-stdlib.ts re-exports resolvePropKey from exec-stdlib-instance.ts.
export { compile, expressionCandidates, resultWarning, summarize } from './exec-js-normalize';

const SENTINEL_NAME = '[figma-agent] undo sentinel';

export interface ExecJsResult {
  result: unknown;
  console: string[];
  ms: number;
  executed: true;                    // present on every success — the anti-silent-null marker
  mode: 'expression' | 'statement';
  warning?: string;
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
    // Codex round 1, finding 2: `throw "boom"` (a primitive) can't carry a property tag — an
    // assignment on it either throws (strict mode) or silently drops the tag (sloppy). Normalize
    // ONCE, here, into an Error carrying the original value, so the tag always lands and the
    // caller always sees an Error, primitive throw or not.
    const carrier: Error & { rolledBack?: boolean; rollbackFailed?: string; originalPrimitive?: unknown } =
      typeof err === 'object' && err !== null
        ? (err as Error & { rolledBack?: boolean; rollbackFailed?: string })
        : Object.assign(new Error(String(err)), { originalPrimitive: err });
    if (bracket) {
      try {
        bracket.rollback();
        carrier.rolledBack = true;
      } catch (undoErr) {
        carrier.rollbackFailed = undoErr instanceof Error ? undoErr.message : String(undoErr);
      }
    }
    throw carrier;   // always the script's own error (normalized) — never the undo API's
  }
}

/**
 * Contract notes (limits, not oversights):
 * - The commit order is C0 → script → C1 → triggerUndo. The naive
 *   `commit → mutate → trigger` was proven not to roll back at all
 *   (smoke test, research report §"Smoke tests" 1). Do not reorder.
 * - A script that calls `figma.commitUndo()`/`triggerUndo()` itself splits the group; the
 *   rollback then reverts only the last sub-group while still reporting `rolledBack: true`.
 *   Contract: scripts run with `--undo-group` must not call the undo API. Not detectable
 *   in-sandbox.
 * - `console` and `ui` are wrapper parameters, so a script cannot declare its own
 *   (`const ui = …` at top level is `SyntaxError: Identifier 'ui' has already been declared`,
 *   and the statement form is the last fallback — it surfaces as `E_EVAL syntax error`). Both
 *   names are reserved; say so in `--help` rather than pretending shadowing works.
 * - `params.timeoutMs` is not enforceable plugin-side (no `setTimeout` in MAIN, no way to
 *   interrupt a running `eval`); a CLI `E_TIMEOUT` abandons the reply while the script keeps
 *   mutating, so `--undo-group` cannot rescue a timed-out run. Callers split long scripts.
 */
export async function opExecJs(params: Record<string, unknown>): Promise<ExecJsResult> {
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
}
