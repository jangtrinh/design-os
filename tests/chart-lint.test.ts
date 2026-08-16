import { describe, it, expect } from 'vitest';
import { lintChart } from '../src/core/chart-lint.js';

const DEFAULT_ATTRS: Record<string, string | null> = {
  'data-chart-owned': 'true',
  role: 'img',
  'aria-labelledby': 'ct cd',
  'data-chart-grammar': 'bar',
  'data-reading-order': 'left-to-right, tallest first',
  'data-focal-id': 's1',
  'data-source-kind': 'dataset',
  'data-baseline': 'zero',
};

function attrsToStr(attrs: Record<string, string | null>): string {
  return Object.entries(attrs)
    .filter((e): e is [string, string] => e[1] !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

const BAR_INNER = [
  '<title id="ct">Revenue by region</title>',
  '<desc id="cd">Bars compare revenue across four regions; EMEA leads.</desc>',
  '<g data-chart-element="axis" data-axis-role="category" id="ax"><line x1="0" y1="100" x2="200" y2="100"/></g>',
  '<g data-chart-element="axis" data-axis-role="value" id="ay"><line x1="0" y1="0" x2="0" y2="100"/></g>',
  '<g data-chart-element="series" id="s1" data-series-label="Revenue"><rect width="12" height="40"/></g>',
].join('');

function chartDoc(inner: string, overrides: Record<string, string | null> = {}): string {
  return `<!doctype html><html><body><svg ${attrsToStr({ ...DEFAULT_ATTRS, ...overrides })}>${inner}</svg></body></html>`;
}

const VALID = chartDoc(BAR_INNER);

describe('lintChart - valid artifact', () => {
  it('reports zero findings for a fully valid bar chart', () => {
    expect(lintChart(VALID)).toEqual({ findings: [], errorCount: 0, warningCount: 0 });
  });
});

describe('lintChart - shared SVG contract', () => {
  // These come from svg-artifact.ts; assert they actually reach charts, since a shared
  // module is only shared if both callers really run it.
  it.each([
    ['a missing owned marker', { 'data-chart-owned': null }, 'svg-owned-count'],
    ['a missing role', { role: null }, 'svg-role-img'],
    ['an unresolvable accessible name', { 'aria-labelledby': 'nope missing' }, 'svg-labelledby'],
  ])('flags %s', (_label, overrides, checkId) => {
    const ids = lintChart(chartDoc(BAR_INNER, overrides)).findings.map((f) => f.checkId);
    expect(ids).toContain(checkId);
  });

  it('flags a hardcoded colour in an SVG presentation attribute', () => {
    const inner = BAR_INNER.replace('<rect width="12" height="40"/>', '<rect width="12" height="40" fill="#eb6c36"/>');
    const ids = lintChart(chartDoc(inner)).findings.map((f) => f.checkId);
    expect(ids).toContain('hardcoded-svg-color');
  });

  it('accepts a token colour', () => {
    const inner = BAR_INNER.replace('<rect width="12" height="40"/>', '<rect width="12" height="40" fill="var(--color-chart-1)"/>');
    const ids = lintChart(chartDoc(inner)).findings.map((f) => f.checkId);
    expect(ids).not.toContain('hardcoded-svg-color');
  });

  it('rejects a script even in a chart', () => {
    const ids = lintChart(VALID.replace('</body>', '<script>1</script></body>')).findings.map((f) => f.checkId);
    expect(ids).toContain('no-script');
  });
});

describe('lintChart - grammar and metadata', () => {
  it.each([
    ['an unsupported grammar', { 'data-chart-grammar': 'sankey' }, 'grammar-value'],
    ['an empty reading order', { 'data-reading-order': '  ' }, 'reading-order'],
    ['a dangling focal id', { 'data-focal-id': 'nope' }, 'focal-id'],
    ['an invalid source kind', { 'data-source-kind': 'vibes' }, 'source-kind'],
  ])('flags %s', (_label, overrides, checkId) => {
    const ids = lintChart(chartDoc(BAR_INNER, overrides)).findings.map((f) => f.checkId);
    expect(ids).toContain(checkId);
  });

  it('does not accept a diagram grammar name', () => {
    const ids = lintChart(chartDoc(BAR_INNER, { 'data-chart-grammar': 'architecture' })).findings.map((f) => f.checkId);
    expect(ids).toContain('grammar-value');
  });
});

describe('lintChart - honest baseline', () => {
  // An undeclared baseline lets a reader assume zero, which is exactly what a truncated
  // axis exploits.
  it('requires the baseline to be declared', () => {
    const ids = lintChart(chartDoc(BAR_INNER, { 'data-baseline': null })).findings.map((f) => f.checkId);
    expect(ids).toContain('baseline-declared');
  });

  it.each(['bar', 'pyramid'])('requires a zero baseline for the length-encoded grammar %s', (grammar) => {
    const ids = lintChart(chartDoc(BAR_INNER, { 'data-chart-grammar': grammar, 'data-baseline': '40' })).findings
      .map((f) => f.checkId);
    expect(ids).toContain('zero-baseline-required');
  });

  it.each(['line', 'scatter'])('permits a declared non-zero baseline for the position-encoded grammar %s', (grammar) => {
    const ids = lintChart(chartDoc(BAR_INNER, { 'data-chart-grammar': grammar, 'data-baseline': '40' })).findings
      .map((f) => f.checkId);
    expect(ids).not.toContain('zero-baseline-required');
  });
});

describe('lintChart - series identity and labelling', () => {
  it('requires at least one series for a series grammar', () => {
    const inner = BAR_INNER.replace(/<g data-chart-element="series"[\s\S]*?<\/g>/, '');
    const ids = lintChart(chartDoc(inner)).findings.map((f) => f.checkId);
    expect(ids).toContain('series-present');
  });

  it('rejects a duplicate series id', () => {
    const inner = BAR_INNER + '<g data-chart-element="series" id="s1" data-series-label="Other"><rect width="4" height="8"/></g>';
    const ids = lintChart(chartDoc(inner)).findings.map((f) => f.checkId);
    expect(ids).toContain('series-id');
  });

  // Colour alone is unreadable to a colour-blind or grayscale reader; a label is the
  // statically checkable half of that rule.
  it('requires every series to carry a label', () => {
    const inner = BAR_INNER.replace(' data-series-label="Revenue"', '');
    const ids = lintChart(chartDoc(inner)).findings.map((f) => f.checkId);
    expect(ids).toContain('series-label');
  });

  it('does not demand series for a non-series grammar', () => {
    const inner = [
      '<title id="ct">Set overlap</title>',
      '<desc id="cd">Two sets overlap in the middle region.</desc>',
      '<g data-chart-element="mark" id="s1"><circle r="10"/></g>',
    ].join('');
    const ids = lintChart(chartDoc(inner, { 'data-chart-grammar': 'venn', 'data-baseline': 'not-applicable' })).findings
      .map((f) => f.checkId);
    expect(ids).not.toContain('series-present');
  });
});

describe('lintChart - no dual axis', () => {
  it('rejects two value axes on one frame', () => {
    const inner = BAR_INNER + '<g data-chart-element="axis" data-axis-role="value" id="ay2"><line x1="200" y1="0" x2="200" y2="100"/></g>';
    const ids = lintChart(chartDoc(inner)).findings.map((f) => f.checkId);
    expect(ids).toContain('no-dual-axis');
  });

  it('permits one value axis alongside a category axis', () => {
    const ids = lintChart(VALID).findings.map((f) => f.checkId);
    expect(ids).not.toContain('no-dual-axis');
  });
});
