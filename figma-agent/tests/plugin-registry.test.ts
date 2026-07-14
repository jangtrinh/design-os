// P4 multi-plugin registry — the pure core of the fix for the two-files-evict-each-
// other bug. Covers add/update/remove/cull, the most-recent-active routing choice,
// the FIGMA_AGENT_FILE substring filter, the park→flush decision, and the status
// list shape. Fake sockets are just `{ readyState }`; a mutable clock drives recency.
import { describe, it, expect } from 'vitest';
import { PluginRegistry, WS_OPEN, extractScene, type RegistrySocket } from '../cli/src/transport/plugin-registry.ts';

const CLOSED = 3; // WebSocket.CLOSED
const sock = (open = true): RegistrySocket => ({ readyState: open ? WS_OPEN : CLOSED });

/** A registry with a hand-driven clock so lastSeenAt ordering is deterministic. */
function makeReg() {
  let t = 1_000;
  const reg = new PluginRegistry<RegistrySocket>(() => t);
  return { reg, tick: (ms = 1) => { t += ms; return t; }, at: () => t };
}

describe('register — one slot per instance, NEVER evict another instance', () => {
  it('two distinct instanceIds keep two slots (the whole bug fix)', () => {
    const { reg } = makeReg();
    reg.register(sock(), { instanceId: 'a', fileName: 'VSF - PCP' });
    reg.register(sock(), { instanceId: 'b', fileName: 'Design system' });
    expect(reg.size()).toBe(2);
    expect(reg.statusList().map((p) => p.fileName).sort()).toEqual(['Design system', 'VSF - PCP']);
  });

  it('same instanceId re-hello REPLACES its own slot, preserves connectedAt, supersedes the old socket', () => {
    const { reg, tick, at } = makeReg();
    const first = at();
    const wsA = sock();
    const r1 = reg.register(wsA, { instanceId: 'a', fileName: 'F' });
    expect(r1).toMatchObject({ instanceId: 'a', replaced: false, superseded: null });

    tick(50);
    const wsA2 = sock(); // reconnect: same instance, new socket
    const r2 = reg.register(wsA2, { instanceId: 'a', fileName: 'F' });
    expect(r2.replaced).toBe(true);
    expect(r2.superseded).toBe(wsA); // daemon closes the stale socket
    expect(reg.size()).toBe(1); // still ONE slot
    expect(reg.getByWs(wsA2)?.connectedAt).toBe(first); // connectedAt survives the reconnect
  });

  it('same socket re-hello updates in place (no supersede)', () => {
    const { reg } = makeReg();
    const ws = sock();
    reg.register(ws, { instanceId: 'a', fileName: 'F', page: 'One' });
    const r = reg.register(ws, { instanceId: 'a', fileName: 'F', page: 'Two' });
    expect(r).toMatchObject({ replaced: true, superseded: null });
    expect(reg.getByWs(ws)?.scene.page).toBe('Two');
  });

  it('legacy plugin without instanceId → minted id, same socket reuses it', () => {
    const { reg } = makeReg();
    const ws = sock();
    const r1 = reg.register(ws, { fileName: 'Legacy' });
    expect(r1.instanceId).toMatch(/^p_/); // minted
    const r2 = reg.register(ws, { fileName: 'Legacy', page: 'P2' });
    expect(r2.instanceId).toBe(r1.instanceId); // same socket → same minted id
    expect(r2.replaced).toBe(true);
    expect(reg.size()).toBe(1);
  });
});

describe('updateScene / touch', () => {
  it('updateScene merges a FILE_INFO page change and bumps liveness', () => {
    const { reg, tick } = makeReg();
    const ws = sock();
    reg.register(ws, { instanceId: 'a', fileName: 'F', page: 'One' });
    const later = tick(10);
    expect(reg.updateScene(ws, { fileName: 'F', page: 'Two' })).toBe(true);
    const e = reg.getByWs(ws);
    expect(e?.scene).toMatchObject({ fileName: 'F', page: 'Two' });
    expect(e?.lastSeenAt).toBe(later);
  });
  it('touch returns false for an unknown (CLI) socket and true for a plugin', () => {
    const { reg } = makeReg();
    const plugin = sock();
    reg.register(plugin, { instanceId: 'a', fileName: 'F' });
    expect(reg.touch(plugin)).toBe(true);
    expect(reg.touch(sock())).toBe(false); // never registered
  });
});

describe('removeByWs / cullClosed — each dead socket drops only ITS entry', () => {
  it('removeByWs removes just that entry and returns its id', () => {
    const { reg } = makeReg();
    const a = sock();
    const b = sock();
    reg.register(a, { instanceId: 'a', fileName: 'A' });
    reg.register(b, { instanceId: 'b', fileName: 'B' });
    expect(reg.removeByWs(a)).toBe('a');
    expect(reg.size()).toBe(1);
    expect(reg.removeByWs(a)).toBeNull(); // already gone
    expect(reg.getByWs(b)?.instanceId).toBe('b');
  });

  it('cullClosed removes only sockets that are no longer OPEN', () => {
    const { reg } = makeReg();
    const a = sock();
    const b = sock();
    reg.register(a, { instanceId: 'a', fileName: 'A' });
    reg.register(b, { instanceId: 'b', fileName: 'B' });
    b.readyState = CLOSED; // b's socket died
    expect(reg.cullClosed()).toEqual(['b']);
    expect(reg.size()).toBe(1);
    expect(reg.getByWs(a)?.instanceId).toBe('a');
  });
});

describe('selectTarget — most-recently-active wins; closed sockets ignored', () => {
  it('picks the file with the newest lastActiveAt (the file touched last)', () => {
    const { reg, tick } = makeReg();
    const a = sock();
    const b = sock();
    reg.register(a, { instanceId: 'a', fileName: 'A' });
    reg.register(b, { instanceId: 'b', fileName: 'B' });
    tick(5);
    reg.touchActive(a); // A saw real interaction — now the routing target
    expect(reg.selectTarget()?.instanceId).toBe('a');
    tick(5);
    reg.touchActive(b); // now B
    expect(reg.selectTarget()?.instanceId).toBe('b');
  });

  it('heartbeat touch() does NOT steal the routing target (only real interaction does)', () => {
    const { reg, tick } = makeReg();
    const a = sock();
    const b = sock();
    reg.register(a, { instanceId: 'a', fileName: 'A' });
    reg.register(b, { instanceId: 'b', fileName: 'B' });
    tick(5);
    reg.touchActive(a); // user touched A
    tick(5);
    reg.touch(b); // B only heartbeat-PONGed — liveness bumps, routing must NOT flip
    expect(reg.selectTarget()?.instanceId).toBe('a');
    tick(5);
    reg.updateScene(b, { page: 'Page 2' }); // FILE_INFO = real interaction → now B
    expect(reg.selectTarget()?.instanceId).toBe('b');
  });

  it('never returns a closed socket', () => {
    const { reg, tick } = makeReg();
    const a = sock();
    const b = sock();
    reg.register(a, { instanceId: 'a', fileName: 'A' });
    tick(5);
    reg.register(b, { instanceId: 'b', fileName: 'B' }); // b newer
    b.readyState = CLOSED; // …but dead
    expect(reg.selectTarget()?.instanceId).toBe('a'); // falls to the live one
  });

  it('empty registry → null', () => {
    expect(makeReg().reg.selectTarget()).toBeNull();
  });
});

describe('selectTarget(filter) — FIGMA_AGENT_FILE substring match', () => {
  const seed = () => {
    const { reg, tick } = makeReg();
    reg.register(sock(), { instanceId: 'a', fileName: 'VSF - PCP' });
    tick(5);
    reg.register(sock(), { instanceId: 'b', fileName: 'Design system' });
    return reg;
  };
  it('matches case-insensitively on a substring', () => {
    expect(seed().selectTarget('vsf')?.instanceId).toBe('a');
    expect(seed().selectTarget('DESIGN')?.instanceId).toBe('b');
  });
  it('no candidate matches → null (drives the park / no-match error)', () => {
    expect(seed().selectTarget('nope')).toBeNull();
  });
  it('among multiple matches, still the most-recent', () => {
    const { reg, tick } = makeReg();
    reg.register(sock(), { instanceId: 'a', fileName: 'Shop web' });
    tick(5);
    reg.register(sock(), { instanceId: 'b', fileName: 'Shop mobile' });
    expect(reg.selectTarget('shop')?.instanceId).toBe('b'); // newest of the two matches
  });
  it('a blank/whitespace filter is treated as no filter', () => {
    expect(seed().selectTarget('   ')).not.toBeNull();
  });
});

describe('park → flush decision (what the daemon keys off)', () => {
  it('filter set + only a NON-matching file → no target (park); matching file appears → target (flush)', () => {
    const { reg, tick } = makeReg();
    reg.register(sock(), { instanceId: 'ds', fileName: 'Design system' });
    expect(reg.selectTarget('VSF')).toBeNull(); // request parks — no matching plugin yet
    tick(5);
    reg.register(sock(), { instanceId: 'vsf', fileName: 'VSF - PCP' });
    expect(reg.selectTarget('VSF')?.instanceId).toBe('vsf'); // now flushes to the match
  });
});

describe('statusList — the per-file rows, most-recent first', () => {
  it('emits one live row per file with the documented fields', () => {
    const { reg, tick, at } = makeReg();
    const aConnectedAt = at();
    reg.register(sock(), { instanceId: 'a', fileName: 'A', page: 'P1' });
    const bConnectedAt = tick(20);
    reg.register(sock(), { instanceId: 'b', fileName: 'B', page: 'P2' });
    const list = reg.statusList();
    expect(list[0]).toEqual({
      instanceId: 'b', fileName: 'B', page: 'P2', state: 'connected',
      lastHeartbeatAge: 0, // b was just registered at `now`
      connectedAt: bConnectedAt,
    });
    expect(list[1]).toMatchObject({ instanceId: 'a', fileName: 'A', page: 'P1', connectedAt: aConnectedAt });
    expect(list[1].lastHeartbeatAge).toBe(20); // a last seen 20ms ago
  });

  it('lastHeartbeatAge = now − lastSeenAt; sorted newest-first; excludes closed', () => {
    const { reg, tick } = makeReg();
    const a = sock();
    const b = sock();
    reg.register(a, { instanceId: 'a', fileName: 'A' });
    tick(30);
    reg.register(b, { instanceId: 'b', fileName: 'B' });
    tick(10); // now is 10ms after b's register, 40ms after a's
    const list = reg.statusList();
    expect(list.map((p) => p.instanceId)).toEqual(['b', 'a']); // newest first
    expect(list[0].lastHeartbeatAge).toBe(10);
    expect(list[1].lastHeartbeatAge).toBe(40);
    a.readyState = CLOSED;
    expect(reg.statusList().map((p) => p.instanceId)).toEqual(['b']); // closed excluded
  });
});

describe('extractScene — drops protocol keys, keeps scene identity', () => {
  it('strips instanceId/pluginVersion/protocolV, keeps fileName/page/extras', () => {
    expect(extractScene({ instanceId: 'x', pluginVersion: '0.1.0', protocolV: 1, fileName: 'F', page: 'P', user: 'me' }))
      .toEqual({ fileName: 'F', page: 'P', user: 'me' });
  });
  it('tolerates null/undefined', () => {
    expect(extractScene(null)).toEqual({});
    expect(extractScene(undefined)).toEqual({});
  });
});
