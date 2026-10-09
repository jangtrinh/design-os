import { canonicalHash } from './ds-manifest.js';
import { parseTokenFile } from './token-model.js';
import { resolveTokens } from './token-resolve.js';
import { KitError, type KitFinding, type KitPreparation, type KitLock, type Registry } from './ds-kit-types.js';
import { parseKitSpec, readKitJson } from './ds-kit-parse.js';
import { indexKitContent, ignoredKitPath, readKitFile, verifyKitFiles } from './ds-kit-files.js';
import { readKitInventory, validateKitRecord } from './ds-kit-inventory.js';
import { emitKitTheme } from './ds-kit-theme.js';
import { validateKitEvidence } from './ds-kit-evidence.js';
export type { KitPreparation } from './ds-kit-types.js';
function containsObligation(text: string, option: string): boolean {
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u').test(text);
}
export function prepareKit(root: string): KitPreparation {
  const spec = parseKitSpec(readKitJson(root,'kit.json'));
  const content = indexKitContent(root,spec.artifacts); const declared = new Set(content.map(f => f.path));
  const findings: KitFinding[] = [];
  const add = (code: string,message: string,sourceId?: string): void => { findings.push({code,message,...(sourceId ? {sourceId} : {})}); };
  const bound = (path: string): void => { if (ignoredKitPath(path) || !declared.has(path)) throw new KitError('KIT_UNDECLARED',`Required content not declared: ${path}`); };
  for (const path of [spec.tokens,spec.theme,...spec.sources.map(s => s.path)]) bound(path);
  if (!spec.evidence.startsWith('evidence/')) throw new KitError('KIT_PATH','Receipt must be inside evidence/');
  for (const path of ['package.json','package-lock.json']) if (!declared.has(path)) add('KIT_PACKAGE',`Missing bound ${path}`);
  const tokens = readKitJson(root,spec.tokens); let tokenPaths: Set<string>;
  try { tokenPaths = new Set(resolveTokens(parseTokenFile(tokens)).map(t => t.path)); }
  catch (error) { throw new KitError('KIT_TOKENS',String(error)); }
  if (!tokenPaths.size) add('KIT_TOKENS','Token inventory is empty');
  try {
    if (!readKitFile(root,spec.theme).equals(Buffer.from(emitKitTheme(tokens,spec.aliases)))) add('KIT_THEME','Declared theme differs from deterministic owner bridge');
  } catch (error) { if (!(error instanceof KitError)) throw error; add(error.code,error.message); }
  const inventory = readKitInventory(root,spec,tokens,findings);
  const items = new Map(inventory.map(i => [i.sourceId,i]));
  const cases = new Map(spec.cases.map(c => [c.id,c]));
  if (cases.size !== spec.cases.length) add('KIT_CASE','Duplicate case IDs');
  if (!spec.cases.some(c => c.kind === 'build' && c.subject === 'kit')) add('KIT_CASE','Missing kit build obligation');
  if (!spec.cases.some(c => c.kind === 'review' && c.subject === 'kit')) add('KIT_CASE','Missing kit review obligation');
  for (const c of spec.cases) if (c.subject !== 'kit' && !items.has(c.subject)) add('KIT_CASE',`Unknown case subject: ${c.subject}`);
  const referenced = new Set(spec.mappings.flatMap(m => m.cases ?? []));
  for (const c of spec.cases) if (c.subject !== 'kit' && !referenced.has(c.id)) add('KIT_CASE',`Unused source case: ${c.id}`);
  const implementations = new Map<string,string>();
  const mapped = new Set<string>(); const registry: Registry = {version:'0.1.0',components:[]};
  for (const mapping of spec.mappings) {
    const id = mapping.sourceId; const item = items.get(id);
    if (!item || mapped.has(id)) { add('KIT_MAPPING','Unknown or duplicate source mapping',id); continue; }
    mapped.add(id);
    if (mapping.name !== item.name) add('KIT_NAME','Mapping must preserve exact owner name',id);
    if (mapping.disposition === 'unresolved') { add('KIT_UNRESOLVED','Source item unresolved',id); continue; }
    const obligations = (mapping.cases ?? []).flatMap(caseId => {
      const c = cases.get(caseId);
      if (!c || c.subject !== id) { add('KIT_CASE',`Missing/wrong subject case: ${caseId}`,id); return []; }
      return [c];
    });
    if (!obligations.some(c => c.kind === 'review')) add('KIT_CASE','Missing source review',id);
    if (mapping.disposition !== 'component') {
      if (item.record) {
        const category = item.record.category.trim().toLowerCase();
        const allowed = mapping.disposition === 'excluded' ? item.record.deprecated === true : (mapping.disposition === 'icon' || mapping.disposition === 'screen') && category === mapping.disposition;
        if (!allowed) add('KIT_DISPOSITION','Registry reusable component cannot be discarded without corresponding source category or deprecation',id);
      }
      continue;
    }
    if (item.record?.figmaNode !== undefined) add('KIT_FIGMA_SIDECAR',`Component ${item.name} retains source figmaNode pointer ${item.record.figmaNode}; version 1 cannot bind legacy design/sidecars. Retain the raw pointer/source evidence and keep this mapping blocked pending an explicitly reviewed supported capture or future sidecar binding`,id);
    if (!obligations.some(c => c.kind === 'render')) add('KIT_CASE','Missing component render',id);
    const states = [...item.states,...item.variants.filter(v => /^State=/i.test(v))];
    if ((states.some(s => !/^(default|State=Default)$/i.test(s)) || (mapping.states ?? []).some(s => !/^default$/i.test(s))) && !obligations.some(c => c.kind === 'behavior')) add('KIT_CASE','Missing behavior obligation',id);
    for (const [required,covered] of [[item.variants,mapping.variants ?? []],[item.states,mapping.states ?? []]] as const) {
      for (const option of required) {
        if (!covered.includes(option)) add('KIT_COVERAGE',`Missing captured option: ${option}`,id);
        if (!obligations.some(c => containsObligation(c.id,option) || containsObligation(c.description,option))) add('KIT_COVERAGE',`Missing explicit case binding: ${option}`,id);
      }
    }
    const implementation = mapping.implementation!; bound(implementation.path); bound(mapping.markup!);
    const identity = JSON.stringify([implementation.path,implementation.export]);
    const previous = implementations.get(identity);
    if (previous !== undefined && previous !== item.name) add('KIT_IMPLEMENTATION_DUPLICATE',`Implementation export already bound to ${previous}; distinct families require distinct exports`,id);
    else implementations.set(identity,item.name);
    if (!/\.(tsx|jsx|ts|js)$/.test(implementation.path)) add('KIT_IMPLEMENTATION','Implementation must be actual code artifact',id);
    const markup = readKitFile(root,mapping.markup!).toString('utf8');
    if (!markup.trim()) add('KIT_MARKUP','Empty SSR markup',id);
    const used = [...new Set([...(item.record?.tokensUsed ?? []),...(mapping.tokensUsed ?? [])])].sort();
    for (const token of used) if (!tokenPaths.has(token)) add('KIT_TOKEN_REFERENCE',`Unknown used token: ${token}`,id);
    // Host binds SSR/export and import closure in receipts; no AST/provenance claim is made here.
    const record = validateKitRecord({...(item.record ?? {name:item.name,category:'component',tokensUsed:[]}),name:item.name,markup,tokensUsed:used,variants:[...new Set([...(mapping.variants ?? []),...(mapping.states ?? []).map(s => `State=${s.charAt(0).toUpperCase()}${s.slice(1)}`)])]});
    registry.components.push(record);
  }
  for (const item of inventory) if (!mapped.has(item.sourceId)) add('KIT_UNRESOLVED','Missing source mapping',item.sourceId);
  if (registry.components.length < spec.minimumComponents) add('KIT_MINIMUM',`Reusable count ${registry.components.length} below ${spec.minimumComponents}`);
  registry.components.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const tokensHash = canonicalHash(tokens); const registryHash = canonicalHash(registry);
  const contentHash = canonicalHash({content,tokensHash,registryHash});
  verifyKitFiles(root,content);
  return {spec,capturedCount:inventory.length,tokens,registry,content,contentHash,tokensHash,registryHash,findings,complete:findings.length === 0};
}
export function validateKit(root: string): KitLock {
  const prepared = prepareKit(root);
  if (!prepared.complete) throw new KitError('KIT_BLOCKED','Kit has unresolved blockers',prepared.findings);
  const evidence = validateKitEvidence(root,prepared);
  verifyKitFiles(root,prepared.content); verifyKitFiles(root,evidence);
  return {version:1,status:'verified',staleReasons:[],contentHash:prepared.contentHash,content:prepared.content,evidence,registry:prepared.registry,tokensHash:prepared.tokensHash,registryHash:prepared.registryHash};
}
