// Panel view-model — the pure layer under the DOM controller (panel-ui.ts).
// IA v2: statusSentence (Block 1) replaces stateView/troubleshootHint/compactMeta;
// fileNote (Block 2) is new. The activity feed's own model lives in activity-feed.ts,
// and its SENTENCE mapping in activity-sentence.ts — see their own test files.
import { describe, it, expect } from 'vitest';
import {
  statusSentence, formatAge, showOnboarding, fileNote, PANEL_WIDTH, PANEL_HEIGHT,
  syncPromptLabel, syncResultLabel, syncNowLabel, shouldClearPendingCount,
} from '../plugin/src/ui/panel-model.ts';

describe('statusSentence — Block 1: the problem and the next action, six branches', () => {
  // Owner addendum 2026-07-30: success states are minimal (the tone dot already signals
  // state); problem states keep problem + next action, trimmed to the shortest honest
  // sentence, no filler words, no text glyphs (the … ban covers "Connecting…" too).
  it('connected — success tone, minimal (the dot already signals it)', () => {
    expect(statusSentence('connected', 0, true)).toEqual({
      text: 'Connected', tone: 'success',
    });
  });
  it('probing under 10s — "looking", warning tone', () => {
    expect(statusSentence('probing', 9_000, false)).toEqual({
      text: 'Looking for the broker', tone: 'warning',
    });
  });
  it('probing at/after 10s — names the fix, trimmed (no "in a terminal" filler)', () => {
    expect(statusSentence('probing', 10_000, false)).toEqual({
      text: 'Broker not running — run figma-agent status.', tone: 'warning',
    });
  });
  it('handshake — info tone, no ellipsis', () => {
    expect(statusSentence('handshake', 0, false)).toEqual({ text: 'Connecting', tone: 'info' });
  });
  it('disconnected, never connected — first-run wait, muted, trimmed', () => {
    expect(statusSentence('disconnected', 0, false)).toEqual({
      text: 'Not connected — your first command starts the broker.', tone: 'muted',
    });
  });
  it('disconnected, was connected — names the drop, muted, trimmed', () => {
    expect(statusSentence('disconnected', 0, true)).toEqual({
      text: 'Connection lost — reconnecting.', tone: 'muted',
    });
  });
});

describe('formatAge', () => {
  it('formatAge steps just-now → seconds → minutes → hours', () => {
    expect(formatAge(0)).toBe('just now');
    expect(formatAge(8_000)).toBe('8s');
    expect(formatAge(125_000)).toBe('2m 05s');
    expect(formatAge(3_780_000)).toBe('1h 03m');
    expect(formatAge(-5)).toBe('—');
    expect(formatAge(Number.NaN)).toBe('—');
  });
});

describe('showOnboarding — first-run only (survives the IA v2 cut, priority-1 content)', () => {
  it('shows while waiting and never connected', () => {
    expect(showOnboarding('disconnected', false)).toBe(true);
    expect(showOnboarding('probing', false)).toBe(true);
  });
  it('hides once connected, forever', () => {
    expect(showOnboarding('connected', true)).toBe(false);
    expect(showOnboarding('disconnected', true)).toBe(false); // a later drop still hides it
    expect(showOnboarding('handshake', false)).toBe(false);
  });
});

describe('fileNote — Block 2: honest answer to "which file will my command hit?"', () => {
  it('single file, this one is the target → "command target"', () => {
    expect(fileNote(1, true)).toBe('command target');
  });
  it('single file, not the target → empty (cannot happen today; never guess)', () => {
    expect(fileNote(1, false)).toBe('');
  });
  it('multiple files, this one is the target → target + peer count', () => {
    expect(fileNote(3, true)).toBe('command target · 2 other files');
    expect(fileNote(2, true)).toBe('command target · 1 other file');
  });
  it('multiple files, another is the target → says where commands go', () => {
    expect(fileNote(3, false)).toBe('2 other files — commands go elsewhere');
    expect(fileNote(2, false)).toBe('1 other file — commands go elsewhere');
  });
});

describe('panel geometry (IA v2 — one opening size, no compact/expanded split)', () => {
  it('the iframe opens 300×420', () => {
    expect(PANEL_WIDTH).toBe(300);
    expect(PANEL_HEIGHT).toBe(420);
  });
});

describe('idle-commit prompt labels (spec 004 P4)', () => {
  it('syncPromptLabel pluralizes and floors count at 1', () => {
    expect(syncPromptLabel(1)).toBe('1 change ready');
    expect(syncPromptLabel(3)).toBe('3 changes ready');
    expect(syncPromptLabel(0)).toBe('1 change ready'); // never shows "0 changes"
    expect(syncPromptLabel(2.9)).toBe('2 changes ready'); // floored
    expect(syncPromptLabel(Number.NaN)).toBe('1 change ready');
  });
  it('syncResultLabel marks success and surfaces the failure reason — no glyph, the icon carries the mark', () => {
    expect(syncResultLabel(true, 'synced — 2 updated, 1 deprecated, 0 pending'))
      .toBe('Synced — synced — 2 updated, 1 deprecated, 0 pending');
    expect(syncResultLabel(false, 'ui not runnable')).toBe('Sync failed — ui not runnable');
    expect(syncResultLabel(true, '')).toBe('Synced — done'); // empty summary → sane default
    expect(syncResultLabel(false, '   ')).toBe('Sync failed — failed');
  });

  it('syncResultLabel — unbound renders the bind command bare, not under a failure verdict', () => {
    const summary = 'No project bound for "VSF - PCP" — run: figma-agent bind --file "VSF - PCP" --dir <project>';
    expect(syncResultLabel(false, summary, true, true)).toBe(summary);
    // ok=false is what the broker actually sends for an unbound refusal — proves `unbound`
    // takes precedence over the "Sync failed" branch rather than being unreachable dead code.
    expect(syncResultLabel(false, summary, true, true)).not.toContain('Sync failed');
  });

  it('syncNowLabel — swaps to the bind hint on E_UNBOUND, reverts once bound (fix round, finding 2)', () => {
    expect(syncNowLabel(false)).toBe('Sync now');
    expect(syncNowLabel(true)).toBe('Bind & retry');
    expect(syncNowLabel(true)).not.toBe(syncNowLabel(false)); // the state machine's two branches
  });

  it('shouldClearPendingCount — ONLY a genuine success clears the pending counter (closing round, defect #2)', () => {
    expect(shouldClearPendingCount(true)).toBe(true);
    // false covers BOTH a real reconcile failure AND an E_UNBOUND refusal — either way,
    // nothing applied, so retry must stay possible (the bug: it used to clear on any
    // non-unbound outcome, including "a sync is already running").
    expect(shouldClearPendingCount(false)).toBe(false);
  });
});
