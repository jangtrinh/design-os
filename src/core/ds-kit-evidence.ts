import { KitError, type KitFile, type KitPreparation } from './ds-kit-types.js';
import { array, choice, object, readKitJson, strings } from './ds-kit-parse.js';
import { hashKitBytes, kitPath, readKitFile, uniqueKitPaths } from './ds-kit-files.js';
export function validateKitEvidence(root: string, prepared: KitPreparation): KitFile[] {
  const {spec,contentHash} = prepared;
  const receipt = object(readKitJson(root,spec.evidence),'receipt',['version','contentHash','cases']);
  choice(receipt.version,[1],'receipt.version');
  if (typeof receipt.contentHash !== 'string' || receipt.contentHash.length !== 50 || !/^sha256-[A-Za-z0-9_-]{43}$/.test(receipt.contentHash)) throw new KitError('KIT_FORMAT','Invalid receipt contentHash');
  if (receipt.contentHash !== contentHash) throw new KitError('KIT_EVIDENCE_STALE','Receipt subject does not match candidate content');
  const required = new Set(spec.cases.map(c => c.id)); const seen = new Set<string>(); const files = new Set<string>();
  for (const value of array(receipt.cases,'receipt.cases')) {
    const c = object(value,'receipt case',['id','outcome','files','note']);
    if (typeof c.id !== 'string' || !required.has(c.id) || seen.has(c.id)) throw new KitError('KIT_EVIDENCE','Unknown or duplicate receipt case');
    seen.add(c.id); choice(c.outcome,['passed','failed'],'outcome');
    if (c.outcome !== 'passed') throw new KitError('KIT_EVIDENCE',`Case failed: ${c.id}`);
    if (typeof c.note !== 'string') throw new KitError('KIT_FORMAT','Receipt note must be a string');
    const paths = strings(c.files,'evidence files');
    if (!paths.length) throw new KitError('KIT_EVIDENCE',`Missing evidence: ${c.id}`);
    for (const path of paths) {
      kitPath(path);
      if (!path.startsWith('evidence/') || path === spec.evidence) throw new KitError('KIT_EVIDENCE',`Invalid/self-referential evidence: ${path}`);
      if (!readKitFile(root,path).length) throw new KitError('KIT_EVIDENCE',`Empty evidence: ${path}`);
      files.add(path);
    }
  }
  if (seen.size !== required.size) throw new KitError('KIT_EVIDENCE','Missing required receipt cases');
  files.add(spec.evidence); uniqueKitPaths([...files]);
  return [...files].sort().map(path => ({path,hash:hashKitBytes(readKitFile(root,path))}));
}
