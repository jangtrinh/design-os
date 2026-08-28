import {
  buildKnowledgeAnchor,
  buildSkillRefLines,
  INIT_VERB_DESCRIPTION,
  toFwdSlash,
  yamlQuote,
} from "./wrapper-shapes-shared.js";

/** Build a `.claude/commands/ui/<verb>.md` wrapper. */
export function buildClaudeCommand(
  verb: string,
  templatePath: string | null,
  skillRefs: readonly string[],
  knowledgeRoot?: string,
  description?: string,
): string {
  const summary = description ?? (verb === "init" ? INIT_VERB_DESCRIPTION : verb);
  const skillBlock = buildSkillRefLines(skillRefs);

  if (verb === "init" || templatePath === null) {
    return [
      "---",
      `description: ${yamlQuote(`ease-design /ui:init — ${description ?? INIT_VERB_DESCRIPTION}`)}`,
      "---",
      "",
      "# /ui:init",
      "",
      "Run the ease-design initialiser for this runtime:",
      "",
      "```bash",
      "ui init --runtime claude",
      "```",
      "",
      "Pass `--force` to overwrite an existing installation.",
      "",
      "After `ui init` finishes:",
      "1. Run `ui onboard` and walk its checklist with the user.",
      "2. For any pending step, ask the user's approval before running the suggested",
      "   setup/install command — never install silently. `ui` only reports what is",
      "   missing; the host agent is the one that acts.",
      "3. Show `ui guide` so the user sees what design:os can do.",
      "4. For the full sequence (entry-point routing, soul, heartbeat, Figma), defer",
      "   to the `onboard` journey skill.",
      "",
    ].join("\n");
  }

  return [
    "---",
    `description: ${yamlQuote(`ease-design /ui:${verb} — ${summary}`)}`,
    "---",
    "",
    `# /ui:${verb}`,
    "",
    "Follow the runtime-neutral workflow at:",
    `\`${toFwdSlash(templatePath)}\``,
    buildKnowledgeAnchor(knowledgeRoot),
    skillBlock,
  ].join("\n");
}

/** Build a `.claude/skills/design-os-<name>/SKILL.md` wrapper. */
export function buildClaudeSkill(
  name: string,
  templatePath: string,
  knowledgeRoot?: string,
  description?: string,
): string {
  return [
    "---",
    `name: design-os-${name}`,
    `description: ${yamlQuote(description ?? name)}`,
    "---",
    "",
    "Follow the runtime-neutral skill at:",
    `\`${toFwdSlash(templatePath)}\``,
    buildKnowledgeAnchor(knowledgeRoot),
    "",
  ].join("\n");
}
