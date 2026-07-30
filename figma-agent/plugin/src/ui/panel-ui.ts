// Panel IA v2 — the thin DOM controller. It CONSUMES the P1 connection state machine
// (the `figma-agent:conn-state` CustomEvent), the `figma-agent:activity` event, and the
// new `figma-agent:peers` event (all dispatched by ui-relay.ts) and renders the panel.html
// chrome: three blocks (Status / Context / Activity) + the sync prompt. No framework, no
// Figma API, no WebSocket — all protocol/connection logic stays in the relay; all pure
// formatting stays in panel-model.ts / activity-sentence.ts. This file is glue.
//
// Load order matters: ui-relay.ts imports this module FIRST, so these listeners
// are attached before the relay fires its first transition (a fresh subscriber
// would otherwise miss the opening PROBE).
import { PORT_RANGE_START } from '../../../shared/protocol';
import type { ConnectionState, ConnectionStatePayload } from '../../../shared/protocol';
import {
  statusSentence, showOnboarding, fileNote, PANEL_HEIGHT,
  syncPromptLabel, syncResultLabel, syncNowLabel, shouldClearPendingCount,
} from './panel-model';
import {
  toActivityRecord, toActivityResult, pushActivity, resolveActivity, diffRowKeys,
  type ActivityRecord,
} from './activity-feed';
import { activitySentence } from './activity-sentence';

// Injected by scripts/build.mjs via esbuild `define` — a content hash of the
// code.js this UI bundle shipped alongside, so a reload can be verified as the
// new build rather than a stale cached iframe. Undefined in dev/test (no
// esbuild define pass); `typeof` never throws on an unresolved identifier.
declare const __BUILD_ID__: string;

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

const dot = el('fga-dot');
const sentence = el('fga-sentence');
const onboarding = el('fga-onboarding');
const ctxFile = el('fga-ctx-file');
const ctxFileNote = el('fga-ctx-file-note');
const ctxPage = el('fga-ctx-page');
const ctxSelection = el('fga-ctx-selection');
const activityList = el('fga-activity');
const versionEl = el('fga-version');
const syncPrompt = el('fga-sync');
const syncMsg = el('fga-sync-msg');
const syncNowBtn = el('fga-sync-now');
const syncLaterBtn = el('fga-sync-later');

let payload: ConnectionStatePayload | null = null;
let hadConnection = false; // ever reached `connected` — flips onboarding off forever
let activity: ActivityRecord[] = []; // newest-first, capped at 50 by pushActivity
let sceneFile = '';
let scenePage = '';
let selectionName: string | null = null;
let selectionCount = 0;
let peersCount = 1;
let peersIsActiveTarget = true; // sole plugin ⇒ trivially the target until PEERS says otherwise

// ─── Icons (Phosphor inline SVG — no text glyphs anywhere, §1) ───────────────
// Official @phosphor-icons/core v2 path data, "regular" weight, 256x256 viewBox, MIT —
// check-circle / x-circle / circle-notch, matching the family the existing footer caret
// already uses. Injected via createElementNS (never innerHTML). Each icon is
// `aria-hidden` — the ACCESSIBLE label lives on the wrapping element the icon sits in
// (`.log-icon-wrap[aria-label]` below), so the glyph itself never needs to speak for
// itself. Only the three states the activity feed actually renders: done, failed,
// in-flight (spins; stops under prefers-reduced-motion — see panel.html).
const SVG_NS = 'http://www.w3.org/2000/svg';
type IconName = 'check' | 'x' | 'notch';
const ICONS: Record<IconName, string> = {
  // check-circle, regular — the wrapper's aria-label carries the state; colour (via
  // CSS) carries "success" visually.
  check: 'M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z',
  // x-circle, regular.
  x: 'M165.66,101.66,139.31,128l26.35,26.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z',
  // circle-notch, regular — CSS rotates it (fga-spin).
  notch: 'M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z',
};

function makeIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'log-icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.appendChild(path);
  return svg;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Block 2 — CONTEXT: File (+ command-target/peers note) / Page / Selection. */
function renderContext(): void {
  ctxFile.textContent = sceneFile || '—';
  ctxFile.title = sceneFile || ''; // the row ellipsises — hover still tells the truth
  ctxFileNote.textContent = fileNote(peersCount, peersIsActiveTarget);
  ctxPage.textContent = scenePage || '—';
  ctxPage.title = scenePage || '';
  ctxSelection.textContent = selectionText();
}

/** "None" / "Hero card" / "Hero card +2 more". Never fabricates a name. The <dt>
 *  "Selection" label already frames this — "None" reads as "Selection: None". */
function selectionText(): string {
  if (selectionCount <= 0) return 'None';
  const first = selectionName ?? '(unnamed)';
  return selectionCount > 1 ? `${first} +${selectionCount - 1} more` : first;
}

/** How many of the buffered rows the feed shows (the band scrolls past this). */
const ACTIVITY_ROWS = 20;

/**
 * One feed row: [icon][sentence] + a caption line with relative time. The sentence
 * (activity-sentence.ts) says what the agent DID, in English, with a node name when the
 * reply carried one — never a command name, never a wire error code.
 *
 * `isNew` (backlog 4.7): only a row whose key was NOT in the previous render gets the
 * `.is-new` class, which is the ONLY thing the entrance animation is now scoped to
 * (panel.html) — every row is still rebuilt each render (simplest fix within this
 * file's existing full-rebuild structure), but a rebuilt-yet-unchanged row is visually
 * inert instead of replaying its arrival animation on every 1s heartbeat tick.
 */
function activityRow(r: ActivityRecord, now: number, stale: boolean, isNew: boolean): HTMLElement {
  const li = document.createElement('li');
  const classes = ['activity-row', 'fga-row'];
  if (stale) classes.push('is-stale');
  if (isNew) classes.push('is-new');
  li.className = classes.join(' ');

  const state = r.pending ? 'running' : (r.ok ? 'ok' : 'failed');
  const iconName: IconName = r.pending ? 'notch' : (r.ok ? 'check' : 'x');
  const iconWrap = document.createElement('span');
  iconWrap.className = 'log-icon-wrap fga-icon';
  iconWrap.dataset.state = state;
  iconWrap.setAttribute('aria-label', state); // the accessible label; the svg inside is aria-hidden
  iconWrap.appendChild(makeIcon(iconName));

  const body = document.createElement('div');
  body.className = 'log-body';

  const text = document.createElement('div');
  text.className = 'log-label';
  const line = activitySentence({
    tool: r.tool, label: r.label, result: r.result, errorCode: r.errorCode,
    errorMessage: !r.ok ? r.result : undefined, nodeName: r.nodeName,
    pending: r.pending, ok: r.ok,
  });
  text.textContent = line;
  text.title = line; // the row ellipsises — hover still tells the truth

  const caption = document.createElement('div');
  caption.className = 'log-meta';
  caption.textContent = r.pending ? 'running' : timeAgoCaption(now, r.at);
  caption.title = formatTimestampCaption(r.at);

  body.append(text, caption);
  li.append(iconWrap, body);
  return li;
}

// Small local wrappers so this module only imports what it uses from activity-feed.ts's
// formatting helpers, without re-exporting them under new names there.
function timeAgoCaption(now: number, at: number): string {
  const s = Math.floor((now - at) / 1000);
  if (s < 1) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
function formatTimestampCaption(at: number): string {
  if (!Number.isFinite(at)) return '—';
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// The ids shown in the PREVIOUS renderActivity() call — diffed against the next render
// so an unchanged row doesn't replay its entrance animation on every 1s heartbeat tick
// (backlog 4.7). Starts empty: the very first render's rows are all "new", which is
// correct — nothing has ever been shown before.
let previousRowKeys: string[] = [];

function renderActivity(now: number): void {
  if (activity.length === 0) { previousRowKeys = []; return; } // leave the static "No activity yet" empty-state row
  const shown = activity.slice(0, ACTIVITY_ROWS);
  const nextKeys = shown.map((r) => r.id);
  const newKeys = new Set(diffRowKeys(previousRowKeys, nextKeys));
  activityList.replaceChildren(
    ...shown.map((r, i) => activityRow(r, now, i > 0, newKeys.has(r.id))),
  );
  previousRowKeys = nextKeys;
}

function render(): void {
  const now = Date.now();
  const state: ConnectionState = payload?.state ?? 'disconnected';
  const view = statusSentence(state, payload ? now - payload.since : 0, hadConnection);

  dot.dataset.tone = view.tone;
  dot.classList.toggle('is-pulsing', state === 'probing');
  sentence.textContent = view.text;
  sentence.dataset.tone = view.tone; // the pill is gone — the sentence itself is now the tone-carrying text
  onboarding.hidden = !showOnboarding(state, hadConnection);
  renderContext();
  renderActivity(now);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
window.addEventListener('figma-agent:conn-state', (ev) => {
  const p = (ev as CustomEvent).detail as ConnectionStatePayload | undefined;
  if (!p || typeof p.state !== 'string') return;
  if (p.state === 'connected') hadConnection = true;
  payload = p;
  render();
});

// The relay announces each request twice: `start` opens the row (so the panel shows
// what is running WHILE the user waits), `done` lands the outcome onto that same row, by id.
window.addEventListener('figma-agent:activity', (ev) => {
  const detail = (ev as CustomEvent).detail as { phase?: unknown } | undefined;
  if (detail?.phase === 'done') {
    const patch = toActivityResult(detail);
    if (!patch) return;
    activity = resolveActivity(activity, patch);
  } else {
    const rec = toActivityRecord(detail);
    if (!rec) return;
    activity = pushActivity(activity, rec);
  }
  renderActivity(Date.now());
});

// Peers (panel IA v2): the broker's honest answer to "which file will my command hit?".
window.addEventListener('figma-agent:peers', (ev) => {
  const d = (ev as CustomEvent).detail as { count?: unknown; isActiveTarget?: unknown } | undefined;
  if (typeof d?.count === 'number' && Number.isFinite(d.count)) peersCount = d.count;
  if (typeof d?.isActiveTarget === 'boolean') peersIsActiveTarget = d.isActiveTarget;
  renderContext();
});

// Scene identity for Block 2 — main announces it (FILE_INFO, now carrying selection
// too); ui-relay also forwards it to the broker. This listener is read-only and independent.
window.addEventListener('message', (ev: MessageEvent) => {
  const pm = (ev.data as { pluginMessage?: { type?: string; data?: Record<string, unknown> } } | null)?.pluginMessage;
  if (!pm) return;
  // Live-sync idle prompt (spec 004 P4): main fired IDLE_READY → show "N changes ready".
  if (pm.type === 'IDLE_READY' && pm.data) {
    const count = typeof pm.data.count === 'number' ? pm.data.count : 1;
    syncMsg.textContent = syncPromptLabel(count);
    syncNowBtn.textContent = syncNowLabel(false); // a fresh prompt is never mid-refusal
    syncPrompt.hidden = false;
    return;
  }
  if (pm.type !== 'FILE_INFO' || !pm.data) return;
  if (typeof pm.data.fileName === 'string') sceneFile = pm.data.fileName;
  if (typeof pm.data.page === 'string') scenePage = pm.data.page;
  selectionName = typeof pm.data.selectionName === 'string' ? pm.data.selectionName : null;
  selectionCount = typeof pm.data.selectionCount === 'number' ? pm.data.selectionCount : 0;
  renderContext();
});

// ─── Idle-commit prompt actions (spec 004 P4) ─────────────────────────────────
// "Sync now" → ask the relay to send SYNC_REQUEST to the broker (which runs `ui figma
// reconcile --apply`) AND tell main the batch was acknowledged. "Later" just hides it —
// the next documentchange restarts the idle timer. SYNC_RESULT confirms in place.
// A reconcile is the one operation the feed cannot learn about from the wire: it runs
// in the kernel (`ui figma reconcile --apply`, spawned by the broker) and sends no
// command through this relay. Its two ends ARE observable here though — the click and
// the SYNC_RESULT — so the feed logs it from those, keyed by this id.
let reconcileRun: { id: string; at: number } | null = null;

syncNowBtn.addEventListener('click', () => {
  syncMsg.textContent = 'Syncing';
  const at = Date.now();
  reconcileRun = { id: `reconcile_${at}`, at };
  activity = pushActivity(activity, {
    id: reconcileRun.id, tool: 'RECONCILE', label: 'Reconcile · apply',
    pending: true, ok: true, ms: 0, at,
  });
  renderActivity(at);
  try { window.dispatchEvent(new CustomEvent('figma-agent:sync-request')); } catch { /* no DOM events */ }
  // Fix round (finding 2): SYNC_DONE (which resets main's pending-change counter) used to
  // post HERE, on click — before the result is even known. An E_UNBOUND refusal applies
  // NOTHING, so consuming the counter at click-time silently dropped the pending changes'
  // one visible signal. It now posts from the sync-result listener below, once the
  // outcome is known, carrying whether to actually reset.
});

syncLaterBtn.addEventListener('click', () => { syncPrompt.hidden = true; });

window.addEventListener('figma-agent:sync-result', (ev) => {
  const d = (ev as CustomEvent).detail as
    { ok?: boolean; summary?: string; landed?: boolean; code?: string } | undefined;
  // `landed` absent (an older broker) → assume it landed; a present `false` is honoured.
  // `code === 'E_UNBOUND'` (registry-integrity fix round, finding 2): the broker refused
  // instead of guessing a project — renders the bind command, not a pass/fail verdict.
  const unbound = d?.code === 'E_UNBOUND';
  const ok = d?.ok === true;
  const label = syncResultLabel(ok, typeof d?.summary === 'string' ? d.summary : '', d?.landed !== false, unbound);
  syncMsg.textContent = label;
  syncNowBtn.textContent = syncNowLabel(unbound);
  // The prompt line normally auto-dismisses in 4s; the feed row is the durable record. It
  // repeats the SAME sentence syncResultLabel just made — including "Nothing synced",
  // which a feed that only said "done" would quietly upgrade to a lie.
  if (reconcileRun) {
    const now = Date.now();
    activity = resolveActivity(activity, {
      id: reconcileRun.id, ok, ms: now - reconcileRun.at, result: `→ ${label}`,
    });
    reconcileRun = null;
    renderActivity(now);
  }
  // Closing review round, defect #2: ONLY a genuine success may clear main's pending-change
  // counter — a real reconcile failure or "already running" applied nothing either, so
  // clearing it there was just as dishonest as clearing it on an unbound refusal. Every
  // failure (E_UNBOUND included) keeps both the counter and this prompt, so retry stays
  // possible; only a success auto-dismisses.
  const commit = shouldClearPendingCount(ok);
  parent.postMessage({ pluginMessage: { type: 'SYNC_DONE', commit } }, '*');
  syncPrompt.hidden = false;
  if (commit) setTimeout(() => { syncPrompt.hidden = true; }, 4000);
});

versionEl.textContent = `v0.1.0 · ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}`;

// A 1s heartbeat keeps the live ages (uptime, retry elapsed, time-ago) fresh
// between transitions.
setInterval(render, 1000);
render();

// probeAttempts / PORT_RANGE_START were the old meta-line's "Attempt N" counter — IA v2's
// statusSentence carries no attempt count, so nothing here needs it; the import stays
// only because `figma-agent:conn-state`'s payload shape is still typed against it
// upstream. Referencing it directly would be dead code, so it is deliberately unused.
void PORT_RANGE_START;
void PANEL_HEIGHT;
