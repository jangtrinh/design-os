import type { KnowledgeFinding } from "./knowledge-lint.js";
import { SOURCE_ID, parseSourceDecisions, parseSourceManifest } from "./knowledge-source-ledger-parse.js";
import { missingTechniqueHeadings, parseWebTechniqueCatalog, techniqueSectionIds } from "./knowledge-web-technique-parse.js";

export interface WebTechniqueCheckInput { ledgerJson: string | null; ledgerParts: Readonly<Record<string, string>>; catalogJson: string | null; files: readonly string[]; mdContents: Readonly<Record<string, string>>; skillNames: readonly string[]; verbSkillRefs: Readonly<Record<string, readonly string[]>>; }
const finding = (checkId: string, message: string): KnowledgeFinding => ({ checkId, severity: "error", message });

export function webTechniqueChecks(input: WebTechniqueCheckInput): KnowledgeFinding[] {
  if (input.files.some((path) => path.startsWith("web-techniques/") && path !== "web-techniques/catalog.json" && !/^web-techniques\/[a-z0-9-]+\.md$/.test(path))) return [finding("web-technique-path-invalid", "web-techniques contains a file outside its catalog.json and Markdown-card allowlist")];
  if (input.ledgerJson === null) return input.files.some((path) => path.startsWith("web-techniques/")) ? [finding("web-technique-source-ledger-missing", "web-technique knowledge requires its tracked source ledger")] : [];
  const manifest = parseSourceManifest(input.ledgerJson);
  const decisions = manifest === null ? null : parseSourceDecisions(input.ledgerParts[`sources/${SOURCE_ID}/skills.json`] ?? "", manifest.revision);
  if (manifest === null || decisions === null) return [];
  const embeddedPayload = /data:[^;\s]+;base64,|[A-Za-z0-9+/]{512,}={0,2}/;
  if ((input.catalogJson !== null && embeddedPayload.test(input.catalogJson)) || Object.entries(input.mdContents).some(([path, content]) => path.startsWith("web-techniques/") && embeddedPayload.test(content))) return [finding("web-technique-embedded-payload", "web-technique knowledge must not embed base64 or data-URI payloads")];
  const adopted = new Set(decisions.filter((row) => row.disposition === "adopted").flatMap((row) => row.techniqueIds));
  if (adopted.size === 0) return [];
  if (input.catalogJson === null) return [finding("web-technique-catalog-missing", "adopted source ledger techniques require knowledge/web-techniques/catalog.json")];
  if (!input.files.includes("web-techniques/catalog.json")) return [finding("web-technique-path-invalid", "web-technique catalog must be a regular walked file")];
  const catalog = parseWebTechniqueCatalog(input.catalogJson);
  if (catalog === null || catalog.sourceLedger !== `knowledge/sources/${SOURCE_ID}.json`) return [finding("web-technique-catalog-invalid", "web-technique catalog has an invalid shape or source ledger reference")];
  const ids = new Set<string>(); const cards = new Set<string>(); const findings: KnowledgeFinding[] = [];
  for (const technique of catalog.techniques) {
    if (ids.has(technique.id)) findings.push(finding("web-technique-catalog-duplicate", `catalog repeats technique '${technique.id}'`));
    ids.add(technique.id); cards.add(technique.card);
    if (!adopted.has(technique.id)) findings.push(finding("web-technique-catalog-id-unknown", `catalog technique '${technique.id}' is not mapped by an adopted source record`));
    const cardPath = technique.card.slice("knowledge/".length);
    if (!/^web-techniques\/[a-z0-9-]+\.md$/.test(cardPath) || !input.files.includes(cardPath)) findings.push(finding("web-technique-card-missing", `catalog technique '${technique.id}' must resolve to its declared family card`));
    const content = input.mdContents[cardPath]; const missing = content === undefined ? [] : missingTechniqueHeadings(content, technique.id);
    if (missing.length > 0) findings.push(finding("web-technique-card-anatomy", `card '${technique.card}' is missing ${missing.join(", ")}`));
    if (technique.handoffSkill !== null && !input.skillNames.includes(technique.handoffSkill)) findings.push(finding("web-technique-handoff-invalid", `catalog technique '${technique.id}' names an unregistered handoff skill`));
    if (new Set(technique.applicableWorkflows).size !== technique.applicableWorkflows.length || technique.handoffSkill === null && technique.applicableWorkflows.length > 0 || technique.handoffSkill !== null && technique.applicableWorkflows.length === 0 || technique.applicableWorkflows.some((verb) => !input.verbSkillRefs[verb]?.includes(technique.handoffSkill as string))) findings.push(finding("web-technique-workflow-invalid", `catalog technique '${technique.id}' has an unreachable handoff/workflow pair`));
  }
  for (const id of adopted) if (!ids.has(id)) findings.push(finding("web-technique-ledger-id-missing", `adopted source technique '${id}' is missing from the web-technique catalog`));
  for (const card of cards) {
    const declared = catalog.techniques.filter((technique) => technique.card === card).map((technique) => technique.id).sort();
    const actual = techniqueSectionIds(input.mdContents[card.slice("knowledge/".length)] ?? "");
    if (JSON.stringify(actual) !== JSON.stringify(declared)) findings.push(finding("web-technique-card-id-drift", `family card '${card}' technique sections do not match its catalog rows`));
  }
  for (const path of input.files.filter((path) => /^web-techniques\/[^/]+\.md$/.test(path))) {
    if (!cards.has(`knowledge/${path}`)) findings.push(finding("web-technique-card-orphan", `web-technique card '${path}' is not declared by the catalog`));
  }
  return findings;
}
