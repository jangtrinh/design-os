/** Pure parser for the future web-technique catalog and its Markdown cards. */
const TAXONOMIES = new Set(["layout", "composition", "typography", "color", "motion", "interaction", "content", "performance", "accessibility", "webgl", "effects"]);
const CATALOG_KEYS = ["schemaVersion", "sourceLedger", "techniques"];
const TECHNIQUE_KEYS = ["id", "name", "taxonomy", "card", "when", "requires", "handoffSkill", "applicableWorkflows"];
const object = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);

export interface WebTechnique { id: string; name: string; taxonomy: string; card: string; when: readonly string[]; requires: readonly string[]; handoffSkill: string | null; applicableWorkflows: readonly string[]; }
export interface WebTechniqueCatalog { sourceLedger: string; techniques: readonly WebTechnique[]; }
export const REQUIRED_CARD_HEADINGS = ["Purpose", "Trigger", "Mechanism", "Anti-use", "Required fallback", "Responsive and input behavior", "Lifecycle and performance downgrade", "Verification", "Failure Modes"];
const withoutFencedBlocks = (content: string) => content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");

export function parseWebTechniqueCatalog(json: string): WebTechniqueCatalog | null {
  let raw: unknown; try { raw = JSON.parse(json); } catch { return null; }
  const value = object(raw);
  if (value === null || !exactKeys(value, CATALOG_KEYS) || value.schemaVersion !== 1 || typeof value.sourceLedger !== "string" || !Array.isArray(value.techniques)) return null;
  const techniques: WebTechnique[] = [];
  for (const rawTechnique of value.techniques) {
    const technique = object(rawTechnique);
    if (technique === null || !exactKeys(technique, TECHNIQUE_KEYS) || typeof technique.id !== "string" || !/^[A-Z][A-Z0-9]*-\d{2}$/.test(technique.id) || typeof technique.name !== "string" || !TAXONOMIES.has(technique.taxonomy as string) || typeof technique.card !== "string" || !Array.isArray(technique.when) || !Array.isArray(technique.requires) || !(technique.handoffSkill === null || typeof technique.handoffSkill === "string") || !Array.isArray(technique.applicableWorkflows) || !technique.when.every((value) => typeof value === "string" && value.trim() !== "") || !technique.requires.every((value) => typeof value === "string") || !technique.applicableWorkflows.every((value) => typeof value === "string")) return null;
    techniques.push({ id: technique.id, name: technique.name, taxonomy: technique.taxonomy as string, card: technique.card, when: technique.when as string[], requires: technique.requires as string[], handoffSkill: technique.handoffSkill as string | null, applicableWorkflows: technique.applicableWorkflows as string[] });
  }
  return { sourceLedger: value.sourceLedger, techniques };
}

export function missingTechniqueHeadings(content: string, id: string): string[] {
  content = withoutFencedBlocks(content);
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^## ${escaped}(?:\\s+[^\\n]*)?\\n`, "m").exec(content);
  const tail = match === null ? "" : content.slice(match.index + match[0].length);
  const next = tail.search(/^## /m);
  const section = next === -1 ? tail : tail.slice(0, next);
  return REQUIRED_CARD_HEADINGS.filter((heading) => {
    const headingMatch = new RegExp(`^### ${heading}[ \\t]*\\n`, "m").exec(section);
    if (headingMatch === null) return true;
    const bodyTail = section.slice(headingMatch.index + headingMatch[0].length);
    const nextHeading = bodyTail.search(/^#{1,3} /m);
    return (nextHeading === -1 ? bodyTail : bodyTail.slice(0, nextHeading)).trim() === "";
  });
}

export function techniqueSectionIds(content: string): string[] {
  return [...withoutFencedBlocks(content).matchAll(/^## ([A-Z][A-Z0-9]*-\d{2})(?:\s|$)/gm)].map((match) => match[1]!).sort();
}
