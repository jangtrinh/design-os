// P4 — the BROKER_HELLO status payload (plugins[] + activePlugin + legacy mirror)
// and the E_NO_PLUGIN message builder. Both are pure functions of a registry, so
// they're tested with fake sockets and a fixed clock — no live broker.
import { describe, it, expect } from 'vitest';
import { PluginRegistry, WS_OPEN, type RegistrySocket } from '../cli/src/transport/plugin-registry.ts';
import { buildBrokerHelloData, noPluginMessage, type BrokerMeta } from '../cli/src/transport/broker-status.ts';
import type { RouteFilter } from '../cli/src/transport/route-filter.ts';

const sock = (): RegistrySocket => ({ readyState: WS_OPEN });
const META: BrokerMeta = { port: 9410, pid: 4242, protocolV: 1, buildMtime: 111, uptimeMs: 5000 };

/** Registry with a fixed clock so lastHeartbeatAge is deterministic. */
function seed(now = 1_000) {
  const clock = () => now;
  const reg = new PluginRegistry<RegistrySocket>(clock);
  return { reg, clock };
}

describe('buildBrokerHelloData — plugins list + activePlugin', () => {
  it('empty registry → no plugins, no active, legacy mirror disconnected', () => {
    const { reg, clock } = seed();
    const d = buildBrokerHelloData(reg, META, null, clock);
    expect(d.plugins).toEqual([]);
    expect(d.activePlugin).toBeNull();
    expect(d.pluginConnected).toBe(false);
    expect(d.pluginState).toBe('disconnected');
    expect(d.lastHeartbeatAge).toBeNull();
    expect(d.pluginInfo).toBeNull();
    expect(d).toMatchObject({ port: 9410, pid: 4242, protocolV: 1, uptimeMs: 5000 });
  });

  it('two files → both listed; activePlugin + legacy mirror track the most-recent', () => {
    let t = 1_000;
    const reg = new PluginRegistry<RegistrySocket>(() => t);
    reg.register(sock(), { instanceId: 'a', fileName: 'VSF - PCP', page: 'Home' });
    t = 1_050;
    reg.register(sock(), { instanceId: 'b', fileName: 'Design system', page: 'Buttons' });
    t = 1_060; // read 10ms after b, 60ms after a
    const d = buildBrokerHelloData(reg, META, null, () => t);
    expect((d.plugins as unknown[]).length).toBe(2);
    expect(d.activePlugin).toBe('Design system'); // b is newer
    // ── legacy mirror reflects the ACTIVE plugin (b) ──
    expect(d.pluginConnected).toBe(true);
    expect(d.pluginState).toBe('connected');
    expect(d.lastHeartbeatAge).toBe(10);
    expect(d.pluginInfo).toMatchObject({ fileName: 'Design system', page: 'Buttons' });
  });

  it('with a filter: active + mirror follow the FILTERED target, list still shows all', () => {
    let t = 1_000;
    const reg = new PluginRegistry<RegistrySocket>(() => t);
    reg.register(sock(), { instanceId: 'a', fileName: 'VSF - PCP' });
    t = 1_050;
    reg.register(sock(), { instanceId: 'b', fileName: 'Design system' }); // most-recent overall
    const d = buildBrokerHelloData(reg, META, 'vsf', () => t);
    expect(d.activePlugin).toBe('VSF - PCP'); // filter pins to A even though B is newer
    expect(d.pluginConnected).toBe(true);
    expect((d.plugins as unknown[]).length).toBe(2); // list is unfiltered
  });

  it('filter matching nothing → mirror disconnected, but files still listed', () => {
    const { reg, clock } = seed();
    reg.register(sock(), { instanceId: 'a', fileName: 'Design system' });
    const d = buildBrokerHelloData(reg, META, 'vsf', clock);
    expect(d.activePlugin).toBeNull();
    expect(d.pluginConnected).toBe(false); // no routable target under the filter
    expect((d.plugins as unknown[]).length).toBe(1); // …but the connected file is still visible
  });
});

describe('buildBrokerHelloData — jobStatusFor (concurrency & jobs, backlog 1.1+2.6+4.3)', () => {
  it('omitting jobStatusFor keeps plugins[] byte-identical to before this wave (no runningJob/queueDepth keys)', () => {
    const { reg, clock } = seed();
    reg.register(sock(), { instanceId: 'a', fileName: 'VSF - PCP' });
    const d = buildBrokerHelloData(reg, META, null, clock);
    const [row] = d.plugins as Array<Record<string, unknown>>;
    expect('runningJob' in row).toBe(false);
    expect('queueDepth' in row).toBe(false);
  });

  it('given jobStatusFor, each row gets runningJob/queueDepth keyed by ITS OWN fileSlug', () => {
    const { reg, clock } = seed();
    reg.register(sock(), { instanceId: 'a', fileName: 'VSF - PCP' });
    reg.register(sock(), { instanceId: 'b', fileName: 'Design system' });
    const jobStatusFor = (slug: string) =>
      slug.includes('vsf')
        ? { runningJob: { jobId: 'j_1_1', state: 'running' as const, cmd: 'EXEC_JS', fileSlug: slug }, queueDepth: 2 }
        : { runningJob: null, queueDepth: 0 };
    const d = buildBrokerHelloData(reg, META, null, clock, jobStatusFor);
    const rows = d.plugins as Array<{ fileName: string | null; runningJob: unknown; queueDepth: number }>;
    const vsf = rows.find((r) => r.fileName === 'VSF - PCP')!;
    const ds = rows.find((r) => r.fileName === 'Design system')!;
    expect(vsf.runningJob).toMatchObject({ jobId: 'j_1_1' });
    expect(vsf.queueDepth).toBe(2);
    // An idle file reports null + 0 explicitly — never an omitted key.
    expect(ds.runningJob).toBeNull();
    expect(ds.queueDepth).toBe(0);
  });
});

describe('noPluginMessage', () => {
  const envFilter = (value: string): RouteFilter => ({ value, exact: false, source: 'env' });
  const flagFilter = (value: string): RouteFilter => ({ value, exact: true, source: 'flag' });

  it('no filter → the plain nudge', () => {
    const { reg } = seed();
    expect(noPluginMessage(reg, null)).toBe('no Figma plugin connected — open the figma-agent plugin in Figma');
  });

  it('env filter + other files connected → names FIGMA_AGENT_FILE and lists the files', () => {
    const { reg } = seed();
    reg.register(sock(), { instanceId: 'a', fileName: 'Design system' });
    reg.register(sock(), { instanceId: 'b', fileName: 'Marketing site' });
    const msg = noPluginMessage(reg, envFilter('vsf'));
    expect(msg).toContain('FIGMA_AGENT_FILE="vsf"');
    expect(msg).toContain('Design system');
    expect(msg).toContain('Marketing site');
    expect(msg).toContain('unset FIGMA_AGENT_FILE');
  });

  it('--file filter + other files connected → names --file, lists the files, suggests dropping --file', () => {
    const { reg } = seed();
    reg.register(sock(), { instanceId: 'a', fileName: 'Design system' });
    reg.register(sock(), { instanceId: 'b', fileName: 'Marketing site' });
    const msg = noPluginMessage(reg, flagFilter('Definitely Not A File'));
    expect(msg).toContain('--file "Definitely Not A File"');
    expect(msg).toContain('Design system');
    expect(msg).toContain('Marketing site');
    expect(msg).toContain('drop --file');
    expect(msg).not.toContain('FIGMA_AGENT_FILE');
  });

  it('filter but nothing connected → falls back to the plain nudge', () => {
    const { reg } = seed();
    expect(noPluginMessage(reg, envFilter('vsf'))).toBe('no Figma plugin connected — open the figma-agent plugin in Figma');
  });
});
