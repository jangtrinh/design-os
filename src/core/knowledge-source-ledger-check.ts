import { createHash } from "node:crypto";
import type { KnowledgeFinding } from "./knowledge-lint.js";
import { SOURCE_ID, parseSourceDecisions, parseSourceManifest, parseTreeRecords } from "./knowledge-source-ledger-parse.js";

export interface SourceLedgerCheckInput { manifestJson: string | null; parts: Readonly<Record<string, string>>; files: readonly string[]; }
const finding = (checkId: string, message: string): KnowledgeFinding => ({ checkId, severity: "error", message });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const partPath = (path: string) => `sources/${path}`;

export function sourceLedgerChecks(input: SourceLedgerCheckInput): KnowledgeFinding[] {
  if (input.manifestJson === null) return input.files.some((path) => path.startsWith(`sources/${SOURCE_ID}`)) ? [finding("source-ledger-missing", "tracked MengTo source ledger manifest is missing")] : [];
  const manifest = parseSourceManifest(input.manifestJson);
  if (manifest === null) return [finding("source-ledger-invalid", "MengTo source ledger manifest is missing required keys or has an invalid shape")];
  const allowed = new Set([`sources/${SOURCE_ID}.json`, `sources/${SOURCE_ID}/tree.json`, `sources/${SOURCE_ID}/skills.json`]);
  if (input.files.some((path) => path.startsWith(`sources/${SOURCE_ID}`) && !allowed.has(path))) return [finding("source-ledger-path-invalid", "MengTo source ledger contains a path outside its fixed JSON allowlist")];
  if ([...allowed].some((path) => !input.files.includes(path))) return [finding("source-ledger-path-invalid", "MengTo source ledger manifest and parts must be regular walked files")];
  if (JSON.stringify(manifest.parts.map((part) => part.kind)) !== JSON.stringify(["tree", "skills"])) return [finding("source-ledger-invalid", "MengTo source ledger parts must be ordered tree, then skills")];
  const loaded = new Map<string, string>();
  for (const part of manifest.parts) {
    const path = partPath(part.path); const bytes = input.parts[path];
    if (path !== `sources/${SOURCE_ID}/${part.kind}.json` || bytes === undefined || digest(bytes) !== part.sha256) return [finding("source-ledger-part-hash", `source ledger part '${part.path}' is missing or does not match its SHA-256`)];
    loaded.set(part.kind, bytes);
  }
  const payloadPattern = /data:[^;\s]+;base64,|[A-Za-z0-9+/]{512,}={0,2}/;
  if ([input.manifestJson, ...loaded.values()].some((value) => payloadPattern.test(value))) return [finding("source-ledger-embedded-payload", "source ledger metadata must not embed base64 or data-URI payloads")];
  const records = parseTreeRecords(loaded.get("tree") ?? ""); const decisions = parseSourceDecisions(loaded.get("skills") ?? "", manifest.revision);
  if (records === null || decisions === null) return [finding("source-ledger-invalid", "MengTo source ledger part has an invalid or unexpected top-level shape")];
  const manifestRaw = JSON.parse(input.manifestJson) as Record<string, unknown>;
  const skillsRaw = JSON.parse(loaded.get("skills") ?? "") as Record<string, unknown>;
  if (JSON.stringify(manifestRaw.upstream) !== JSON.stringify(skillsRaw.upstream)) return [finding("source-ledger-provenance-drift", "source ledger manifest and skills provenance must match exactly")];
  const expected = skillsRaw.expected as Record<string, unknown>;
  if (expected.skillRecordCount !== manifest.skillRecordCount || JSON.stringify(expected.categoryCounts) !== JSON.stringify(manifest.categoryCounts) || JSON.stringify(expected.dispositionCounts) !== JSON.stringify(manifest.dispositionCounts)) return [finding("source-ledger-count-drift", "source ledger expected decision totals do not match its manifest")];
  const paths = records.map((record) => record.path).filter((path): path is string => typeof path === "string");
  if (paths.length !== records.length || paths.some((path, index) => index > 0 && paths[index - 1]! >= path)) return [finding("source-ledger-record-order", "source ledger tree records must be unique and bytewise path-sorted")];
  const treeKeys = ["gitObjectId", "mode", "objectType", "path"];
  const blobKeys = ["adoptability", "artifactClass", "byteCount", "disposition", "existingKnowledgeRefs", "gitObjectId", "inspectionStatus", "legalDisposition", "licenseEvidence", "mode", "objectType", "ownerSkill", "path", "reason", "sha256", "techniqueIds", "thirdPartyMarker"];
  const artifactClasses = new Set(["root-support", "skill", "agent-yaml", "prompt", "binary-asset", "vendored-minified-js", "demo-html", "authored-code", "reference/article", "source-metadata", "license-notice"]);
  const exactRecordKeys = (record: Record<string, unknown>, keys: string[]) => { const actual = Object.keys(record).filter((key) => key !== "provenance").sort(); return JSON.stringify(actual) === JSON.stringify(keys); };
  const invalidRecord = records.some((record) => {
    const path = String(record.path); const blob = record.objectType === "blob";
    if (!/^[0-9a-f]{40}$/.test(String(record.gitObjectId)) || !["blob", "tree"].includes(String(record.objectType)) || !/^agent-skills\/web-design\/(?!.*(?:^|\/)\.\.(?:\/|$))[^/].*$/.test(path)) return true;
    if (record.provenance !== undefined && record.provenance !== "neuform-synchronized") return true;
    if (!blob) return !exactRecordKeys(record, treeKeys) || record.mode !== "040000";
    const rootSupport = record.artifactClass === "root-support" && record.ownerSkill === null;
    const owned = typeof record.ownerSkill === "string" && path.startsWith(`agent-skills/web-design/${record.ownerSkill}/`);
    return !exactRecordKeys(record, blobKeys) || !["100644", "100755"].includes(String(record.mode)) || !/^[0-9a-f]{64}$/.test(String(record.sha256)) || !Number.isInteger(record.byteCount) || (record.byteCount as number) < 0 || !artifactClasses.has(String(record.artifactClass)) || (!rootSupport && !owned);
  });
  if (invalidRecord) return [finding("source-ledger-invalid", "source records must match the fixed metadata-only schema with valid Git and SHA-256 fields")];
  const blobs = records.filter((record) => record.objectType === "blob");
  const text = blobs.filter((record) => !["binary-asset", "root-support"].includes(String(record.artifactClass)));
  if (manifest.treeRecordCount !== records.length || manifest.blobRecordCount !== blobs.length || manifest.textArtifactCount !== text.length || manifest.skillRecordCount !== decisions.length || manifest.parts.some((part) => part.recordCount !== (part.kind === "tree" ? records.length : decisions.length))) return [finding("source-ledger-count-drift", "source ledger root or part counts do not reconcile with its records")];
  const count = (field: "category" | "disposition", value: string) => decisions.filter((row) => row[field] === value).length;
  if (["core", "style", "vendor", "composite"].some((key) => (manifest.categoryCounts[key] ?? 0) !== count("category", key)) || ["adopted", "covered-existing", "rejected", "out-of-scope"].some((key) => (manifest.dispositionCounts[key] ?? 0) !== count("disposition", key))) return [finding("source-ledger-count-drift", "source ledger category or disposition totals do not reconcile")];
  const decisionSkills = decisions.map((row) => row.skill).sort();
  if (decisions.some((row, index) => index > 0 && decisions[index - 1]!.skill >= row.skill)) return [finding("source-ledger-record-order", "source ledger skill decisions must be unique and bytewise skill-sorted")];
  const ownerSkills = records.filter((record) => record.artifactClass === "skill").map((record) => record.ownerSkill).filter((value): value is string => typeof value === "string").sort();
  if (new Set(decisionSkills).size !== decisions.length || JSON.stringify(decisionSkills) !== JSON.stringify(ownerSkills)) return [finding("source-ledger-decision-invalid", "source ledger skill decisions must uniquely match its skill records")];
  for (const row of decisions) {
    const refsLive = row.existingKnowledgeRefs.every((ref) => /^knowledge\/[^/].*\.md$/.test(ref) && input.files.includes(ref.slice("knowledge/".length)));
    const idsValid = row.techniqueIds.every((id) => /^[A-Z][A-Z0-9]*-\d{2}$/.test(id)) && new Set(row.techniqueIds).size === row.techniqueIds.length;
    const rejectedMapped = ["rejected", "out-of-scope"].includes(row.disposition) && row.techniqueIds.length + row.existingKnowledgeRefs.length > 0;
    if (!row.reason.trim() || !idsValid || !refsLive || (row.disposition === "adopted" && row.techniqueIds.length === 0) || (row.disposition === "covered-existing" && row.existingKnowledgeRefs.length === 0) || rejectedMapped) return [finding("source-ledger-decision-invalid", `source ledger decision '${row.skill}' has an incomplete disposition mapping`)];
  }
  const validRecordSemantics = records.filter((record) => record.objectType === "blob").every((record) => {
    const ids = Array.isArray(record.techniqueIds) ? record.techniqueIds : [];
    const refs = Array.isArray(record.existingKnowledgeRefs) ? record.existingKnowledgeRefs : [];
    const baseValid = ["adopted", "covered-existing", "rejected", "out-of-scope"].includes(String(record.disposition)) && typeof record.reason === "string" && record.reason.trim() !== "" && ids.every((id) => typeof id === "string" && /^[A-Z][A-Z0-9]*-\d{2}$/.test(id)) && refs.every((ref) => typeof ref === "string") && typeof record.thirdPartyMarker === "boolean";
    if (!baseValid) return false;
    if (record.ownerSkill === null) return record.artifactClass === "root-support" && record.disposition === "rejected" && ids.length + refs.length === 0 && record.reason === "Root support metadata only" && record.adoptability === "not-adoptable" && record.inspectionStatus === "statically-inspected" && record.thirdPartyMarker === false && record.licenseEvidence === "repository-support-only" && record.legalDisposition === "metadata-only-quarantine";
    return true;
  });
  if (!validRecordSemantics) return [finding("source-ledger-record-drift", "source ledger blob semantics violate their closed disposition or provenance contract")];
  const decisionBySkill = new Map(decisions.map((row) => [row.skill, row]));
  for (const record of records.filter((row) => row.objectType === "blob" && typeof row.ownerSkill === "string")) {
    const decision = decisionBySkill.get(record.ownerSkill as string);
    if (decision === undefined) return [finding("source-ledger-record-drift", `source record '${String(record.path)}' has no skill decision`)];
    const kind = String(record.artifactClass); const neuform = record.provenance === "neuform-synchronized";
    const quarantined = neuform || ["rejected", "out-of-scope"].includes(decision.disposition) || ["agent-yaml", "binary-asset", "license-notice", "source-metadata", "vendored-minified-js"].includes(kind);
    const expectedInspection = neuform || ["binary-asset", "vendored-minified-js"].includes(kind) ? "not-inspected" : "statically-inspected";
    const expectedThirdParty = neuform || ["binary-asset", "license-notice", "source-metadata", "vendored-minified-js"].includes(kind);
    const expectedLicense = kind === "license-notice" ? "embedded-license-notice" : neuform ? "license-unverified-quarantine" : ["binary-asset", "source-metadata"].includes(kind) ? "no-per-asset-license-field" : kind === "vendored-minified-js" ? "license-unverified-quarantine" : "repository-root-MIT";
    const expectedLegal = kind === "license-notice" ? "license-evidence-only" : quarantined ? "metadata-only-quarantine" : "idea-only-independent-rewrite";
    if (record.disposition !== decision.disposition || record.reason !== decision.reason || JSON.stringify(record.techniqueIds) !== JSON.stringify(decision.techniqueIds) || JSON.stringify(record.existingKnowledgeRefs) !== JSON.stringify(decision.existingKnowledgeRefs) || record.adoptability !== (quarantined ? "not-adoptable" : "idea-only") || record.inspectionStatus !== expectedInspection || record.thirdPartyMarker !== expectedThirdParty || record.licenseEvidence !== expectedLicense || record.legalDisposition !== expectedLegal) return [finding("source-ledger-record-drift", `source record '${String(record.path)}' disagrees with its decision or provenance contract`)];
  }
  const duplicateGroups = new Map<string, string[]>();
  for (const record of blobs) { const hash = String(record.sha256); duplicateGroups.set(hash, [...(duplicateGroups.get(hash) ?? []), String(record.path)]); }
  const duplicates = [...duplicateGroups].filter(([, group]) => group.length > 1).map(([sha256, group]) => ({ sha256, paths: group.sort() })).sort((left, right) => left.sha256.localeCompare(right.sha256));
  if (JSON.stringify(manifestRaw.duplicateBlobGroups) !== JSON.stringify(duplicates)) return [finding("source-ledger-duplicate-drift", "source ledger duplicate blob groups do not reconcile")];
  return [];
}
