// The activity feed's OUTCOME line — pure, no DOM, no Figma API. Split from
// activity-feed.ts along the seam the import graph already drew: ui-relay.ts needs
// only these (it holds the reply), panel-ui.ts needs only the record model (it holds
// the rows). Unit-tested in figma-agent/tests/activity-summary.test.ts.
//
// The division of labour: the CLI names the INTENT ("Mirror-verify · rebuild",
// carried on RequestMsg.activity) because only the caller knows why it called; the
// plugin derives the OUTCOME ("→ 42 nodes") because only the plugin holds the reply.
// Neither side guesses the other's half.

const MAX_SPEC_DEPTH = 100; // the walker's tree is finite; this only bounds a malformed one
const MAX_ERROR_CHARS = 120; // one feed row's worth

/** Does this value look like a node spec from our own walker (vs any other EXEC_JS return)? */
function isNodeSpec(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.type === 'string' && (typeof o.name === 'string' || Array.isArray(o.children));
}

/** Count a spec tree's nodes, root included. */
export function countSpecNodes(spec: unknown, depth = 0): number {
  if (!isNodeSpec(spec) || depth > MAX_SPEC_DEPTH) return 0;
  const children = Array.isArray(spec.children) ? spec.children : [];
  let n = 1;
  for (const child of children) n += countSpecNodes(child, depth + 1);
  return n;
}

/**
 * Unwrap opExecJs's `{result, console, ms}` envelope down to the script's own return
 * value. Same shape-recognition the CLI does (cli/.../scan-node.ts unwrapExecJsReply)
 * — a bare value passes through.
 */
function unwrapExecJs(reply: unknown): unknown {
  if (reply === null || typeof reply !== 'object') return reply;
  const r = reply as Record<string, unknown>;
  return 'result' in r && ('console' in r || 'ms' in r) ? r.result : r;
}

/**
 * One-line outcome for a successful reply, or null when the command has nothing
 * countable to say (the row then shows just its duration).
 */
export function summarizeResult(cmd: string, result: unknown): string | null {
  if (cmd === 'IMPORT_PAYLOAD' || cmd === 'HTML_TO_FIGMA') {
    const r = (result ?? {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' && r.name !== '' ? r.name : 'imported';
    const warnings = Array.isArray(r.warnings) ? r.warnings.length : 0;
    return warnings > 0 ? `→ ${name}, ${warnings} warning${warnings === 1 ? '' : 's'}` : `→ ${name}`;
  }
  if (cmd === 'EXEC_JS') {
    // Only a scan returns a node spec; a mirror-verify remove-scratch ({removed:true})
    // or an ad-hoc script does not, and must not be given a fabricated count.
    const value = unwrapExecJs(result);
    if (!isNodeSpec(value)) return null;
    const n = countSpecNodes(value);
    return `→ ${n} node${n === 1 ? '' : 's'}`;
  }
  return null;
}

/**
 * One-line outcome for a failed reply, flattened to the single row it has. The message
 * carries NO fail glyph: the row's own mark column already shows ✗ and the meta is tinted
 * red — a second ✗ here is the status redundancy our own audit-ds flags.
 */
export function summarizeError(error: unknown): string {
  const e = (error ?? {}) as Record<string, unknown>;
  const raw = typeof e.message === 'string' && e.message !== ''
    ? e.message
    : (typeof error === 'string' && error !== '' ? error : 'failed');
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_ERROR_CHARS ? `${oneLine.slice(0, MAX_ERROR_CHARS - 1)}…` : oneLine;
}
