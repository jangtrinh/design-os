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

/**
 * Shared entry glue for workflow selection and design skill routing.
 * Composed into Claude and Antigravity non-init wrappers and the Codex block.
 */
export function buildDesignEntryGlue(knowledgeRoot?: string): string {
  const root = knowledgeRoot !== undefined && knowledgeRoot !== "" ? toFwdSlash(knowledgeRoot) : "";
  const needRoutingPath = root !== "" ? `\`${root}/need-routing.md\`` : "`knowledge/need-routing.md`";
  const buildLoopPath = root !== "" ? `\`${root}/build-loop.md\`` : "`knowledge/build-loop.md`";

  return [
    "### Workflow routing and design entry",
    "",
    `- When handling a natural-language request, read ${needRoutingPath} before selecting a workflow; an explicitly requested workflow remains authoritative.`,
    "- Skip design workflows only for pure nonvisual tasks (pure logic, data, configuration, test, or meta with no rendered UI change).",
    "- For mixed tasks (e.g. backend data or SQL paired with visual chart rendering, layout flicker, or typography and spacing adjustments), split the task and activate the design workflow and skill for the visual surface. No System One classifier authority or confidence threshold in ui overrides explicit visual intent.",
    "- For any work creating, changing, or reviewing a rendered UI, load the live installed `es:designer` skill (or `es-designer` as exposed in the skill catalog) before implementation or review. Include this requirement in generated instructions for delegated UI work as well.",
    "- Project brief, design tokens, and project context take precedence. Specialist native and Figma rules own their respective platforms, and existing design skill providers are respected. Do not force generic UI defaults on native or canvas surfaces.",
    `- If \`es:designer\` is absent, follow the bundled workflow/craft skill and the build-loop at ${buildLoopPath}. Do not attempt to install skills, reference private machine paths, emit missing skill errors, or block execution.`,
  ].join("\n");
}

/**
 * Common bounded routing-rule builder for Claude (.claude/rules/design-os-routing.md)
 * and Antigravity (.agent/rules/design-os-routing.md).
 *
 * Frontmatter carries description + trigger: always_on.
 * (Claude ignores unrecognized frontmatter without paths => unconditional;
 * Antigravity requires trigger: always_on).
 */
export function buildRoutingRule(templatesRoot: string, knowledgeRoot?: string): string {
  const fwdTemplates = toFwdSlash(templatesRoot);

  return [
    "---",
    `description: ${yamlQuote("ease-design natural-language routing and workflow bootstrap")}`,
    "trigger: always_on",
    "---",
    "",
    "# ease-design routing bootstrap",
    "",
    "This project uses ease-design for interface design, craft workflows, and quality gates.",
    "",
    "### Available template directories",
    "",
    `- Workflows: \`${fwdTemplates}/workflows\``,
    `- Craft skills: \`${fwdTemplates}/skills\``,
    `- Journeys: \`${fwdTemplates}/journeys\``,
    "",
    buildDesignEntryGlue(knowledgeRoot),
    "",
    "### Command discovery",
    "",
    "A workflow label is not a binary subcommand. Before running any `ui` commands called for by a workflow, inspect the real binary schema:",
    "",
    "// turbo",
    "```bash",
    "ui schema --json",
    "```",
    "",
  ].join("\n");
}
