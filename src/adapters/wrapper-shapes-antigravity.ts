import { buildClaudeSkill } from "./wrapper-shapes-claude.js";
import { buildKnowledgeAnchor, INIT_VERB_DESCRIPTION, toFwdSlash, yamlQuote } from "./wrapper-shapes-shared.js";

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
  if (ACTIVATION_ONLY_WORKFLOWS.has(verb)) {
    return [
      "---", `description: ${yamlQuote(`ease-design ui-${verb} — ${summary}`)}`, "---", "",
      `# ui-${verb}`, "", "Follow the runtime-neutral workflow at:", `\`${template}\``,
      buildKnowledgeAnchor(knowledgeRoot),
      "Create the typed activation request required by that workflow, then run its real entry check:",
      "", "// turbo", "```bash",
      "ui knowledge activate capability-activation-request.json --json > capability-activation.json",
      "```", "",
    ].join("\n");
  }

  return [
    "---", `description: ${yamlQuote(`ease-design ui-${verb} — ${summary}`)}`, "---", "",
    `# ui-${verb}`, "", "Follow the runtime-neutral workflow at:", `\`${template}\``,
    buildKnowledgeAnchor(knowledgeRoot),
    "When the workflow calls for a `ui` command, run it via the shell:",
    "", "// turbo", "```bash", `ui ${verb === "from-ref" ? "from-ref" : verb} "$ARGS"`, "```", "",
  ].join("\n");
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
