import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintDiagram } from '../src/core/diagram-lint.js';
import { lintChart } from '../src/core/chart-lint.js';

/**
 * The golden corpus: one worked artifact per grammar.
 *
 * These are the calibration reference for what a grammar's output should look like, so
 * they are held to the same gate a delivered artifact is. A corpus that cannot pass its
 * own linter is a defect in the scaffold or the grammar, never a corpus exception.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIAGRAM_DIR = join(REPO_ROOT, 'examples', 'diagrams');
const CHART_DIR = join(REPO_ROOT, 'examples', 'charts');
const GRAMMAR_DIR = join(REPO_ROOT, 'knowledge', 'diagram-grammars');
const CHART_GRAMMAR_DIR = join(REPO_ROOT, 'knowledge', 'chart-grammars');

function htmlFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')) : [];
}

const diagramExamples = htmlFiles(DIAGRAM_DIR);
const chartExamples = htmlFiles(CHART_DIR);

describe('diagram corpus', () => {
  it('covers every diagram grammar', () => {
    const grammars = readdirSync(GRAMMAR_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
    const covered = diagramExamples.map((f) => f.replace(/\.html$/, ''));
    expect([...grammars].sort().filter((g) => !covered.includes(g))).toEqual([]);
  });

  it.each(diagramExamples)('%s passes ui diagram lint', (name) => {
    const result = lintDiagram(readFileSync(join(DIAGRAM_DIR, name), 'utf8'));
    expect(result.findings).toEqual([]);
  });

  it.each(diagramExamples)('%s declares the grammar its filename claims', (name) => {
    const html = readFileSync(join(DIAGRAM_DIR, name), 'utf8');
    expect(html).toContain(`data-diagram-grammar="${name.replace(/\.html$/, '')}"`);
  });
});

describe('chart corpus', () => {
  it('covers every chart grammar', () => {
    const grammars = readdirSync(CHART_GRAMMAR_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
    const covered = chartExamples.map((f) => f.replace(/\.html$/, ''));
    expect([...grammars].sort().filter((g) => !covered.includes(g))).toEqual([]);
  });

  it.each(chartExamples)('%s passes ui chart lint', (name) => {
    const result = lintChart(readFileSync(join(CHART_DIR, name), 'utf8'));
    expect(result.findings).toEqual([]);
  });

  it.each(chartExamples)('%s declares the grammar its filename claims', (name) => {
    const html = readFileSync(join(CHART_DIR, name), 'utf8');
    expect(html).toContain(`data-chart-grammar="${name.replace(/\.html$/, '')}"`);
  });
});

describe('corpus is self-contained and token-bound', () => {
  const all = [
    ...diagramExamples.map((n) => join(DIAGRAM_DIR, n)),
    ...chartExamples.map((n) => join(CHART_DIR, n)),
  ];

  it.each(all)('%s makes no network request', (path) => {
    const html = readFileSync(path, 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis|cdn\.|https?:\/\/(?!www\.w3\.org)/);
  });

  it.each(all)('%s carries a dark-theme definition, not just a light one', (path) => {
    const html = readFileSync(path, 'utf8');
    expect(html).toMatch(/\[data-theme="dark"\]|prefers-color-scheme:\s*dark/);
  });
});
