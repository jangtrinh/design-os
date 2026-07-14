// `audit-ds` command execute() — the CLI seam that runs AUDIT_DS (via a stub runner) or
// replays a raw capture offline, then turns v2 facts into a report. Covers the --out /
// --timeout contract, the new --sections / --facts / --from-facts flags, and the schema gate.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, type Runner } from '../cli/src/commands/audit-ds.ts';
import { COMMAND_TIMEOUTS } from '../shared/protocol.ts';
import type { AuditDsFacts } from '../shared/audit-types.ts';

const FIXTURE: AuditDsFacts = {
  schema: 2,
  file: { fileName: 'VSF - PCP', pages: [{ id: 'p1', name: 'Page 1' }], skippedPages: [] },
  components: [
    {
      id: 'c1', key: 'k1', name: 'Component 10', type: 'COMPONENT_SET',
      variantCount: 2, variantAxes: {}, pageName: 'Page 1', section: 'Scratch',
      deprecatedData: false, width: 0, height: 0, unboundFills: 0, unboundStrokes: 0, units: [],
    },
    {
      id: 'c2', key: 'k2', name: 'Button', type: 'COMPONENT',
      variantCount: 0, variantAxes: {}, pageName: 'Page 1', section: '01 · Primitives',
      deprecatedData: false, width: 0, height: 0, unboundFills: 0, unboundStrokes: 0, units: [],
    },
  ],
  usage: { byMainId: { c2: 12 }, pagesById: { c2: ['Page 1'] }, unresolved: 0 },
  counts: { masters: 2, sets: 1, standalone: 1, variants: 2, instancesTallied: 12 },
};

/** A runner that asserts the wire command and returns the given facts. */
function stubRunner(facts: AuditDsFacts): Runner {
  return async (cmd) => {
    expect(cmd).toBe('AUDIT_DS');
    return facts;
  };
}

describe('audit-ds — execute()', () => {
  it('with --out writes the FULL report and returns the compact {path,file,summary}', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-ds-'));
    const out = join(dir, 'report.json');
    const res = await execute({ out }, stubRunner(FIXTURE));
    expect(res.path).toBe(out);
    expect(res.file?.fileName).toBe('VSF - PCP');
    expect(res.summary?.total).toBe(2); // both masters are ds (no units ⇒ ds)
    expect(res.report).toBeUndefined();

    expect(existsSync(out)).toBe(true);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.file.fileName).toBe('VSF - PCP');
    expect(written.summary.total).toBe(2);
    expect(written.components.length).toBe(2); // the FULL report lands on disk, not the compact shape
  });

  it('without --out returns the full report inline (detectors ran)', async () => {
    const res = await execute({}, stubRunner(FIXTURE));
    expect(res.path).toBeUndefined();
    expect(res.report?.file.fileName).toBe('VSF - PCP');
    expect(res.report?.components.length).toBe(2);
    const c1 = res.report?.components.find((c) => c.id === 'c1');
    expect(c1?.flags.map((f) => f.id)).toContain('junk-name');
  });

  it('threads an explicit --timeout into the transport opts', async () => {
    const calls: { opts?: { timeoutMs?: number } }[] = [];
    const runner: Runner = async (_cmd, _params, opts) => { calls.push({ opts }); return FIXTURE; };
    await execute({ timeout: 7000 }, runner);
    expect(calls[0]?.opts?.timeoutMs).toBe(7000);
  });

  it('falls back to the AUDIT_DS default timeout when no flag is given', async () => {
    const calls: { opts?: { timeoutMs?: number } }[] = [];
    const runner: Runner = async (_cmd, _params, opts) => { calls.push({ opts }); return FIXTURE; };
    await execute({}, runner);
    expect(calls[0]?.opts?.timeoutMs).toBe(COMMAND_TIMEOUTS.AUDIT_DS);
  });

  it('--sections threads the taxonomy into detect (misfiled fires only when passed)', async () => {
    const without = await execute({}, stubRunner(FIXTURE));
    expect(without.report?.summary.misfiled).toBe(0);
    const withTaxonomy = await execute({ sections: ['01 · Primitives'] }, stubRunner(FIXTURE));
    expect(withTaxonomy.report?.summary.misfiled).toBe(1); // c1's 'Scratch' is off-taxonomy
  });

  it('--facts writes the raw facts JSON (pretty) and reports its path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-ds-'));
    const factsOut = join(dir, 'facts.json');
    const res = await execute({ facts: factsOut }, stubRunner(FIXTURE));
    expect(res.factsPath).toBe(factsOut);
    expect(existsSync(factsOut)).toBe(true);
    const raw = JSON.parse(readFileSync(factsOut, 'utf8'));
    expect(raw.schema).toBe(2);
    expect(raw.components.length).toBe(2); // the RAW facts, not the report
  });

  it('--from-facts detects OFFLINE — the runner is never touched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-ds-'));
    const factsFile = join(dir, 'facts.json');
    writeFileSync(factsFile, JSON.stringify(FIXTURE));
    const throwingRunner: Runner = async () => { throw new Error('runner must not be called on --from-facts'); };
    const res = await execute({ fromFacts: factsFile }, throwingRunner);
    expect(res.report?.summary.total).toBe(2);
  });

  it('rejects stale/v1 facts with E_PLUGIN_STALE on BOTH the transport and from-facts paths', async () => {
    // v1-shaped facts: no `schema` field at all.
    const v1Facts = { file: FIXTURE.file, components: [], usage: FIXTURE.usage, counts: {} } as unknown as AuditDsFacts;
    await expect(execute({}, stubRunner(v1Facts))).rejects.toMatchObject({ code: 'E_PLUGIN_STALE' });

    const dir = mkdtempSync(join(tmpdir(), 'audit-ds-'));
    const f = join(dir, 'v1.json');
    writeFileSync(f, JSON.stringify(v1Facts));
    await expect(
      execute({ fromFacts: f }, async () => { throw new Error('runner must not be called'); }),
    ).rejects.toMatchObject({ code: 'E_PLUGIN_STALE' });
  });
});
