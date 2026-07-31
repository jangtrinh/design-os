// Scene-edit verb vocabulary for the owner-edit change feed (wave 4.4). Distinct from
// plugin/src/ui/activity-sentence.ts's COMMAND vocabulary — that table's `humanizeTool`
// merely lowercases a wire cmd (CREATE_FRAME → "create frame") and has no moved/renamed/
// deleted verbs at all; reusing it here would emit nonsense like "create frame Subtitle".
// This table describes what happened to a NODE ON THE CANVAS: created / renamed / moved /
// restyled / deleted. Pure, no DOM, no figma API, no fs. `shared/` is the right home
// because THREE consumers read this one table: `figma-agent changes` (phase 02), the
// distill step (phase 03), and later a panel row — that is the DRY the brief asks for;
// copying the panel's command table would not be.
import type { EditOp } from './edit-feed';

export type SceneEditVerb = 'created' | 'renamed' | 'moved' | 'restyled' | 'deleted';

const VERB_TEXT: Record<SceneEditVerb, string> = {
  created: 'Created',
  renamed: 'Renamed',
  moved: 'Moved',
  restyled: 'Restyled',
  deleted: 'Deleted',
};

/** `updated`'s changedProps that mean "moved" — position/layout, never a paint/text prop. */
const POSITION_PROPS: ReadonlySet<string> = new Set([
  'x', 'y', 'relativeTransform', 'constraints', 'layoutAlign', 'layoutGrow', 'layoutPositioning',
]);
const NAME_PROP = 'name';

/**
 * Which scene-edit verb an `updated` op's changedProps set implies. `renamed` wins if
 * `name` is present (the single clearest fact); else `moved` if any position/layout prop
 * is present; else `restyled` — the residual bucket for everything else (fills, strokes,
 * effects, text content, corner radius, etc). Never invents a verb beyond what
 * changedProps actually lists — an `updated` frame with an EMPTY changedProps (should not
 * happen upstream, but this is untrusted wire data) still resolves, honestly, to `restyled`
 * rather than throwing.
 */
function updateVerb(changedProps: readonly string[]): 'renamed' | 'moved' | 'restyled' {
  if (changedProps.includes(NAME_PROP)) return 'renamed';
  if (changedProps.some((p) => POSITION_PROPS.has(p))) return 'moved';
  return 'restyled';
}

/** Which scene-edit verb an edit's {op, changedProps} implies. */
export function sceneEditVerb(op: EditOp, changedProps: readonly string[]): SceneEditVerb {
  if (op === 'created') return 'created';
  if (op === 'deleted') return 'deleted';
  return updateVerb(changedProps);
}

/** "TEXT" → "text", "COMPONENT_SET" → "component set". Only used when a real name is
 *  available to build flowing prose around — the null-name fallback keeps the raw type. */
function humanizeType(type: string): string {
  return type.toLowerCase().replace(/_/g, ' ');
}

/** The minimal shape `editSentence` needs — a structural subset of EditFrame, so callers
 *  (the CLI command, the distill step) can pass a frame straight through. */
export interface SceneEditSentenceInput {
  op: EditOp;
  nodeName: string | null;
  nodeType: string;
  parentName: string | null;
  changedProps: readonly string[];
}

/**
 * One English sentence describing an owner/agent edit — never inventing a name or
 * location the frame did not carry:
 *   `Deleted text "Subtitle" in "Roles / Detail"`
 *   `Created frame "Hero card"`
 *   `Restyled instance "Button"`
 * A frame with a null `nodeName` (an unobserved delete — the session never saw that node,
 * so the identity cache had nothing to offer) degrades honestly to the RAW type rather
 * than fabricating one: `Deleted a TEXT node`.
 */
export function editSentence(frame: SceneEditSentenceInput): string {
  // Stage-4 fix round (minor 9c) — the gap-fill truncation notice (edit-gapfill.ts) is an
  // `op: 'updated'` frame with `changedProps: ['truncated']`; the generic verb mapping
  // above falls through to `restyled` for it (nothing in POSITION_PROPS/NAME_PROP
  // matches), producing the actively WRONG "Restyled page ...". This is a distinct kind
  // of fact (a scan hit its node cap, not an edit at all) and gets its own sentence,
  // checked BEFORE the normal verb path.
  if (frame.changedProps.includes('truncated')) {
    // Closing round (N5) — states the ACTUAL, current fact (gap-fill is off for this page
    // right now) rather than a speculative one ("some deletions may be invisible" implies
    // a specific past miss this session cannot actually name).
    const label = frame.nodeName ?? frame.parentName ?? 'this page';
    return `Gap-fill is disabled for "${label}" while it exceeds the scan cap`;
  }
  const verb = sceneEditVerb(frame.op, frame.changedProps);
  const verbText = VERB_TEXT[verb];
  if (frame.nodeName === null || frame.nodeName === '') {
    const rawType = frame.nodeType || 'NODE';
    return `${verbText} a ${rawType} node`;
  }
  const typeLabel = humanizeType(frame.nodeType || 'node');
  const base = `${verbText} ${typeLabel} "${frame.nodeName}"`;
  return frame.parentName ? `${base} in "${frame.parentName}"` : base;
}
