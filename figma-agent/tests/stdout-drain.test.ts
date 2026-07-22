// Batch B — the drain guarantee. A real child process runs the ACTUAL printJson and
// writes a multi-megabyte payload to a PIPE; the parent must read complete, parseable
// JSON. Before the fix (`process.exit(0)` right after the write) the unflushed tail was
// dropped while the process still exited 0 — the exact "exit 0 + truncated JSON" bug.
// The child bundles the real cli/src/util/json-out.ts (via esbuild, already a dep), so
// this exercises the shipped code, not a copy.
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const jsonOut = resolve(here, '../cli/src/util/json-out.ts');

async function buildChild(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'fa-drain-'));
  const entry = join(dir, 'entry.ts');
  writeFileSync(
    entry,
    `import { printJson } from ${JSON.stringify(jsonOut)};\n` +
      `const n = Number(process.argv[2]);\n` +
      `printJson({ rows: Array.from({ length: n }, (_, i) => ({ i, label: 'row-' + i })) });\n`,
  );
  const outfile = join(dir, 'entry.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2020',
    outfile,
    logLevel: 'silent',
  });
  return outfile;
}

function runChild(file: string, n: number): Promise<{ code: number | null; stdout: string }> {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [file, String(n)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.on('error', rej);
    child.on('close', (code) => res({ code, stdout }));
  });
}

describe('printJson — large stdout drains fully before exit 0', () => {
  it('a multi-MB payload parses completely and exits 0', async () => {
    const file = await buildChild();
    const N = 50_000; // ~1.5 MB — far past the 64 KB pipe buffer
    const { code, stdout } = await runChild(file, N);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout); // would throw on a truncated tail
    expect(parsed.rows).toHaveLength(N);
    expect(parsed.rows[N - 1]).toEqual({ i: N - 1, label: `row-${N - 1}` });
  }, 30_000);
});
