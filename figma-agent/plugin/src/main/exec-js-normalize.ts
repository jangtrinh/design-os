// Pure EXEC_JS script normalization — split out of executor-exec-js.ts to stay under the
// repo's 200-line module cap. No `figma` global access:
// expression-vs-statement compilation, node-ish result summarization, and the empty/null/
// undefined result classification are all pure functions of their input, so a plain import
// works without a Figma sandbox (the exec-js-normalize.test.ts suite relies on exactly this).
import { jsonSafe } from './serialize-node';
import type { createExecStdlib } from './exec-stdlib';

export type ConsoleProxy = Record<'log' | 'info' | 'warn' | 'error', (...args: unknown[]) => void>;
export type ExecFn = (console: ConsoleProxy, ui: ReturnType<typeof createExecStdlib>) => Promise<unknown>;

/**
 * PURE. Expression form only ever failed on a TRAILING TERMINATOR — a `;`, or a `;` followed by a
 * comment — and that failure silently discarded whole IIFEs. Each candidate is only ever *parsed*:
 * a wrong strip fails to parse and the next candidate runs, and the statement fallback always gets
 * the ORIGINAL source, so normalization can never change what executes.
 *
 * SEMICOLON-FIRST ordering: the comment-strip regex has no notion of
 * string-literal context, so on a script whose only line ends `)();` after a string containing
 * `//` (e.g. a URL — `(async () => "https://x//")();`), stripping the comment BEFORE the semicolon
 * would eat into the string literal itself. Trying the semicolon-only strips first means the safe,
 * already-valid candidate (`(async () => "https://x//")()`) is found and returned before the
 * comment-strip variants are ever generated — `compile` stops at the first candidate that parses.
 * A candidate is still only ever *parsed*, never assumed correct, so this ordering cannot change
 * what a genuinely comment-terminated script normalizes to (see the multiline test below).
 */
export function expressionCandidates(source: string): string[] {
  const out = [source];
  let semi = source;
  for (let i = 0; i < 4; i++) {                      // e.g. `f();;` → `f();` → `f()`
    const stripped = semi.replace(/;+\s*$/, '').trimEnd();
    if (stripped === semi) break;
    semi = stripped;
    out.push(semi);
  }
  // Comment-strip (+ a further semicolon strip) variants LAST — only reached when nothing above
  // parsed, so a genuine trailing `// comment` / `/* comment */` still normalizes correctly.
  let s = semi;
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

/**
 * PURE. A "plain" object — `{}`, `Object.create(null)`, or a spread/JSON-shaped record — as
 * opposed to a `Date`, `Map`, or class instance. Those carry zero OWN enumerable keys just as
 * often as a genuinely empty plain object does (`Object.keys(new Date())` is also `[]`), so
 * `Object.keys().length === 0` alone cannot tell "empty record" from "a real value of some
 * other shape" — only the prototype can.
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
  if (typeof result === 'object' && isPlainObject(result) && Object.keys(result).length === 0) {
    return 'returned an empty object — the operation may have matched nothing';
  }
  return undefined;
}
