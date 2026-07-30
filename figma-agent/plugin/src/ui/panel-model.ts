// Pure view-model for the panel — no DOM, no WebSocket, no Figma API. Everything the
// panel decides (which sentence/tone per connection state, the file/peers note, onboarding
// gating, age formatting) lives here so it is unit-testable without a DOM. The activity
// feed's own model lives in activity-feed.ts; the feed's SENTENCE mapping lives in
// activity-sentence.ts — this file owns only the connection chrome (IA v2 Block 1) and
// the file/peers note (Block 2).
import type { ConnectionState } from '../../../shared/protocol';

/** Which token pair the status dot renders with (maps to --fga-tone-<tone>). */
export type Tone = 'success' | 'warning' | 'info' | 'muted';

/** Age (ms) at which a still-probing connection stops saying "looking" and names the fix. */
const PROBE_TROUBLESHOOT_MS = 10_000;

/**
 * Block 1's ONE sentence: the problem, and the next action, in plain language — never a
 * pill/label/meta split, never an error code, never a port number. Replaces `stateView` +
 * `troubleshootHint` + `compactMeta` (all three used to split what is now one sentence).
 */
export function statusSentence(
  state: ConnectionState,
  ageMs: number,
  hadConnection: boolean,
): { text: string; tone: Tone } {
  switch (state) {
    case 'connected':
      // Owner addendum 2026-07-30: success states are minimal — the tone dot already
      // signals "connected", so the sentence doesn't need to re-explain what that means.
      return { text: 'Connected', tone: 'success' };
    case 'probing':
      return ageMs >= PROBE_TROUBLESHOOT_MS
        // Problem states keep problem + next action, trimmed to the shortest honest
        // sentence — "in a terminal" was filler (the command IS the terminal instruction).
        ? { text: 'Broker not running — run figma-agent status.', tone: 'warning' }
        : { text: 'Looking for the broker', tone: 'warning' };
    case 'handshake':
      return { text: 'Connecting', tone: 'info' };
    case 'disconnected':
    default:
      return hadConnection
        ? { text: 'Connection lost — reconnecting.', tone: 'muted' }
        : { text: 'Not connected — your first command starts the broker.', tone: 'muted' };
  }
}

/** Compact elapsed label: "just now", "8s", "2m 05s", "1h 03m". Input is ms (≥0). */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/**
 * Whether the onboarding card shows: only before the very first successful
 * connection, and only while we're waiting. Once connected, it never returns.
 * SURVIVES the IA v2 cut (it is priority-1 content, not a debug affordance) —
 * re-parented directly under the status sentence.
 */
export function showOnboarding(state: ConnectionState, hadConnection: boolean): boolean {
  return !hadConnection && (state === 'disconnected' || state === 'probing');
}

// ─── Panel geometry ───────────────────────────────────────────────────────────
// IA v2 drops the compact/expanded split (Details toggle cut) — one opening size.
export const PANEL_WIDTH = 300;
export const PANEL_HEIGHT = 420;

// ─── Block 2 — CONTEXT: the file/peers note ──────────────────────────────────
// The panel's honest answer to "which file will my command hit?" — must never say
// "command target" when the broker's routing target is elsewhere. Driven by the new
// PEERS event (broker → every connected plugin, count + isActiveTarget).
export function fileNote(count: number, isActiveTarget: boolean): string {
  if (count <= 1) return isActiveTarget ? 'command target' : ''; // count<=1 && !isActiveTarget cannot happen today
  const others = count - 1;
  const files = others === 1 ? 'file' : 'files';
  // Wording pass (owner directive 2026-07-30): "connected" is redundant here — the whole
  // Context block only ever shows OTHER connected files — and "commands go to another
  // file" trims to "elsewhere" without losing the honest claim.
  return isActiveTarget
    ? `command target · ${others} other ${files}`
    : `${others} other ${files} — commands go elsewhere`;
}

// ─── Idle-commit sync prompt (spec 004 P4) ────────────────────────────────────
// The panel gains ONE line at the idle point: "N changes ready — Sync now / Later"
// (reuses the existing status surface; no new panel). These pure helpers format that
// line + the post-sync confirmation; panel-ui.ts is the DOM glue that shows/hides it.

/** "3 changes ready" / "1 change ready" — pluralized, count floored at 1 for display. */
export function syncPromptLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  return `${n} change${n === 1 ? '' : 's'} ready`;
}

/**
 * Post-apply confirmation line for the prompt.
 *
 * `landed` is what the kernel actually wrote to the registry (spec 005 P4) — NOT the
 * number of canvas events that were sent. An apply can succeed and change nothing (every
 * new component still pending re-ingest), and calling that "Synced" is the dishonesty
 * this argument exists to kill (Art VIII). The summary itself comes from
 * shared/figma-sync-summary.ts, so the broker and this line make the same claim.
 * No glyph: the icon beside this line (a Phosphor check-circle) carries the mark instead.
 */
export function syncResultLabel(ok: boolean, summary: string, landed = true, unbound = false): string {
  const clean = typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : (ok ? 'done' : 'failed');
  // Registry-integrity phase 01 (5.1), §3: an unbound file refused instead of guessing a
  // project — the summary IS the fix ("run: figma-agent bind ..."), so it renders bare
  // rather than under a "Sync failed" verdict the owner would read as a bug to retry.
  if (unbound) return clean;
  if (!ok) return `Sync failed — ${clean}`;
  return landed ? `Synced — ${clean}` : `Nothing synced — ${clean}`;
}

/**
 * The "Sync now" button's own label. Fix round (finding 2): an E_UNBOUND refusal must not
 * read as "click again to retry the same failing thing" — the button itself says what to
 * do first. A click still fires the identical SYNC_REQUEST regardless of label, so retry
 * works the instant the owner runs `figma-agent bind` and clicks again; the label just
 * stops lying about what that click will do until then.
 */
export function syncNowLabel(unbound: boolean): string {
  return unbound ? 'Bind & retry' : 'Sync now';
}

/**
 * Whether a SYNC_RESULT outcome should clear main.ts's pending-change counter — closing
 * review round, defect #2: it used to clear on ANY non-E_UNBOUND outcome, so a genuine
 * reconcile failure or "a sync is already running" also silently zeroed it, even though
 * nothing applied. Only a true success may clear it; every failure (E_UNBOUND included)
 * must leave the counter and prompt intact so retry stays possible.
 */
export function shouldClearPendingCount(ok: boolean): boolean {
  return ok === true;
}
