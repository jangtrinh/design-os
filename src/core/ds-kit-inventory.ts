import { validateSourceAuthoredComponentRecord, type ComponentRecord } from './registry-store.js';
import { buildTokensTree, inferDtcgType, pathOf, pickBaseMode, sanitizeSeg, type DsVariable } from './figma-ds-tokens.js';
import { canonicalHash } from './ds-manifest.js';
import { KitError, type KitFinding, type KitSpec } from './ds-kit-types.js';
import { array, object, readKitJson, string, strings } from './ds-kit-parse.js';
import { hashKitBytes, readKitFile } from './ds-kit-files.js';
export interface KitInventoryItem { sourceId: string; name: string; variants: string[]; states: string[]; record?: ComponentRecord }
/** Source-authored door: reuse every legacy field check, retaining the exact owner display name. */
export function validateKitRecord(value: unknown): ComponentRecord {
  const r = object(value, 'source record'); const name = string(r.name, 'source.name');
  try { return { ...validateSourceAuthoredComponentRecord(r), name }; }
  catch (error) { throw new KitError('KIT_SOURCE', `Invalid source record ${name}: ${String(error)}`); }
}
function figmaTokens(raw: Record<string,unknown>, tokens: unknown, findings: KitFinding[]): void {
  if (!Array.isArray(raw.tokens) || !raw.tokens.length) { findings.push({code:'KIT_FIGMA_TOKENS',message:'Figma capture lacks raw variable facts'}); return; }
  const variables: DsVariable[] = []; const ids = new Set<string>();
  for (const value of raw.tokens) {
    const v = object(value, 'Figma variable');
    const id = string(v.id, 'variable.id'); const name = string(v.name, 'variable.name'); const type = string(v.type, 'variable.type');
    if (ids.has(id)) findings.push({code:'KIT_FIGMA_TOKENS',message:`Duplicate variable ID: ${id}`}); ids.add(id);
    if (v.valuesByMode !== undefined) object(v.valuesByMode, 'valuesByMode');
    for (const value of [v.value,...Object.values((v.valuesByMode ?? {}) as Record<string,unknown>)]) {
      if (value === undefined) continue;
      if (typeof value === 'number' && !Number.isFinite(value)) throw new KitError('KIT_SOURCE','Nonfinite variable value');
      if (type === 'COLOR' && typeof value === 'object' && value !== null && (value as Record<string,unknown>).type !== 'VARIABLE_ALIAS') {
        const color = object(value,'variable color');
        for (const channel of ['r','g','b',...(color.a === undefined ? [] : ['a'])]) if (typeof color[channel] !== 'number' || (color[channel] as number) < 0 || (color[channel] as number) > 1) throw new KitError('KIT_SOURCE',`Invalid color channel: ${id}`);
      }
    }
    variables.push({id,name,type,...(v.collection !== undefined ? {collection:string(v.collection,'collection')} : {}),...(v.value !== undefined ? {value:v.value} : {}),...(v.valuesByMode !== undefined ? {valuesByMode:v.valuesByMode as Record<string,unknown>} : {})});
  }
  const result = buildTokensTree(variables);
  if (result.skipped || result.primitives + result.semantics !== variables.length) findings.push({code:'KIT_FIGMA_LOSS',message:'Unsupported, skipped or colliding Figma variables'});
  // Reproject each supplied mode as a base to expose converter losses hidden in extensions.
  const modeKeys = new Set(variables.flatMap(v => Object.keys(v.valuesByMode ?? {})));
  const sanitized = new Set<string>();
  for (const mode of modeKeys) {
    const key = sanitizeSeg(mode);
    if (sanitized.has(key)) findings.push({code:'KIT_FIGMA_MODE',message:`Colliding mode: ${mode}`}); sanitized.add(key);
    if (variables.some(v => v.valuesByMode && !(mode in v.valuesByMode))) findings.push({code:'KIT_FIGMA_MODE',message:`Missing mode facts or unsupported collection selection: ${mode}`});
    const layer = buildTokensTree(variables.map(v => ({...v,valuesByMode:undefined,value:v.valuesByMode ? v.valuesByMode[mode] : v.value})));
    if (layer.skipped) findings.push({code:'KIT_FIGMA_MODE',message:`Lost mode value: ${mode}`});
  }
  for (const v of variables) {
    const type = inferDtcgType(v.name,v.type); if (!type) continue;
    const p = pathOf(v.name,type); const leaf = result.tree[p.category]?.[p.token];
    for (const mode of Object.keys(v.valuesByMode ?? {})) {
      if (mode !== pickBaseMode(Object.keys(v.valuesByMode ?? {})) && !leaf?.$extensions?.[`mode.${sanitizeSeg(mode)}`]) findings.push({code:'KIT_FIGMA_MODE',message:`Missing projected mode: ${v.id}/${mode}`});
    }
  }
  if (canonicalHash(result.tree) !== canonicalHash(tokens)) findings.push({code:'KIT_FIGMA_TOKENS',message:'Tokens differ from lossless raw Figma projection'});
}
export function readKitInventory(root: string, spec: KitSpec, tokens: unknown, findings: KitFinding[]): KitInventoryItem[] {
  const items: KitInventoryItem[] = []; const sources = new Set<string>();
  for (const source of spec.sources) {
    if (sources.has(source.id)) findings.push({code:'KIT_SOURCE',message:`Duplicate source ID: ${source.id}`}); sources.add(source.id);
    if (hashKitBytes(readKitFile(root,source.path)) !== source.hash) findings.push({code:'KIT_SOURCE_CHANGED',message:`Source hash mismatch: ${source.path}`});
    if (source.scope !== 'complete' || source.limitations.length) findings.push({code:'KIT_SCOPE',message:`Source scope incomplete: ${source.id}`});
    const raw = object(readKitJson(root,source.path),'source');
    if (source.kind === 'registry') {
      object(raw,'registry',['version','components']); string(raw.version,'registry.version');
      array(raw.components,'components').forEach((value,index) => {
        const record = validateKitRecord(value);
        items.push({sourceId:`${source.id}:${index}`,name:record.name,variants:record.variants ?? [],states:record.states ?? [],record});
      });
    } else {
      for (const value of array(raw.components,'components')) {
        const c = object(value,'Figma component'); const id = string(c.id,'component.id'); const name = string(c.name,'component.name');
        const axes = c.variantAxes === undefined ? {} : object(c.variantAxes,'variantAxes');
        const variants = Object.entries(axes).flatMap(([axis,options]) => strings(options,'axis options').map(option => `${axis}=${option}`));
        items.push({sourceId:`${source.id}:${id}`,name,variants,states:c.states === undefined ? [] : strings(c.states,'states')});
      }
      figmaTokens(raw,tokens,findings);
    }
  }
  const ids = new Set<string>(); const names = new Set<string>();
  for (const item of items) {
    const name = item.name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
    if (ids.has(item.sourceId) || names.has(name)) findings.push({code:'KIT_DUPLICATE',message:`Duplicate/ambiguous source identity: ${item.name}`,sourceId:item.sourceId});
    ids.add(item.sourceId); names.add(name);
  }
  return items;
}
