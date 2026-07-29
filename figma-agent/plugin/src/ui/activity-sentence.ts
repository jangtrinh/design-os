// Panel IA v2, Block 3 — one English sentence about what the agent DID, never a
// command name. Pure, no DOM, no Figma API. Consumes activity-feed.ts's record shape
// (ActivityRecord) and activity-summary.ts's pre-formatted `result` string — neither of
// those modules is rewritten; this module is the new layer on top of their output.
// Unit-tested in figma-agent/tests/activity-sentence.test.ts.

export interface SentenceInput {
  tool: string;            // wire cmd — CREATE_FRAME, EXEC_JS, IMPORT_PAYLOAD, etc.
  /**
   * The CLI's intent label, when it sent one. Accepted for shape-completeness with
   * ActivityRecord (every caller has it handy), but NONE of the rules below read it —
   * IA v2's sentence is tool-driven and node-name-driven, not label-driven; the old
   * "prefer the CLI's label" behaviour (activity-feed.ts's former `activityLabel`)
   * does not carry over. Kept as a field, not wired in, so a future pass can revisit
   * without another interface change.
   */
  label?: string;
  result?: string;         // the plugin-derived result summary (activity-summary.ts's output)
  errorCode?: string;      // wire ErrorCode, when the reply failed
  errorMessage?: string;   // the plugin's own (already human) message
  nodeName?: string;       // ONLY when the reply actually carried a name
  pending: boolean;
  ok: boolean;
}

/** Readable fallback stem for a wire command with no entry below: "CREATE_VARIANT_SET" → "create variant set". */
export function humanizeTool(tool: string): string {
  return tool.toLowerCase().replace(/_/g, ' ');
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

interface ToolVerbs {
  /** "Creating a frame" — the pending-state stem, rendered as-is (no trailing glyph). */
  continuous: string;
  /** "Created a frame" — success, no name, no count. */
  plain: string;
  /** "Created frame" — success WITH a name; the sentence appends `"${nodeName}"`. Falls back to `plain`. */
  withObject?: string;
  /** "Scanned" — success carrying a count ("→ 42 nodes" → "Scanned 42 nodes"). Falls back to `plain`. */
  countVerb?: string;
}

// Only the tools worth a nicer phrase than the humanized fallback. Everything else goes
// through `defaultVerbs` below — "unknown tool → humanizeTool as the fallback stem",
// never a bare cmd.
const TOOL_VERBS: Record<string, ToolVerbs> = {
  CREATE_FRAME: { continuous: 'Creating a frame', plain: 'Created a frame', withObject: 'Created frame' },
  CREATE_INSTANCE: { continuous: 'Creating an instance', plain: 'Created an instance', withObject: 'Created instance' },
  SET_TEXT: { continuous: 'Setting text', plain: 'Set text', withObject: 'Set text on' },
  SET_VARIANT: { continuous: 'Setting a variant', plain: 'Set a variant' },
  CREATE_VARIABLE: { continuous: 'Creating a variable', plain: 'Created a variable', withObject: 'Created variable' },
  BIND_VARIABLE: { continuous: 'Binding a variable', plain: 'Bound a variable' },
  SET_AUTOLAYOUT: { continuous: 'Setting auto layout', plain: 'Set auto layout' },
  SET_CONSTRAINTS: { continuous: 'Setting constraints', plain: 'Set constraints' },
  CLONE_TRAITS: { continuous: 'Cloning traits', plain: 'Cloned traits' },
  EXPORT_PNG: { continuous: 'Exporting an image', plain: 'Exported an image' },
  EXEC_JS: { continuous: 'Running a script', plain: 'Ran a script', countVerb: 'Scanned' },
  IMPORT_PAYLOAD: { continuous: 'Importing a design', plain: 'Imported a design', withObject: 'Imported', countVerb: 'Imported' },
  HTML_TO_FIGMA: { continuous: 'Importing a design', plain: 'Imported a design', withObject: 'Imported', countVerb: 'Imported' },
  SCAN_DESIGN_SYSTEM: { continuous: 'Scanning the design system', plain: 'Scanned the design system', countVerb: 'Scanned' },
  AUDIT_DS: { continuous: 'Auditing the design system', plain: 'Audited the design system' },
  BATCH: { continuous: 'Running a batch', plain: 'Ran a batch' },
  STATUS: { continuous: 'Checking status', plain: 'Checked status' },
  GET_SELECTION: { continuous: 'Reading the selection', plain: 'Read the selection' },
  // Local-only pseudo-tool: the panel's own "Sync now" push (panel-ui.ts), not a wire command.
  RECONCILE: { continuous: 'Syncing', plain: 'Synced' },
};

function defaultVerbs(tool: string): ToolVerbs {
  const h = humanizeTool(tool);
  return { continuous: `Running ${h}`, plain: `Ran ${h}` };
}

/** "→ 42 nodes" + verb "Scanned" → "Scanned 42 nodes". Null when `result` has no leading count. */
function countSentence(verb: string, result: string | undefined): string | null {
  if (!result) return null;
  const m = /^→\s*(\d+)\s+(.+)$/.exec(result);
  return m ? `${verb} ${m[1]} ${m[2]}` : null;
}

// Wire codes with their own fixed sentence — no plugin message appended, because the
// code alone already says everything a caller needs ("try again with --file dropped",
// "open the plugin"). Every OTHER code falls through to the generic tool-failed stem.
const CODE_SENTENCES: Record<string, string> = {
  E_WRONG_FILE: 'That command was meant for another file',
  E_NO_PLUGIN: 'The plugin was not connected',
};

/** failure → the reason, never a code. */
function failureSentence(tool: string, errorCode: string | undefined, errorMessage: string | undefined): string {
  const message = typeof errorMessage === 'string' ? errorMessage.trim() : '';
  if (errorCode === 'E_INVALID_ARGS') return message || 'The command was invalid';
  if (errorCode === 'E_EVAL') return message ? `The script stopped: ${message}` : 'The script stopped';
  if (errorCode !== undefined && errorCode in CODE_SENTENCES) return CODE_SENTENCES[errorCode];
  const stem = `${capitalize(humanizeTool(tool))} failed`;
  return message ? `${stem} — ${message}` : stem;
}

/** One English sentence about what the agent DID — never a command name, never a code. */
export function activitySentence(input: SentenceInput): string {
  const { tool, result, errorCode, errorMessage, nodeName, pending, ok } = input;
  const verbs = TOOL_VERBS[tool] ?? defaultVerbs(tool);

  // No text-glyph ellipsis (judge ruling): the continuous stem alone reads fine as
  // pending — the icon (a spinning circle-notch) already carries "in progress".
  if (pending) return verbs.continuous;
  if (!ok) return failureSentence(tool, errorCode, errorMessage);
  if (typeof nodeName === 'string' && nodeName !== '') return `${verbs.withObject ?? verbs.plain} "${nodeName}"`;
  const count = countSentence(verbs.countVerb ?? verbs.plain, result);
  if (count) return count;
  return verbs.plain; // never fabricate a name or a count the reply did not carry
}
