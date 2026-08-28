/** Shared pure helpers for deterministic runtime wrapper builders. */

export const INIT_VERB_DESCRIPTION = "Initialise ease-design for this project";

export function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim()}"`;
}

export function toFwdSlash(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Resolve template `knowledge/<file>` references against the installed knowledge root. */
export function buildKnowledgeAnchor(knowledgeRoot: string | undefined): string {
  if (knowledgeRoot === undefined || knowledgeRoot === "") return "";
  const root = toFwdSlash(knowledgeRoot);
  return (
    "\nThe workflow reads files under `knowledge/`. Resolve every such path " +
    `against this absolute base: \`${root}\` ` +
    `(e.g. \`knowledge/persona-index.md\` → \`${root}/persona-index.md\`).\n`
  );
}

export function buildSkillRefLines(skillRefs: readonly string[]): string {
  if (skillRefs.length === 0) return "";
  const lines = skillRefs.map(
    (skill) => `When the workflow instructs it, invoke skill \`design-os-${skill}\`.`,
  );
  return `\n${lines.join("\n")}\n`;
}
