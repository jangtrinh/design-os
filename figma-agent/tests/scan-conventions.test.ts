// C7 part B — `figma-agent scan-conventions` convention-DNA walk.
// The walk itself is DOM-bound (LIVE-E2E, proven this session against a live
// plugin); here we unit-test the pure walk-code construction, the EXEC_JS wiring
// (stubbed runner), and the truncation / missing reporting + --out file write.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildWalkCode,
  scanConventions,
  execute,
  DEFAULT_BUDGET,
  type Runner,
  type SectionDNA,
} from '../cli/src/commands/scan-conventions.ts';

/** A stub runner that returns a fixed EXEC_JS `{result}` and records its calls. */
function stubRunner(result: unknown, calls?: Array<{ cmd: string; params: unknown }>): Runner {
  return async (cmd, params) => {
    calls?.push({ cmd, params });
    return { result, console: [], ms: 1 };
  };
}

const DNA: SectionDNA[] = [
  {
    section: 'IAM',
    screens: 8,
    nodesWalked: 14000,
    truncated: true,
    fills: { bound: 90, raw: 10, tokenizedPct: 90 },
    layout: { autolayoutFrames: 120, rawFrames: 8 },
    topComponents: { Button: 12, Input: 6 },
    radiusHist: { '8': 30, '12': 5 },
    spacingHist: { '16': 40, '7': 2 },
    fonts: { Inter: 200 },
    sampleScreens: [{ name: 'Login', layout: 'VERTICAL', gap: 16 }],
  },
  { id: '9:99', missing: true },
];

describe('buildWalkCode — pure walk construction', () => {
  it('embeds the section ids and the per-section budget', () => {
    const code = buildWalkCode(['4296:1', '5784:2'], 9000);
    expect(code).toContain('"4296:1"');
    expect(code).toContain('"5784:2"');
    expect(code).toContain('PER_SECTION_BUDGET = 9000');
  });

  it('aggregates rather than serialising nodes (distil-not-dump)', () => {
    const code = buildWalkCode(['1:1'], DEFAULT_BUDGET);
    // Aggregate fields the plugin computes and returns compactly.
    for (const field of ['tokenizedPct', 'radiusHist', 'spacingHist', 'autolayoutFrames', 'topComponents']) {
      expect(code).toContain(field);
    }
    // It walks with a budget guard and reports truncation, never dumps a tree.
    expect(code).toContain('visited < PER_SECTION_BUDGET');
    expect(code).toContain('truncated: visited >= PER_SECTION_BUDGET');
  });
});

describe('scanConventions — EXEC_JS wiring (stubbed runner)', () => {
  it('issues one EXEC_JS carrying the walk code and returns the DNA array', async () => {
    const calls: Array<{ cmd: string; params: unknown }> = [];
    const dna = await scanConventions(['1:1'], DEFAULT_BUDGET, stubRunner(DNA, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe('EXEC_JS');
    expect((calls[0]?.params as { code: string }).code).toContain('SECTIONS = ["1:1"]');
    expect(dna).toEqual(DNA);
  });

  it('rejects a walk that did not return an array', async () => {
    await expect(scanConventions(['1:1'], DEFAULT_BUDGET, stubRunner({ oops: true }))).rejects.toThrow(
      /did not return a section array/,
    );
  });
});

describe('execute — reporting + --out write', () => {
  it('writes usage-dna.json and reports truncation + missing (no silent cap)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'conv-'));
    const outPath = join(dir, 'usage-dna.json');
    const res = await execute(['4296:1', '9:99'], DEFAULT_BUDGET, outPath, stubRunner(DNA));
    expect(res.path).toBe(outPath);
    expect(res.sections).toBe(2);
    expect(res.truncated).toEqual(['IAM']); // the section that hit the budget, by name
    expect(res.missing).toEqual(['9:99']); // the unresolved id, surfaced not dropped
    const written = JSON.parse(readFileSync(outPath, 'utf8')) as SectionDNA[];
    expect(written).toEqual(DNA);
  });

  it('returns the DNA inline when no --out is given', async () => {
    const res = await execute(['4296:1'], DEFAULT_BUDGET, undefined, stubRunner(DNA));
    expect(res.path).toBeUndefined();
    expect(res.dna).toEqual(DNA);
  });

  it('requires at least one section id', async () => {
    await expect(execute([], DEFAULT_BUDGET, undefined, stubRunner(DNA))).rejects.toThrow(
      /at least one <sectionId>/,
    );
  });

  it('rejects a non-positive budget', async () => {
    await expect(execute(['1:1'], 0, undefined, stubRunner(DNA))).rejects.toThrow(/--budget/);
  });
});
