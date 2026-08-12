import { describe, it, expect } from 'vitest';
import { lintDiagram } from '../src/core/diagram-lint.js';

const DEFAULT_ATTRS: Record<string, string | null> = {
  'data-diagram-owned': 'true',
  role: 'img',
  'aria-labelledby': 'dt dd',
  'data-diagram-grammar': 'architecture',
  'data-reading-order': 'left-to-right, top-to-bottom',
  'data-focal-id': 'n1',
  'data-source-kind': 'brief',
};

function attrsToStr(attrs: Record<string, string | null>): string {
  return Object.entries(attrs)
    .filter((e): e is [string, string] => e[1] !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function svgTag(inner: string, overrides: Record<string, string | null> = {}): string {
  return `<svg ${attrsToStr({ ...DEFAULT_ATTRS, ...overrides })}>${inner}</svg>`;
}

function wrap(body: string): string {
  return `<!doctype html><html><body>${body}</body></html>`;
}

function svgDoc(inner: string, overrides: Record<string, string | null> = {}): string {
  return wrap(svgTag(inner, overrides));
}

const ARCH_INNER = [
  '<title id="dt">Service Architecture</title>',
  '<desc id="dd">Core services and their connections.</desc>',
  '<g data-diagram-element="node" id="n1"><rect width="12" height="12"/></g>',
  '<g data-diagram-element="node" id="n2"><rect width="12" height="12"/></g>',
  '<line data-diagram-element="edge" id="e1" x1="0" y1="0" x2="0" y2="20"/>',
].join('');

const SECOND_ARCH_INNER = [
  '<title id="dt2">Service Architecture 2</title>',
  '<desc id="dd2">Secondary services.</desc>',
  '<g data-diagram-element="node" id="n3"><rect width="12" height="12"/></g>',
  '<line data-diagram-element="edge" id="e2" x1="0" y1="0" x2="0" y2="30"/>',
].join('');

const VALID_HTML = svgDoc(ARCH_INNER);

describe('lintDiagram - valid artifact', () => {
  it('reports zero findings for a fully valid architecture diagram', () => {
    expect(lintDiagram(VALID_HTML)).toEqual({ findings: [], errorCount: 0, warningCount: 0 });
  });

  it('keeps a stylistically unusual but contract-valid diagram clean', () => {
    const quirkyInner = [
      '<title id="dt">Odd Palette Diagram</title>',
      '<desc id="dd">Uses unconventional but valid styling.</desc>',
      '<g data-diagram-element="node" id="n1" style="fill:#ABCDEF"><rect width="12" height="12" rx="6"/></g>',
      '<g data-diagram-element="node" id="n2" class="totally-a-node-honestly"><rect width="8" height="40"/></g>',
      '<line data-diagram-element="edge" id="e1" x1="0" y1="0" x2="0" y2="20" stroke-dasharray="2 2"/>',
      '<line data-diagram-element="edge" id="e2" x1="5" y1="5" x2="5" y2="45" stroke-width="0.5"/>',
    ].join('');
    const result = lintDiagram(svgDoc(quirkyInner));
    expect(result.findings).toEqual([]);
  });
});

describe('lintDiagram - svg ownership and accessibility', () => {
  it('flags zero svg elements marked data-diagram-owned', () => {
    const html = wrap(svgTag(ARCH_INNER, { 'data-diagram-owned': null }));
    const result = lintDiagram(html);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ checkId: 'svg-owned-count', severity: 'error' });
  });

  it('flags more than one svg element marked data-diagram-owned', () => {
    const html = wrap(
      svgTag(ARCH_INNER) +
        svgTag(SECOND_ARCH_INNER, { 'aria-labelledby': 'dt2 dd2', 'data-focal-id': 'n3' }),
    );
    const result = lintDiagram(html);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ checkId: 'svg-owned-count', severity: 'error' });
  });

  it('flags a diagram svg missing role="img"', () => {
    const result = lintDiagram(svgDoc(ARCH_INNER, { role: null }));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ checkId: 'svg-role-img', severity: 'error' });
  });

  it.each([
    ['missing aria-labelledby', { 'aria-labelledby': null }],
    ['dangling aria-labelledby reference', { 'aria-labelledby': 'dt missing-desc' }],
  ])('flags %s', (_label, overrides) => {
    const result = lintDiagram(svgDoc(ARCH_INNER, overrides));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ checkId: 'svg-labelledby', severity: 'error' });
  });
});

describe('lintDiagram - content safety', () => {
  it.each([
    ['an unresolved template placeholder', ARCH_INNER + '<text>{{service_name}}</text>', 'no-placeholder'],
    ['an embedded script tag', ARCH_INNER + '<script>alert(1)</script>', 'no-script'],
    ['an external http href', ARCH_INNER + '<a href="http://example.com/x"><text>link</text></a>', 'no-external-ref'],
    ['an external https image src', ARCH_INNER + '<image href="https://example.com/x.png"/>', 'no-external-ref'],
  ])('flags %s', (_label, inner, checkId) => {
    const result = lintDiagram(svgDoc(inner));
    expect(result.findings.some((f) => f.checkId === checkId && f.severity === 'error')).toBe(true);
  });

  it.each([
    ['a placeholder outside the owned SVG', '<p>{{outside}}</p>', 'no-placeholder'],
    ['a script outside the owned SVG', '<script>run()</script>', 'no-script'],
    ['a relative asset outside the owned SVG', '<img src="./asset.png">', 'no-external-ref'],
  ])('flags %s', (_label, outside, checkId) => {
    const html = VALID_HTML.replace('</body>', `${outside}</body>`);
    expect(lintDiagram(html).findings.some((item) => item.checkId === checkId)).toBe(true);
  });

  it('accepts equivalent single-quoted attributes', () => {
    expect(lintDiagram(VALID_HTML.replaceAll('"', "'")).findings).toEqual([]);
  });

  it('accepts valid unquoted attributes and rejects an unquoted external reference', () => {
    const valid = VALID_HTML
      .replace('data-diagram-owned="true"', 'data-diagram-owned=true')
      .replace('data-diagram-grammar="architecture"', 'data-diagram-grammar=architecture')
      .replace('data-focal-id="n1"', 'data-focal-id=n1')
      .replace('id="n1"', 'id=n1');
    expect(lintDiagram(valid).findings).toEqual([]);
    expect(lintDiagram(valid.replace('</svg>', '<image href=asset.png></svg>')).findings.map((item) => item.checkId)).toContain('no-external-ref');
  });

  it('ignores commented markup', () => {
    const html = VALID_HTML.replace('</body>', '<!-- <script></script><line data-diagram-element="edge" x1="0" y1="0" x2="5" y2="5"/> --></body>');
    expect(lintDiagram(html).findings).toEqual([]);
  });

  it('allows fragment and data references but rejects relative runtime references', () => {
    expect(lintDiagram(VALID_HTML.replace('</svg>', '<use href="#api"/><image href="data:image/png;base64,AA=="/></svg>')).findings).toEqual([]);
    expect(lintDiagram(VALID_HTML.replace('</svg>', '<image href="asset.png"/></svg>')).findings.map((item) => item.checkId)).toContain('no-external-ref');
  });

  it('checks unsafe CSS references inside CDATA', () => {
    const html = VALID_HTML.replace('</svg>', '<style><![CDATA[.node{fill:url(https://example.com/fill.svg)}]]></style></svg>');
    expect(lintDiagram(html).findings.map((item) => item.checkId)).toContain('no-external-ref');
  });

  it.each([
    'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=',
    'data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=',
  ])('rejects active data URI %s', (uri) => {
    const html = VALID_HTML.replace('</svg>', `<image href="${uri}"/></svg>`);
    expect(lintDiagram(html).findings.map((item) => item.checkId)).toContain('no-external-ref');
  });
});

describe('lintDiagram - root metadata', () => {
  it.each([
    ['an invalid grammar value', { 'data-diagram-grammar': 'flowchart' }, 'grammar-value'],
    ['an empty reading order', { 'data-reading-order': '' }, 'reading-order'],
    ['a dangling focal id', { 'data-focal-id': 'does-not-exist' }, 'focal-id'],
    ['an invalid source kind', { 'data-source-kind': 'yaml' }, 'source-kind'],
  ])('flags %s', (_label, overrides, checkId) => {
    const result = lintDiagram(svgDoc(ARCH_INNER, overrides));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ checkId, severity: 'error' });
  });
});
