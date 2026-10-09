import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseKitSpec } from '../src/core/ds-kit-parse.js';

const Ajv2020 = createRequire(import.meta.url)('ajv/dist/2020.js').default as new (options: { strict: boolean }) => {
  compile: (schema: unknown) => (value: unknown) => boolean;
  addSchema: (schema: unknown) => void;
  errors?: unknown;
};
const schema = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const kitSchema = schema('ds-kit.schema.json');
const receiptSchema = schema('ds-kit-receipt.schema.json');
const lockSchema = schema('ds-kit-lock.schema.json');
const sourceComponentSchema = schema('source-authored-component.schema.json');

const canonicalHash = `sha256-${'A'.repeat(43)}`;
const byteHash = `sha256:${'a'.repeat(64)}`;

function validKit(): Record<string, unknown> {
  return {
    version: 1,
    name: 'Atelier 東京 · Café',
    intent: 'Preserve the owner’s exact names and visual language',
    target: 'react-shadcn-tailwind',
    minimumComponents: 1,
    sources: [{ id: 'registry-owner', kind: 'registry', path: 'source/registry.json', hash: byteHash, scope: 'complete', limitations: [] }],
    tokens: 'source/tokens.json', theme: 'src/theme.css', aliases: { background: 'color.canvas' },
    mappings: [{ sourceId: 'registry:owner:0', name: '按钮 / Primary · 東京 😀', disposition: 'component', implementation: { path: 'src/Button.tsx', export: 'Button', strategy: 'adapt', primitives: ['button'] }, markup: 'markup/button.html', variants: ['Size=Large'], states: ['default', 'disabled'], cases: ['render-button', 'behavior-button', 'review-button'], tokensUsed: ['color.canvas'] }],
    artifacts: ['source/registry.json', 'source/tokens.json', 'src/theme.css', 'src/Button.tsx', 'markup/button.html', 'package.json', 'package-lock.json'],
    cases: [
      { id: 'build-kit', kind: 'build', subject: 'kit', description: 'Build the owner components' },
      { id: 'review-kit', kind: 'review', subject: 'kit', description: 'Review the complete source inventory' },
      { id: 'render-button', kind: 'render', subject: 'registry:owner:0', description: 'Render Size=Large default and disabled' },
      { id: 'behavior-button', kind: 'behavior', subject: 'registry:owner:0', description: 'Verify default and disabled behavior' },
      { id: 'review-button', kind: 'review', subject: 'registry:owner:0', description: 'Review exact display name 按钮 / Primary · 東京 😀' },
    ],
    evidence: 'evidence/receipt.json',
  };
}

function validReceipt(): Record<string, unknown> {
  return { version: 1, contentHash: canonicalHash, cases: [{ id: 'build-kit', outcome: 'passed', files: ['evidence/build.log'], note: 'Host build completed' }] };
}

function validComponent(name = '按钮 / Primary · 東京 😀'): Record<string, unknown> {
  return { name, category: 'owner', markup: '<button>確認</button>', tokensUsed: ['color.canvas'], variants: ['Size=Large'], states: ['default', 'disabled'], description: 'Exact owner display name', scope: 'local', status: 'stable' };
}

function validLock(status: 'verified' | 'stale' = 'verified'): Record<string, unknown> {
  return {
    version: 1, status, staleReasons: status === 'verified' ? [] : ['source changed'], contentHash: canonicalHash,
    content: [{ path: 'kit.json', hash: byteHash }], evidence: [{ path: 'evidence/build.log', hash: byteHash }],
    registry: { version: '0.1.0', components: [validComponent()] }, tokensHash: canonicalHash, registryHash: canonicalHash,
  };
}

function validator(target: Record<string, unknown>, needsComponentRef = false): (value: unknown) => boolean {
  const ajv = new Ajv2020({ strict: false });
  if (target === sourceComponentSchema || needsComponentRef) {
    ajv.addSchema(schema('component-registry.schema.json'));
  }
  ajv.addSchema(sourceComponentSchema);
  return ajv.compile(target);
}

describe('published DS kit JSON Schemas (Draft 2020-12)', () => {
  it('accepts an owner kit fixture with Unicode display names and portable paths', () => {
    const value = validKit();
    const validate = validator(kitSchema);
    expect(validate(value), JSON.stringify((validate as unknown as { errors?: unknown }).errors)).toBe(true);
  });

  it.each([
    ['unsupported version', (v: Record<string, unknown>) => { v.version = 2; }],
    ['blank display name', (v: Record<string, unknown>) => { v.name = ' \t '; }],
    ['control character in intent', (v: Record<string, unknown>) => { v.intent = 'bad\u0001value'; }],
    ['unsafe source path', (v: Record<string, unknown>) => { (v.sources as Array<Record<string, unknown>>)[0]!.path = '../registry.json'; }],
    ['malformed source hash', (v: Record<string, unknown>) => { (v.sources as Array<Record<string, unknown>>)[0]!.hash = 'sha256:bad'; }],
    ['unknown mapping field', (v: Record<string, unknown>) => { (v.mappings as Array<Record<string, unknown>>)[0]!.surprise = true; }],
  ])('rejects DS kit %s', (_label, mutate) => {
    const value = validKit(); mutate(value);
    expect(validator(kitSchema)(value)).toBe(false);
  });

  it('accepts a positive receipt with a content binding and evidence path', () => {
    expect(validator(receiptSchema)(validReceipt())).toBe(true);
  });

  it.each([
    ['missing required content hash', (v: Record<string, unknown>) => { delete v.contentHash; }],
    ['invalid receipt shape', (v: Record<string, unknown>) => { (v.cases as Array<Record<string, unknown>>)[0]!.outcome = 'skipped'; }],
    ['malformed content hash', (v: Record<string, unknown>) => { v.contentHash = 'sha256-not-a-canonical-hash'; }],
    ['non-evidence file path', (v: Record<string, unknown>) => { ((v.cases as Array<Record<string, unknown>>)[0]!.files as string[])[0] = '../build.log'; }],
  ])('rejects receipt %s', (_label, mutate) => {
    const value = validReceipt(); mutate(value);
    expect(validator(receiptSchema)(value)).toBe(false);
  });

  it('accepts both verified and stale locks with status-consistent reasons', () => {
    const validate = validator(lockSchema, true);
    expect(validate(validLock('verified'))).toBe(true);
    expect(validate(validLock('stale'))).toBe(true);
  });

  it.each([
    ['verified lock with stale reasons', (v: Record<string, unknown>) => { v.staleReasons = ['changed']; }],
    ['stale lock without stale reasons', (v: Record<string, unknown>) => { v.status = 'stale'; v.staleReasons = []; }],
    ['unsupported lock version', (v: Record<string, unknown>) => { v.version = 2; }],
    ['malformed indexed hash', (v: Record<string, unknown>) => { (v.evidence as Array<Record<string, unknown>>)[0]!.hash = 'sha256:BAD'; }],
    ['wrong registry version', (v: Record<string, unknown>) => { (v.registry as Record<string, unknown>).version = '1.0.0'; }],
    ['legacy name grammar applied to source name', (v: Record<string, unknown>) => { ((v.registry as Record<string, unknown>).components as Array<Record<string, unknown>>)[0]!.name = ''; }],
    ['unknown source component field', (v: Record<string, unknown>) => { ((v.registry as Record<string, unknown>).components as Array<Record<string, unknown>>)[0]!.legacyOnly = true; }],
  ])('rejects lock with %s', (_label, mutate) => {
    const value = validLock(); mutate(value);
    expect(validator(lockSchema, true)(value)).toBe(false);
  });

  it('accepts source-authored exact names that legacy registry name grammar rejects', () => {
    const value = validComponent();
    expect(validator(sourceComponentSchema)(value)).toBe(true);
    const legacy = validator(schema('component-registry.schema.json'));
    expect(legacy({ version: '0.1.0', components: [value] })).toBe(false);
  });

  it('agrees with runtime parsing on supplementary Unicode and invalid name code points', () => {
    const validate = validator(sourceComponentSchema);
    const accepted = ['按钮 / Primary · 東京 😀', 'Owner 🧪 Card'];
    for (const name of accepted) {
      expect(validate(validComponent(name))).toBe(true);
      const kit = validKit(); kit.name = name;
      expect(() => parseKitSpec(kit)).not.toThrow();
    }

    const rejected = ['Owner\u0007Name', 'Owner\u001fName', 'Owner\u007fName', 'Owner\ud800Name', 'Owner\udc00Name'];
    for (const name of rejected) {
      expect(validate(validComponent(name))).toBe(false);
      const kit = validKit(); kit.name = name;
      expect(() => parseKitSpec(kit)).toThrow();
    }
  });

  it.each([
    ['blank name', (v: Record<string, unknown>) => { v.name = '   '; }],
    ['invalid legacy state', (v: Record<string, unknown>) => { v.states = ['loading']; }],
    ['invalid legacy token field', (v: Record<string, unknown>) => { v.tokensUsed = ['Color.Canvas']; }],
    ['invalid legacy scope', (v: Record<string, unknown>) => { v.scope = 'shared'; }],
    ['invalid source status', (v: Record<string, unknown>) => { v.status = 'published'; }],
  ])('rejects source-authored component with %s', (_label, mutate) => {
    const value = validComponent(); mutate(value);
    expect(validator(sourceComponentSchema)(value)).toBe(false);
  });

  it('leaves duplicate receipt IDs and semantic duplicate source names to runtime validation', () => {
    const receipt = validReceipt();
    (receipt.cases as Array<Record<string, unknown>>).push({ ...(receipt.cases as Array<Record<string, unknown>>)[0] });
    expect(validator(receiptSchema)(receipt)).toBe(true); // unique case identity is semantic, not structural.
    const kit = validKit();
    (kit.cases as Array<Record<string, unknown>>).push({ id: 'build-kit', kind: 'build', subject: 'kit', description: 'Repeated build case identifier' });
    expect(validator(kitSchema)(kit)).toBe(true); // unique case IDs are semantic runtime checks.
  });
});
