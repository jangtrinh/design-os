/** Pure parsing for the tracked MengTo source ledger. */
export const SOURCE_ID = "mengto-web-techniques--202608";
const MANIFEST_KEYS = ["schemaVersion", "id", "upstream", "enumeration", "treeRecordCount", "blobRecordCount", "textArtifactCount", "duplicateBlobGroups", "skillRecordCount", "categoryCounts", "dispositionCounts", "parts"];
const SKILL_KEYS = ["schemaVersion", "upstream", "expected", "skills"];
const TREE_KEYS = ["schemaVersion", "kind", "records"];
const DECISION_KEYS = ["skill", "category", "disposition", "reason", "techniqueIds", "existingKnowledgeRefs"];
const CATEGORIES = new Set(["core", "style", "vendor", "composite"]);
const DISPOSITIONS = new Set(["adopted", "covered-existing", "rejected", "out-of-scope"]);
const hex = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const upstreamIsValid = (value: Record<string, unknown>) => {
  const evidence = object(value.rootLicenseEvidence);
  return exactKeys(value, ["repository", "revision", "capturedAt", "rootLicense", "rootLicenseEvidence"])
    && value.repository === "https://github.com/MengTo/Skills.git"
    && hex(value.revision, 40)
    && typeof value.capturedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.capturedAt)
    && value.rootLicense === "MIT"
    && evidence !== null && exactKeys(evidence, ["path", "mode", "gitObjectId", "byteCount", "sha256"])
    && evidence.path === "LICENSE" && evidence.mode === "100644" && hex(evidence.gitObjectId, 40)
    && Number.isInteger(evidence.byteCount) && (evidence.byteCount as number) > 0 && hex(evidence.sha256, 64);
};
const object = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);

export interface LedgerPart { kind: "tree" | "skills"; path: string; sha256: string; recordCount: number; }
export interface SourceManifest { id: string; revision: string; parts: readonly LedgerPart[]; treeRecordCount: number; blobRecordCount: number; textArtifactCount: number; skillRecordCount: number; categoryCounts: Readonly<Record<string, number>>; dispositionCounts: Readonly<Record<string, number>>; }
export interface SourceDecision { skill: string; category: string; disposition: string; reason: string; techniqueIds: readonly string[]; existingKnowledgeRefs: readonly string[]; }

export function parseSourceManifest(json: string): SourceManifest | null {
  let raw: unknown; try { raw = JSON.parse(json); } catch { return null; }
  const value = object(raw); const upstream = value === null ? null : object(value.upstream);
  if (value === null || upstream === null || !exactKeys(value, MANIFEST_KEYS) || value.schemaVersion !== 1 || value.id !== SOURCE_ID || !upstreamIsValid(upstream) || !Array.isArray(value.parts)) return null;
  const countKeys = ["treeRecordCount", "blobRecordCount", "textArtifactCount", "skillRecordCount"];
  const counts = (rawCounts: unknown, allowed: Set<string>) => { const counts = object(rawCounts); return counts !== null && Object.entries(counts).every(([key, count]) => allowed.has(key) && Number.isInteger(count) && (count as number) >= 0) ? counts as Record<string, number> : null; };
  const categoryCounts = counts(value.categoryCounts, CATEGORIES); const dispositionCounts = counts(value.dispositionCounts, DISPOSITIONS);
  if (countKeys.some((key) => !Number.isInteger(value[key]) || (value[key] as number) < 0) || categoryCounts === null || dispositionCounts === null) return null;
  const parts: LedgerPart[] = [];
  for (const rawPart of value.parts) {
    const part = object(rawPart);
    if (part === null || !["tree", "skills"].includes(part.kind as string) || typeof part.path !== "string" || !hex(part.sha256, 64) || !Number.isInteger(part.recordCount) || (part.recordCount as number) < 0) return null;
    parts.push({ kind: part.kind as LedgerPart["kind"], path: part.path, sha256: part.sha256 as string, recordCount: part.recordCount as number });
  }
  return { id: value.id as string, revision: upstream.revision as string, parts, treeRecordCount: value.treeRecordCount as number, blobRecordCount: value.blobRecordCount as number, textArtifactCount: value.textArtifactCount as number, skillRecordCount: value.skillRecordCount as number, categoryCounts, dispositionCounts };
}

export function parseSourceDecisions(json: string, revision: string): SourceDecision[] | null {
  let raw: unknown; try { raw = JSON.parse(json); } catch { return null; }
  const value = object(raw); const upstream = value === null ? null : object(value.upstream); const expected = value === null ? null : object(value.expected);
  if (value === null || upstream === null || expected === null || !exactKeys(value, SKILL_KEYS) || value.schemaVersion !== 1 || !upstreamIsValid(upstream) || upstream.revision !== revision || !Array.isArray(value.skills)) return null;
  const out: SourceDecision[] = [];
  for (const rawRow of value.skills) {
    const row = object(rawRow);
    if (row === null || !exactKeys(row, DECISION_KEYS) || typeof row.skill !== "string" || !CATEGORIES.has(row.category as string) || !DISPOSITIONS.has(row.disposition as string) || typeof row.reason !== "string" || !Array.isArray(row.techniqueIds) || !Array.isArray(row.existingKnowledgeRefs) || !row.techniqueIds.every((id) => typeof id === "string") || !row.existingKnowledgeRefs.every((ref) => typeof ref === "string")) return null;
    out.push({ skill: row.skill, category: row.category as string, disposition: row.disposition as string, reason: row.reason, techniqueIds: row.techniqueIds as string[], existingKnowledgeRefs: row.existingKnowledgeRefs as string[] });
  }
  return out;
}

export function parseTreeRecords(json: string): readonly Record<string, unknown>[] | null {
  let raw: unknown; try { raw = JSON.parse(json); } catch { return null; }
  const value = object(raw);
  return value !== null && exactKeys(value, TREE_KEYS) && value.schemaVersion === 1 && value.kind === "tree" && Array.isArray(value.records) && value.records.every((record) => object(record) !== null) ? value.records as Record<string, unknown>[] : null;
}
