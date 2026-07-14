// Redundant-family clustering for the DS-hygiene audit (pure — no I/O, no transport).
// Three passes over the ds masters, all feeding one families[] list; a cross-pass dedupe
// (keyed by the sorted NORMALIZED member names) keeps a family from being reported twice:
//   (a) axis-values — masters whose SOME axis shares a value-set of ≥3 options.
//   (b) name-suffix  — masters whose trailing CamelCase token is a known UI-part word.
//   (c) variant-structure — masters whose units are structurally identical (from detectStructure).
// Normalization strips a leading ❌ tombstone marker so 'X' and '❌ X' are NOT a fake family
// (a real v1 false positive: 'Data class' vs '❌ Data class'). Passes a/b tag each member with
// an `info` redundant-family flag; pass c does not (those masters already carry duplicate-structure).
import type { AuditComponentFact } from '../../../shared/audit-types.ts';
import type { AuditFlag, AuditFamily } from './audit-ds-detect.ts';
import type { CrossMasterGroup } from './audit-ds-structure.ts';

// Literal list — do NOT widen. These are the UI-part words whose repetition signals a family.
const NAME_SUFFIXES = ['Badge', 'Meter', 'Card', 'Chip', 'Item', 'Row', 'Pill'];

/** Strip a leading ❌ tombstone marker (+ surrounding whitespace) so tombstones don't fake a family. */
export function normalizeName(n: string): string {
  return n.replace(/^\s*❌\s*/, '').trim();
}

interface Bucket { names: Set<string>; ids: Set<string>; norm: Set<string> }

function bucket(map: Map<string, Bucket>, keyStr: string, c: AuditComponentFact): void {
  const b = map.get(keyStr) ?? { names: new Set<string>(), ids: new Set<string>(), norm: new Set<string>() };
  b.names.add(c.name); // members keep the RAW name
  b.ids.add(c.id);
  b.norm.add(normalizeName(c.name)); // family threshold counts DISTINCT normalized names
  map.set(keyStr, b);
}

/** Dedupe key for a family: its members' distinct normalized names, sorted. */
function memberKey(norm: Iterable<string>): string {
  return [...new Set(norm)].sort().join('|');
}

export interface FamilyResult {
  families: AuditFamily[];
  /** component id → the redundant-family flags it earned (passes a/b only). */
  flaggedById: Map<string, AuditFlag[]>;
}

/** Cluster the ds masters into redundant families and the per-member flags they imply. */
export function detectFamilies(comps: AuditComponentFact[], crossMasterGroups: CrossMasterGroup[] = []): FamilyResult {
  const families: AuditFamily[] = [];
  const flaggedById = new Map<string, AuditFlag[]>();
  const seen = new Set<string>(); // cross-pass dedupe — first pass (a, then b, then c) wins
  const addFlag = (id: string, flag: AuditFlag): void => {
    const list = flaggedById.get(id) ?? [];
    list.push(flag);
    flaggedById.set(id, list);
  };

  // (a) axis-values: any single axis with ≥3 options contributes a value-set signature;
  //     ≥2 DISTINCT NORMALIZED names sharing that signature form a family.
  const axisGroups = new Map<string, Bucket>();
  for (const c of comps) {
    for (const values of Object.values(c.variantAxes)) {
      if (values.length < 3) continue;
      bucket(axisGroups, `{${[...values].sort().join(', ')}}`, c);
    }
  }
  for (const [sig, b] of axisGroups) {
    if (b.norm.size < 2) continue; // needs ≥2 different normalized names to be "redundant"
    const key = memberKey(b.norm);
    if (seen.has(key)) continue;
    seen.add(key);
    families.push({ signature: sig, reason: 'axis-values', members: [...b.names].sort() });
    for (const id of b.ids) addFlag(id, { id: 'redundant-family', severity: 'info', detail: `redundant-family (axis-values): ${sig}` });
  }

  // (b) name-suffix: the trailing CamelCase token (of the NORMALIZED name), when it is a
  //     known UI-part word; ≥2 distinct normalized names sharing it form a family.
  const suffixGroups = new Map<string, Bucket>();
  for (const c of comps) {
    const m = normalizeName(c.name).match(/[A-Z][a-z0-9]*$/);
    const token = m ? m[0] : null;
    if (!token || !NAME_SUFFIXES.includes(token)) continue;
    bucket(suffixGroups, token, c);
  }
  for (const [token, b] of suffixGroups) {
    if (b.norm.size < 2) continue;
    const key = memberKey(b.norm);
    if (seen.has(key)) continue;
    seen.add(key);
    families.push({ signature: token, reason: 'name-suffix', members: [...b.names].sort() });
    for (const id of b.ids) addFlag(id, { id: 'redundant-family', severity: 'info', detail: `redundant-family (name-suffix): ${token}` });
  }

  // (c) variant-structure: structurally-identical units across masters (from detectStructure).
  //     Members already carry a duplicate-structure flag, so no extra per-member flag here.
  for (const g of crossMasterGroups) {
    const norm = new Set(g.masters.map(normalizeName));
    if (norm.size < 2) continue;
    const key = memberKey(norm);
    if (seen.has(key)) continue;
    seen.add(key);
    const signature = g.texts.length
      ? `text:{${g.texts.slice(0, 4).join(', ')}}`
      : `struct:${g.hash.slice(0, 8)}`;
    families.push({ signature, reason: 'variant-structure', members: [...g.masters].sort() });
  }

  return { families, flaggedById };
}
