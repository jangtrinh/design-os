// Plugin MAIN thread — command dispatch loop.
// The UI relay (plugin/src/ui/ui-relay.ts) forwards CLI requests as
// {requestId, cmd, params}; every handler runs against the Figma scene and
// replies {requestId, ok:true, result} or {requestId, ok:false, error:{code,message}}.
// Orchestration handlers that need the dispatch itself (IMPORT_PAYLOAD, BATCH)
// live here; single-command executors live in executor-*.ts.

import type { CommandName, ErrorCode, FileContext, WireError } from '../../../shared/protocol';
import { DEFAULT_IDLE_MS, MIN_IDLE_MS } from '../../../shared/protocol';
import { fileMatches } from '../../../shared/file-match';
import type { FigmaExportPayload } from '../../../shared/figma-payload-types';
import {
  coalesceChanges, mapChangeType,
  type ChangeOrigin, type ComponentChange,
} from '../../../shared/figma-changes';
import {
  createColorStyles, createTextStyles, createEffectStyles,
  resetImportWarnings, getImportWarnings, withCode,
} from './executor-styles';
import { opCreateVariable, opBindVariable } from './executor-variables';
import { resetKeyedVariableCache } from './executor-keyed-vars';
import { resolveTokenVars } from './executor-token-var-resolve';
import { createFigmaNode } from './executor-frame';
import { serializeDesignSystem } from './serialize-node';
import { auditDs } from './executor-audit';
import {
  opStatus, opGetSelection, opCreateFrame, opCreateInstance, opSetVariant,
  opSetAutoLayout, opSetConstraints, opSetText, opExportPng,
} from './executor-ops';
import { opExecJs } from './executor-exec-js';
import { opCloneTraits } from './executor-clone-traits';
import { MUTATING_COMMANDS } from './mutating-commands';
import {
  beginAgentMutation,
  readEdgeCorrections,
  recordAgentMutation,
  recordDesignerCorrection,
  writeEdgeCorrections,
} from './correction-edge-store';
import type { CorrectionEvent } from '../../../shared/supervised-memory';
import { PANEL_WIDTH, PANEL_HEIGHT } from '../ui/panel-model';

// Panel IA v2: one opening size — no compact/expanded split, no user-resizable
// Details toggle left to preserve (the whole PANEL_RESIZE path is gone below).
figma.showUI(__html__, { visible: true, width: PANEL_WIDTH, height: PANEL_HEIGHT });

/** Block 2's Selection row: the first selected node's name (if any) + the count. */
function selectionSummary(): { selectionName: string | null; selectionCount: number } {
  const sel = figma.currentPage.selection; // sync getter, allowed under dynamic-page
  return { selectionName: sel.length > 0 ? sel[0].name : null, selectionCount: sel.length };
}

// Announce scene identity to the UI iframe so the panel's Context block can show
// File/Page/Selection; ui-relay also forwards this to the broker (enriches
// PLUGIN_HELLO / `figma-agent status`). Re-announce on page change AND selection
// change so the panel stays current.
let announcedFileName = '';

function announceFileInfo(): void {
  announcedFileName = figma.root.name;
  figma.ui.postMessage({
    type: 'FILE_INFO',
    data: {
      fileName: figma.root.name, page: figma.currentPage.name, fileKey: figma.fileKey ?? null,
      ...selectionSummary(),
    },
  });
}
announceFileInfo();
figma.on('currentpagechange', announceFileInfo);
// `selectionchange` fires on every click — the handler posts five-ish scalars with no
// scene traversal and no await, so it is cheap enough to leave undebounced; debouncing
// would delay the panel behind the user's own click.
figma.on('selectionchange', announceFileInfo);

/**
 * The file identity read at every request, with a rename self-heal: sync getters only,
 * safe under dynamic-page and cheap enough to call per request. `announceFileInfo` fires
 * only at startup and on `currentpagechange`; renaming the Figma FILE fires neither event,
 * so the broker's registry would keep routing the old name (and the guard below would then
 * refuse the new one). Re-announcing whenever `figma.root.name` drifts lets routing and the
 * guard converge within one round-trip instead of staying stale until the panel reloads.
 */
function fileContext(): FileContext {
  const ctx = { fileName: figma.root.name, fileKey: figma.fileKey ?? null };
  if (ctx.fileName !== announcedFileName) announceFileInfo();
  return ctx;
}

// ─── Live-sync capture (spec 004 P1) ────────────────────────────────
// Watch whole-document edits, coalesce to the component level, and post the batch
// as DOC_CHANGE; the relay forwards it to the broker, which appends it to
// design/figma.changes.jsonl. Capture ONLY — no reconcile, no registry write here.
//
// The `dynamic-page` manifest requires loadAllPagesAsync() BEFORE subscribing to
// `documentchange`, or the event fires for the current page only. We pay that cost
// once at boot (RAM measured in the P1 dogfood) so edits on any page are captured.

/** Component identity as recorded in a change (id + best-effort name + node type). */
interface ComponentIdentity {
  id: string;
  name: string | null;
  type: string;
}

/**
 * Resolve a changed node to its canonical component container: the enclosing
 * COMPONENT_SET if the node is a variant, else the nearest COMPONENT/COMPONENT_SET.
 * Returns null when the change is not under any component (the volume filter —
 * ordinary frame/text edits are ignored). Deletes arrive as a RemovedNode with only
 * id + type (no name, no parent), so a deleted DESCENDANT of a component cannot be
 * resolved upward — we capture only whole-component deletions. Documented P1 limit.
 */
function resolveComponentIdentity(node: SceneNode | RemovedNode): ComponentIdentity | null {
  if ('removed' in node && node.removed) {
    // RemovedNode: id + type only. Record it only if it WAS itself a component.
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      return { id: node.id, name: null, type: node.type };
    }
    return null;
  }
  let n: BaseNode | null = node;
  while (n) {
    if (n.type === 'COMPONENT_SET') return { id: n.id, name: n.name, type: n.type };
    if (n.type === 'COMPONENT') {
      // A variant's canonical unit is its enclosing set (matches the registry).
      if (n.parent && n.parent.type === 'COMPONENT_SET') {
        return { id: n.parent.id, name: n.parent.name, type: n.parent.type };
      }
      return { id: n.id, name: n.name, type: n.type };
    }
    n = n.parent;
  }
  return null;
}

// ─── Idle-commit timer (spec 004 P4) ────────────────────────────────
// Every captured documentchange resets a debounce; after IDLE_MS of quiet the plugin
// posts IDLE_READY {count} to its iframe, which shows the "N changes — Sync now /
// Later" prompt. IDLE_MS defaults to 5 min and is overridden by SYNC_CONFIG (the
// project's design/figma-sync.json, relayed by the broker). The change-log the broker
// already persisted is the source of truth — the timer only decides WHEN to prompt.
let idleMs = DEFAULT_IDLE_MS;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let changesSinceCommit = 0;

function resetIdleTimer(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(fireIdle, idleMs);
}

function fireIdle(): void {
  idleTimer = null;
  if (changesSinceCommit <= 0) return; // nothing accumulated — no prompt
  figma.ui.postMessage({ type: 'IDLE_READY', data: { count: changesSinceCommit } });
  // Reset here: the displayed count means "changes since this prompt". The log/cursor
  // stay authoritative — Sync applies EVERYTHING past the cursor regardless of count.
  changesSinceCommit = 0;
}

function onDocumentChange(event: DocumentChangeEvent): void {
  const raw: ComponentChange[] = [];
  for (const dc of event.documentChanges) {
    const changedNode = (dc as { node: SceneNode | RemovedNode }).node;
    if (!('removed' in changedNode) || !changedNode.removed) {
      recordDesignerCorrection(changedNode.id, {
        changeType: dc.type,
        properties: dc.type === 'PROPERTY_CHANGE' ? [...dc.properties] : [],
      });
    }
    const op = mapChangeType(dc.type);
    if (op === null) continue; // STYLE_* — components only in P1
    const identity = resolveComponentIdentity((dc as { node: SceneNode | RemovedNode }).node);
    if (!identity) continue; // change not under any component — filtered out
    raw.push({
      op,
      nodeId: identity.id,
      nodeName: identity.name,
      nodeType: identity.type,
      changedProps: dc.type === 'PROPERTY_CHANGE' ? [...dc.properties] : [],
      origin: dc.origin as ChangeOrigin,
    });
  }
  const changes = coalesceChanges(raw);
  if (changes.length === 0) return;
  figma.ui.postMessage({
    type: 'DOC_CHANGE',
    data: { changes, page: figma.currentPage.name, fileKey: figma.fileKey ?? null },
  });
  changesSinceCommit += changes.length;
  resetIdleTimer(); // each edit pushes the idle-commit prompt further out
}

// Subscribe only after all pages are loaded (dynamic-page requirement).
figma.loadAllPagesAsync()
  .then(() => figma.on('documentchange', onDocumentChange))
  .catch((err) => figma.notify(`live-sync capture disabled: ${err instanceof Error ? err.message : String(err)}`));

type Params = Record<string, unknown>;

interface UiRequest { requestId: string; cmd: CommandName; params?: Params; expectedFile?: string }

figma.ui.onmessage = async (msg: unknown) => {
  // Panel IA v2 removed the Details toggle — its PANEL_RESIZE message was the only
  // emitter, so the handler that used to live here (and phase-01's width-preserving
  // resize on top of it) is gone with it. One opening size, never resized again.
  const chrome = msg as { type?: unknown; data?: unknown } | null;
  // Live-sync (spec 004 P4): the broker's idle window, relayed by the iframe.
  if (chrome && chrome.type === 'SYNC_CONFIG') {
    const raw = (chrome.data as { idleMs?: unknown } | undefined)?.idleMs;
    if (typeof raw === 'number' && Number.isFinite(raw)) idleMs = Math.max(MIN_IDLE_MS, Math.floor(raw));
    return;
  }
  // The panel's "Sync now" click committed — reset the local counter (the log/cursor
  // remain the real state). The iframe already forwarded SYNC_REQUEST to the broker.
  if (chrome && chrome.type === 'SYNC_DONE') {
    changesSinceCommit = 0;
    return;
  }
  // The relay boots before main's first FILE_INFO push can possibly have arrived — an
  // iframe-originated error raised in that window would otherwise have no identity to
  // attach to its reply. Re-announcing on demand closes that race.
  if (chrome && chrome.type === 'UI_READY') { announceFileInfo(); return; }
  const req = msg as Partial<UiRequest> | null;
  if (!req || typeof req.requestId !== 'string' || typeof req.cmd !== 'string') return; // relay chatter, not a command
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
    const result = await dispatch(req.cmd, req.params ?? {});
    const changedIds = [...new Set([...targetIds, ...resultMutationIds(req.cmd as CommandName, result)])];
    for (const nodeId of changedIds) recordAgentMutation(nodeId, { command: req.cmd });
    commitIfMutating(req.cmd as CommandName);
    figma.ui.postMessage({ requestId: req.requestId, ok: true, result, fileContext: ctx });
  } catch (err) {
    // Commit on failure too, so a half-applied mutation (e.g. IMPORT_PAYLOAD styles/
    // variables created before the throw) owns its own undo step instead of being
    // swallowed into the next command's.
    commitIfMutating(req.cmd as CommandName);
    figma.ui.postMessage({ requestId: req.requestId, ok: false, error: shapeError(err), fileContext: ctx });
  }
};

/** Commit AFTER the correction-memory bookkeeping so a command and its bookkeeping share one step. */
function commitIfMutating(cmd: CommandName): void {
  if (MUTATING_COMMANDS.indexOf(cmd) !== -1) figma.commitUndo();
}

function shapeError(err: unknown): WireError {
  const code = ((err as { code?: string } | null)?.code ?? 'E_PLUGIN_ERROR') as ErrorCode;
  const message = err instanceof Error ? err.message : String(err);
  const rolledBack = (err as { rolledBack?: boolean } | null)?.rolledBack;
  return rolledBack ? { code, message, rolledBack } : { code, message };
}

function resultMutationIds(cmd: CommandName, result: unknown): string[] {
  const creating: readonly CommandName[] = [
    'CREATE_FRAME', 'CREATE_INSTANCE', 'IMPORT_PAYLOAD', 'HTML_TO_FIGMA',
  ];
  if (!creating.includes(cmd) || !result || typeof result !== 'object') return [];
  const id = (result as { id?: unknown }).id;
  return typeof id === 'string' && id ? [id] : [];
}

function mutationTargetIds(cmd: CommandName, params: Params): string[] {
  const mutating: readonly CommandName[] = [
    'SET_VARIANT', 'BIND_VARIABLE', 'SET_AUTOLAYOUT', 'SET_CONSTRAINTS',
    'SET_TEXT', 'CLONE_TRAITS',
  ];
  if (!mutating.includes(cmd)) return [];
  const raw = cmd === 'CLONE_TRAITS' ? params.targetId ?? params.target : params.nodeId ?? params.node;
  return typeof raw === 'string' && raw ? [raw] : [];
}

async function dispatch(cmd: CommandName, params: Params): Promise<unknown> {
  switch (cmd) {
    case 'STATUS': return opStatus();
    case 'GET_SELECTION': return opGetSelection(params);
    case 'SCAN_DESIGN_SYSTEM': return serializeDesignSystem();
    case 'AUDIT_DS': return auditDs();
    case 'CREATE_FRAME': return opCreateFrame(params);
    case 'CREATE_INSTANCE': return opCreateInstance(params);
    case 'SET_VARIANT': return opSetVariant(params);
    case 'CREATE_VARIABLE': return opCreateVariable(params);
    case 'BIND_VARIABLE': return opBindVariable(params);
    case 'SET_AUTOLAYOUT': return opSetAutoLayout(params);
    case 'SET_CONSTRAINTS': return opSetConstraints(params);
    case 'SET_TEXT': return opSetText(params);
    case 'CLONE_TRAITS': return opCloneTraits(params);
    case 'GET_CORRECTION_MEMORY': return { events: readEdgeCorrections() };
    case 'SET_CORRECTION_MEMORY': {
      const events = params.events;
      if (!Array.isArray(events)) throw withCode(new Error('SET_CORRECTION_MEMORY requires events[]'), 'E_INVALID_ARGS');
      return { events: writeEdgeCorrections(events as CorrectionEvent[]) };
    }
    case 'EXPORT_PNG': return opExportPng(params);
    case 'EXEC_JS': return opExecJs(params);
    case 'IMPORT_PAYLOAD': return importPayload(params);
    case 'BATCH': return runBatch(params);
    default:
      // HTML_TO_FIGMA is handled entirely in the UI relay and arrives here as IMPORT_PAYLOAD
      throw withCode(new Error(`unknown command: ${cmd}`), 'E_INVALID_ARGS');
  }
}

/**
 * IMPORT_PAYLOAD: consume a FigmaExportPayload (ported EaseUI code.ts import
 * path): styles + variables from tokens → node tree → position → select.
 */
async function importPayload(params: Params): Promise<{ id: string; name: string; warnings: string[] }> {
  const payload = (params.payload ?? params) as FigmaExportPayload;
  if (!payload || typeof payload !== 'object' || !payload.rootNode) {
    throw withCode(new Error('IMPORT_PAYLOAD requires params.payload (FigmaExportPayload with rootNode)'), 'E_INVALID_ARGS');
  }
  resetImportWarnings();
  resetKeyedVariableCache(); // spec-005 P7/P8: one resolve per variable key, per import run

  // 1. Local styles + variables from tokens (variables are de-duped on re-import);
  //    tokenVars (name → Variable) feeds tokenRefs binding during node build (P3 leg B).
  //    spec-005 P6: the map now also carries the file's EXISTING local variables, so a
  //    rebuild from a spec alone (no payload.tokens) reattaches its bindings by name.
  const tokens = payload.tokens ?? { colors: [], typography: [], spacing: [], radii: [], shadows: [] };
  const colorStyles = await createColorStyles(tokens.colors ?? []);
  await createTextStyles(tokens.typography ?? []);
  await createEffectStyles(tokens.shadows ?? []);
  const tokenVars = await resolveTokenVars(tokens);

  // 2. Build the node tree (tokenRefs bound inline via tokenVars)
  const root = await createFigmaNode(payload.rootNode, colorStyles, tokenVars);
  if (!root) throw new Error('payload rootNode produced no Figma node');

  // 3. Resolve replace target + parent BEFORE positioning
  let replaceTarget: SceneNode | null = null;
  if (typeof params.replaceId === 'string' && params.replaceId) {
    const t = await figma.getNodeByIdAsync(params.replaceId);
    if (t && t.type !== 'DOCUMENT' && t.type !== 'PAGE') replaceTarget = t as SceneNode;
  }
  let parent: BaseNode & ChildrenMixin = figma.currentPage;
  if (typeof params.parentId === 'string' && params.parentId) {
    const p = await figma.getNodeByIdAsync(params.parentId);
    if (p && 'appendChild' in p) parent = p as BaseNode & ChildrenMixin;
  }
  parent.appendChild(root);

  // 4. Position: replace target's coords > explicit x/y > viewport center
  if (replaceTarget) {
    root.x = replaceTarget.x;
    root.y = replaceTarget.y;
    replaceTarget.remove(); // only after the new node is placed successfully
  } else if (typeof params.x === 'number' && typeof params.y === 'number') {
    root.x = params.x;
    root.y = params.y;
  } else {
    root.x = Math.round(figma.viewport.center.x - root.width / 2);
    root.y = Math.round(figma.viewport.center.y - root.height / 2);
  }

  // 5. Select + bring into view (skip silently if parented to another page)
  try {
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
  } catch { /* root not on current page */ }

  figma.notify(`Imported "${payload.name}" (${(tokens.colors ?? []).length} colors, ${(tokens.typography ?? []).length} text styles)`);
  return { id: root.id, name: root.name, warnings: getImportWarnings() };
}

/** BATCH: sequential {cmd, params}[] through the same dispatch; stopOnError optional. */
async function runBatch(params: Params): Promise<{ results: unknown[] }> {
  const ops = Array.isArray(params) ? params : (params.ops as { cmd: CommandName; params?: Params }[]);
  if (!Array.isArray(ops)) {
    throw withCode(new Error('BATCH requires params.ops: {cmd, params}[]'), 'E_INVALID_ARGS');
  }
  const stopOnError = (params as Params).stopOnError === true;
  const results: unknown[] = [];
  for (const op of ops) {
    // Scope note (verified, do not "fix" here): batch children go straight to dispatch
    // and never touch mutationTargetIds/beginAgentMutation/resultMutationIds/
    // recordAgentMutation — that bookkeeping runs only for the top-level request, and
    // BATCH itself yields no target ids. So batch children have no correction-memory
    // record today; per-child commits therefore cannot split a command from bookkeeping
    // that does not exist. Pre-existing gap, out of scope for this wave.
    try {
      results.push({ ok: true, cmd: op.cmd, result: await dispatch(op.cmd, op.params ?? {}) });
      commitIfMutating(op.cmd);
    } catch (err) {
      commitIfMutating(op.cmd);
      results.push({ ok: false, cmd: op.cmd, error: shapeError(err) });
      if (stopOnError) break;
    }
  }
  return { results };
}
