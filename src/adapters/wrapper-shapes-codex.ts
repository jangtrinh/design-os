import { WORKFLOW_VERBS } from "./templates.js";
import { toFwdSlash } from "./wrapper-shapes-shared.js";

export const CODEX_SENTINEL_BEGIN = "<!-- BEGIN ease-design -->";
export const CODEX_SENTINEL_END = "<!-- END ease-design -->";

/** Build the sentinel-bracketed block appended/upserted into `AGENTS.md`. */
export function buildCodexBlock(
  templatesRoot: string,
  hashes: Record<string, string>,
  knowledgeRoot?: string,
): string {
  const templateRoot = toFwdSlash(templatesRoot);
  const hashLines = Object.keys(hashes).sort().map((key) => `  ${key}: ${hashes[key] ?? ""}`).join("\n");
  const knowledgeLine = knowledgeRoot !== undefined && knowledgeRoot !== ""
    ? `Templates reference \`knowledge/<file>\` — resolve those against \`${toFwdSlash(knowledgeRoot)}\`. `
    : "";

  return [
    CODEX_SENTINEL_BEGIN, "## ease-design", "",
    "This project uses ease-design. Workflows, skills, and journeys live under",
    `\`${templateRoot}/workflows/\`, \`${templateRoot}/skills/\`, and \`${templateRoot}/journeys/\`.`,
    "Invoke them by following the relevant Markdown file when the user asks for",
    "design work (journeys cover onboarding/daily/delivery sequencing across",
    `multiple commands). ${knowledgeLine}The \`ui\` binary handles all non-LLM`,
    "work (autofix, layout validation, token compilation, color math). Before",
    "forming a `ui` invocation, run `ui schema --json` for the machine-readable",
    "signature (positionals, flags, enums, error codes) of every (sub)command.", "",
    "Available slash-commands when proxied:",
    `${WORKFLOW_VERBS.map((verb) => `/ui:${verb}`).join(" ")}.`, "",
    "Template hashes (sha256, for drift detection):", hashLines, "",
    "Do not edit content between the BEGIN/END markers — it is regenerated",
    "by `ui init --runtime codex --force`.", CODEX_SENTINEL_END,
  ].join("\n");
}
