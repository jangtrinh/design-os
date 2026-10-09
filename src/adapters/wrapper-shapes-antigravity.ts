import { buildClaudeSkill } from "./wrapper-shapes-claude.js";
import {
  buildDesignEntryGlue,
  buildKnowledgeAnchor,
  buildSkillRefLines,
  INIT_VERB_DESCRIPTION,
  toFwdSlash,
  yamlQuote,
} from "./wrapper-shapes-shared.js";
import { VERB_SKILL_REFS } from "./skill-refs.js";

const ACTIVATION_ONLY_WORKFLOWS = new Set(["native-macos", "native-ios", "native-ipados"]);

/** Build a `.agent/workflows/ui-<verb>.md` wrapper. */
export function buildAntigravityWorkflow(
  verb: string,
  templatePath: string | null,
  knowledgeRoot?: string,
  description?: string,
): string {
  const summary = description ?? (verb === "init" ? INIT_VERB_DESCRIPTION : verb);

  if (verb === "init" || templatePath === null) {
    return [
      "---",
      `description: ${yamlQuote(`ease-design ui-init — ${description ?? INIT_VERB_DESCRIPTION}`)}`,
      "---", "", "# ui-init", "",
      "Run the ease-design initialiser for this runtime:", "", "// turbo", "```bash",
      "ui init --runtime antigravity", "```", "",
      "Pass `--force` to overwrite an existing installation.", "",
      "After `ui init` finishes:",
      "1. Run `ui onboard` and walk its checklist with the user.",
      "2. For any pending step, ask the user's approval before running the suggested",
      "   setup/install command — never install silently. `ui` only reports what is",
      "   missing; the host agent is the one that acts.",
      "3. Show `ui guide` so the user sees what design:os can do.",
      "4. For the full sequence (entry-point routing, soul, heartbeat, Figma), defer",
      "   to the `onboard` journey skill.", "",
    ].join("\n");
  }

  const template = toFwdSlash(templatePath);
  const skillRefs = VERB_SKILL_REFS[verb] ?? [];
  const skillBlock = buildSkillRefLines(skillRefs);

  const pieces = [
    "---",
    `description: ${yamlQuote(`ease-design ui-${verb} — ${summary}`)}`,
    "---",
    "",
    `# ui-${verb}`,
    "",
    "Follow the runtime-neutral workflow step-by-step at:",
    `\`${template}\``,
  ];

  const knowledgeAnchor = buildKnowledgeAnchor(knowledgeRoot);
  if (knowledgeAnchor) {
    pieces.push(knowledgeAnchor.trim());
  }

  pieces.push("", buildDesignEntryGlue(knowledgeRoot));

  if (skillBlock) {
    pieces.push(skillBlock.trim());
  }

  if (ACTIVATION_ONLY_WORKFLOWS.has(verb)) {
    pieces.push(
      "",
      "Create the typed activation request required by that workflow, then run its real entry check:",
      "",
      "// turbo",
      "```bash",
      "ui knowledge activate capability-activation-request.json --json > capability-activation.json",
      "```",
      "",
    );
  } else {
    pieces.push(
      "",
      "A workflow label is not a binary subcommand. Before running any `ui` commands called for by the workflow, inspect the real binary schema:",
      "",
      "// turbo",
      "```bash",
      "ui schema --json",
      "```",
      "",
    );
  }

  return pieces.join("\n");
}

/** Antigravity and Claude skill wrapper shapes are intentionally byte-identical. */
export function buildAntigravitySkill(
  name: string,
  templatePath: string,
  knowledgeRoot?: string,
  description?: string,
): string {
  return buildClaudeSkill(name, templatePath, knowledgeRoot, description);
}
