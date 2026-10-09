import { KitError, type KitSpec } from './ds-kit-types.js';
import { kitPath, readKitFile } from './ds-kit-files.js';
export function object(value: unknown, label: string, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new KitError('KIT_FORMAT', `${label} must be an object`);
  const rec = value as Record<string, unknown>;
  if (keys && Object.keys(rec).some(k => !keys.includes(k))) throw new KitError('KIT_FORMAT', `${label} has unknown keys`);
  return rec;
}
export function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || [...value].some(c => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127 || c.codePointAt(0)! >= 0xD800 && c.codePointAt(0)! <= 0xDFFF)) throw new KitError('KIT_FORMAT', `${label} must be a nonempty Unicode string`);
  return value;
}
export function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new KitError('KIT_FORMAT', `${label} must be an array`); return value;
}
export function strings(value: unknown, label: string): string[] {
  const result = array(value, label).map(v => string(v, label));
  if (new Set(result).size !== result.length) throw new KitError('KIT_FORMAT', `Duplicate ${label}`); return result;
}
export function choice(value: unknown, choices: readonly unknown[], label: string): void {
  if (!choices.includes(value)) throw new KitError('KIT_FORMAT', `Invalid ${label}`);
}
export function readKitJson(root: string, path: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(readKitFile(root, path))) as unknown; }
  catch (error) { if (error instanceof KitError) throw error; throw new KitError('KIT_FORMAT', `Invalid JSON: ${path}`); }
}
export function parseKitSpec(value: unknown): KitSpec {
  const r = object(value, 'kit', ['version','name','intent','target','minimumComponents','sources','tokens','theme','aliases','mappings','artifacts','cases','evidence']);
  choice(r.version, [1], 'version'); choice(r.target, ['react-shadcn-tailwind'], 'target');
  const name = string(r.name, 'name'); const intent = string(r.intent, 'intent');
  if (name.length > 64 || intent.length > 512) throw new KitError('KIT_FORMAT', 'Kit name (max 64) and intent (max 512) must fit manifest UTF-16 limits');
  if (!Number.isSafeInteger(r.minimumComponents) || (r.minimumComponents as number) < 0) throw new KitError('KIT_FORMAT', 'minimumComponents must be a nonnegative safe integer');
  for (const key of ['tokens','theme','evidence']) kitPath(r[key]);
  for (const p of strings(r.artifacts, 'artifacts')) kitPath(p);
  const aliases = object(r.aliases, 'aliases');
  for (const [k,v] of Object.entries(aliases)) { string(k, 'alias'); string(v, 'alias target'); }
  const sources = array(r.sources, 'sources');
  if (!sources.length) throw new KitError('KIT_FORMAT', 'sources cannot be empty');
  for (const value of sources) {
    const s = object(value, 'source', ['id','kind','path','hash','scope','limitations']);
    string(s.id, 'source.id'); if ((s.id as string).includes(':')) throw new KitError('KIT_FORMAT', 'source.id cannot contain colon');
    choice(s.kind, ['registry','figma'], 'source.kind'); kitPath(s.path);
    if (typeof s.hash !== 'string' || s.hash.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(s.hash)) throw new KitError('KIT_FORMAT', 'Invalid source.hash');
    choice(s.scope, ['partial','complete'], 'source.scope'); strings(s.limitations, 'limitations');
  }
  for (const value of array(r.cases, 'cases')) {
    const c = object(value, 'case', ['id','kind','subject','description']);
    for (const k of ['id','subject','description']) string(c[k], `case.${k}`);
    choice(c.kind, ['build','render','behavior','review'], 'case.kind');
  }
  for (const value of array(r.mappings, 'mappings')) {
    const m = object(value, 'mapping', ['sourceId','name','disposition','reason','implementation','markup','variants','states','cases','tokensUsed']);
    string(m.sourceId, 'sourceId'); string(m.name, 'mapping.name');
    choice(m.disposition, ['component','icon','screen','excluded','unresolved'], 'disposition');
    if (m.reason !== undefined) string(m.reason, 'reason');
    for (const k of ['variants','states','cases','tokensUsed']) if (m[k] !== undefined) strings(m[k], k);
    if (m.markup !== undefined) kitPath(m.markup);
    if (m.implementation !== undefined) {
      const i = object(m.implementation, 'implementation', ['path','export','strategy','primitives']);
      kitPath(i.path); string(i.export, 'export'); choice(i.strategy, ['reuse','adapt','custom'], 'strategy'); strings(i.primitives, 'primitives');
    }
    if (m.disposition === 'component' && ['implementation','markup','variants','states','cases'].some(k => m[k] === undefined)) throw new KitError('KIT_FORMAT', 'Component mapping missing required fields');
    if (['icon','screen','excluded'].includes(m.disposition as string) && (m.reason === undefined || m.cases === undefined)) throw new KitError('KIT_FORMAT', 'Noncomponent mapping needs reason and cases');
  }
  return r as unknown as KitSpec; // All public fields checked above; reconciliation checks references.
}
