// plugin/src/main/edit-actor.ts — command-log subtraction. Post-review (Codex P1,
// round 1): the busy signal is a COUNTER (concurrent dispatches are real), an undeclared
// `created` while busy is `ambiguous` — not `agent`. Post-review round 2: `declared` gets
// the SAME per-id expiry lifecycle as `lastAgentAt` (nodeId → expiresAt, `Infinity` while
// active) instead of an add-only union, with its own pruning + cap.
import { describe, it, expect } from 'vitest';
import {
  classifyActor, isDeclaredNow, pruneDeclaredIds, pruneLastAgentAt,
  AGENT_ECHO_MS, DECLARED_IDS_CAP, LAST_AGENT_AT_CAP, type ActorState,
} from '../plugin/src/main/edit-actor.ts';

const state = (over: Partial<ActorState> = {}): ActorState => ({
  activeCount: 0,
  lastDrainAt: 0,
  declared: new Map(),
  lastAgentAt: new Map(),
  ...over,
});

describe('classifyActor — rule 1: busy + declared → agent', () => {
  it('a declared (Infinity) node updated while busy is agent', () => {
    const s = state({ activeCount: 1, declared: new Map([['n1', Infinity]]) });
    expect(classifyActor('n1', 'updated', 500, s)).toBe('agent');
  });

  it('a declared node deleted while busy is agent', () => {
    const s = state({ activeCount: 1, declared: new Map([['n1', Infinity]]) });
    expect(classifyActor('n1', 'deleted', 500, s)).toBe('agent');
  });

  it('a declared node CREATED while busy is agent too (declared still wins)', () => {
    const s = state({ activeCount: 1, declared: new Map([['n1', Infinity]]) });
    expect(classifyActor('n1', 'created', 500, s)).toBe('agent');
  });

  it('a declared node whose finite expiry is still in the future is agent (post-finish echo)', () => {
    const now = 1_000;
    const s = state({ activeCount: 1, declared: new Map([['n1', now + 5_000]]) });
    expect(classifyActor('n1', 'updated', now, s)).toBe('agent');
  });
});

describe('classifyActor — rule 2: busy + undeclared → ambiguous (incl. undeclared creates)', () => {
  it('an undeclared UPDATE while busy is ambiguous — EXEC_JS declares nothing', () => {
    const s = state({ activeCount: 1, declared: new Map() });
    expect(classifyActor('untracked-node', 'updated', 500, s)).toBe('ambiguous');
  });

  it('an undeclared DELETE while busy is ambiguous, not owner', () => {
    const s = state({ activeCount: 1, declared: new Map([['other-node', Infinity]]) });
    expect(classifyActor('untracked-node', 'deleted', 500, s)).toBe('ambiguous');
  });

  it('post-review correction: an UNDECLARED created node while busy is ambiguous, NOT agent', () => {
    const s = state({ activeCount: 1, declared: new Map() });
    expect(classifyActor('brand-new-id', 'created', 500, s)).toBe('ambiguous');
  });

  it('a node whose declaration has already EXPIRED is undeclared, even while busy (another request)', () => {
    const now = 20_000;
    const s = state({ activeCount: 1, declared: new Map([['n1', now - 1]]) }); // expired 1ms ago
    expect(classifyActor('n1', 'updated', now, s)).toBe('ambiguous');
  });
});

describe('classifyActor — rule 3: not busy but within the echo window → ambiguous', () => {
  it('an agent touch just under AGENT_ECHO_MS ago is ambiguous', () => {
    const now = 50_000;
    const s = state({ lastAgentAt: new Map([['n1', now - (AGENT_ECHO_MS - 1)]]) });
    expect(classifyActor('n1', 'updated', now, s)).toBe('ambiguous');
  });

  it('an agent touch exactly AGENT_ECHO_MS ago is no longer within the window (owner)', () => {
    const now = 50_000;
    const s = state({ lastAgentAt: new Map([['n1', now - AGENT_ECHO_MS]]) });
    expect(classifyActor('n1', 'updated', now, s)).toBe('owner');
  });
});

describe('classifyActor — rule 4: otherwise → owner', () => {
  it('no busy window and no recent agent touch is owner', () => {
    const s = state();
    expect(classifyActor('never-touched', 'updated', 999_999, s)).toBe('owner');
  });

  it('an agent touch AGENT_ECHO_MS + 1 ms ago is owner', () => {
    const now = 50_000;
    const s = state({ lastAgentAt: new Map([['n1', now - (AGENT_ECHO_MS + 1)]]) });
    expect(classifyActor('n1', 'updated', now, s)).toBe('owner');
  });

  it('a node with no lastAgentAt entry at all is owner', () => {
    const s = state({ lastAgentAt: new Map([['other-node', 0]]) });
    expect(classifyActor('n1', 'updated', 100, s)).toBe('owner');
  });
});

describe('classifyActor — the busy/trailing-window boundary', () => {
  it('activeCount > 0 is busy regardless of lastDrainAt', () => {
    const s = state({ activeCount: 1, lastDrainAt: 0, declared: new Map() });
    expect(classifyActor('n1', 'updated', 1, s)).toBe('ambiguous');
  });

  it('activeCount === 0 but within the trailing window since the last drain is still busy', () => {
    const now = 50_000;
    const s = state({ activeCount: 0, lastDrainAt: now - (AGENT_ECHO_MS - 1), declared: new Map() });
    expect(classifyActor('n1', 'updated', now, s)).toBe('ambiguous');
  });

  it('exactly AT the trailing window boundary is no longer busy', () => {
    const now = 50_000;
    const s = state({ activeCount: 0, lastDrainAt: now - AGENT_ECHO_MS, declared: new Map() });
    expect(classifyActor('n1', 'updated', now, s)).toBe('owner');
  });

  it('lastDrainAt === 0 (never drained, i.e. idle since boot) does not count as a trailing window', () => {
    const s = state({ activeCount: 0, lastDrainAt: 0 });
    expect(classifyActor('n1', 'updated', 999_999, s)).toBe('owner');
  });
});

describe('classifyActor — two interleaved dispatches (round 1 finding)', () => {
  it('request B declared while A is still in flight does not clobber A\'s declared id', () => {
    const s = state({ activeCount: 2, declared: new Map([['n-a', Infinity], ['n-b', Infinity]]) });
    expect(classifyActor('n-a', 'updated', 500, s)).toBe('agent');
    expect(classifyActor('n-b', 'updated', 500, s)).toBe('agent');
    expect(classifyActor('n-c', 'updated', 500, s)).toBe('ambiguous');
  });

  it('A finishes while B is still in flight: activeCount drops to 1, still busy, both ids intact', () => {
    const s = state({ activeCount: 1, lastDrainAt: 0, declared: new Map([['n-a', Infinity], ['n-b', Infinity]]) });
    expect(classifyActor('n-a', 'updated', 500, s)).toBe('agent');
    expect(classifyActor('n-b', 'updated', 500, s)).toBe('agent');
  });
});

describe('isDeclaredNow', () => {
  it('true for an Infinity (still-active) entry at any `now`', () => {
    expect(isDeclaredNow(new Map([['n1', Infinity]]), 'n1', 999_999_999)).toBe(true);
  });
  it('true for a finite entry strictly in the future', () => {
    expect(isDeclaredNow(new Map([['n1', 100]]), 'n1', 99)).toBe(true);
  });
  it('false for a finite entry at or past its expiry', () => {
    expect(isDeclaredNow(new Map([['n1', 100]]), 'n1', 100)).toBe(false);
    expect(isDeclaredNow(new Map([['n1', 100]]), 'n1', 101)).toBe(false);
  });
  it('false for an id with no entry at all', () => {
    expect(isDeclaredNow(new Map(), 'n1', 0)).toBe(false);
  });
});

// ─── Round 2 (Codex P1 verify): declaredIds lifecycle ────────────────────────────────

describe('post-review round 2 — declaredIds gets the SAME lifecycle as lastAgentAt', () => {
  it('(a) an id declared by a finished request stops matching after its echo window, even while ANOTHER request stays busy', () => {
    const now = 100_000;
    // Request A finished long enough ago that its stamped expiry has already passed;
    // request B is still active (n-b stays Infinity).
    const finishAtA = now - (AGENT_ECHO_MS + 1_000);
    const expiresAtA = finishAtA + AGENT_ECHO_MS; // = now - 1000: already expired
    const s = state({
      activeCount: 1, // B still in flight
      declared: new Map([['n-a', expiresAtA], ['n-b', Infinity]]),
    });
    expect(isDeclaredNow(s.declared, 'n-a', now)).toBe(false);
    // Still busy overall (B is active), but n-a is no longer declared → ambiguous, not agent.
    expect(classifyActor('n-a', 'updated', now, s)).toBe('ambiguous');
    expect(classifyActor('n-b', 'updated', now, s)).toBe('agent');
  });

  it('(a cont.) a MUCH later owner edit on A\'s old node is never mislabelled agent', () => {
    const now = 500_000;
    const longFinished = now - 60_000; // a full minute ago, way past any echo window
    const s = state({
      activeCount: 0, lastDrainAt: longFinished,
      declared: new Map([['n-a', longFinished + AGENT_ECHO_MS]]),
    });
    expect(classifyActor('n-a', 'updated', now, s)).toBe('owner');
  });

  it('(b) a continuous-traffic loop never exceeds DECLARED_IDS_CAP', () => {
    const declared = new Map<string, number>();
    const now = 0;
    for (let i = 0; i < DECLARED_IDS_CAP * 3; i++) {
      declared.set(`node-${i}`, Infinity); // simulate a dispatch declaring a fresh id
      pruneDeclaredIds(declared, now); // called once per documentchange batch
      expect(declared.size).toBeLessThanOrEqual(DECLARED_IDS_CAP);
    }
    expect(declared.size).toBe(DECLARED_IDS_CAP);
  });

  it('(b cont.) pruneDeclaredIds drops only expired finite entries, never Infinity ones', () => {
    const now = 1_000;
    const declared = new Map([
      ['still-active', Infinity],
      ['expired', now - 1],
      ['not-yet-expired', now + 1],
    ]);
    pruneDeclaredIds(declared, now);
    expect(declared.has('still-active')).toBe(true);
    expect(declared.has('expired')).toBe(false);
    expect(declared.has('not-yet-expired')).toBe(true);
  });

  it('(c) a still-active request\'s ids never expire mid-flight regardless of elapsed time', () => {
    const declared = new Map([['n1', Infinity]]);
    // Even a very large `now` (the dispatch has been running a long time) must not expire
    // an Infinity entry via classification OR via pruning.
    expect(isDeclaredNow(declared, 'n1', Number.MAX_SAFE_INTEGER)).toBe(true);
    pruneDeclaredIds(declared, Number.MAX_SAFE_INTEGER);
    expect(declared.has('n1')).toBe(true);
  });

  it('pruneLastAgentAt mirrors the same cap + expiry shape, independently', () => {
    const lastAgentAt = new Map<string, number>();
    const now = 0;
    for (let i = 0; i < LAST_AGENT_AT_CAP * 2; i++) {
      lastAgentAt.set(`node-${i}`, now);
      pruneLastAgentAt(lastAgentAt, now);
      expect(lastAgentAt.size).toBeLessThanOrEqual(LAST_AGENT_AT_CAP);
    }
    // An entry older than the echo window is dropped even without exceeding the cap.
    const small = new Map([['old', now - (AGENT_ECHO_MS + 1)], ['fresh', now]]);
    pruneLastAgentAt(small, now);
    expect(small.has('old')).toBe(false);
    expect(small.has('fresh')).toBe(true);
  });
});
