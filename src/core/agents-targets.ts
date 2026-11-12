/**
 * The three runtime targets of one roster (templates/agents/<role>.md), rendered from the same text:
 *   claude       .claude/agents/<name>.md                      the render, then the area block (bytes outside it are today's)
 *   antigravity  .agent/skills/design-os-agent-<name>/SKILL.md       skill frontmatter, the same body, the area block
 *   codex        the design-os agents section of AGENTS.md     one area block under the heading, then one section per role with the same body
 * Pure and fs-free; the command layer reads and writes. Every target carries the roster stamp of the role it renders, so
 * `ui agents check` can tell which role a file holds and compare it with a fresh render.
 */
import { agentName, renderAgent, ROSTER } from "./agents-gen.js";
import type { AgentRole } from "./agents-gen.js";
import { renderAreasBlock } from "./agents-areas-block.js";
import type { OntologyView } from "./agents-areas-block.js";
import type { Runtime } from "./init-stub.js";

export const CODEX_AGENTS_BEGIN = "<!-- BEGIN design-os agents -->";
export const CODEX_AGENTS_END = "<!-- END design-os agents -->";
/** The folder prefix of an agent skill: its own, so no agent name can equal a folder the kernel writes under `design-os-`. */
export const ANTIGRAVITY_AGENT_PREFIX = "design-os-agent-";
export const antigravityDir = (name: string): string => `.agent/skills/${ANTIGRAVITY_AGENT_PREFIX}${name}`;
export const claudeRel = (name: string): string => `.claude/agents/${name}.md`;
export const antigravityRel = (name: string): string => `${antigravityDir(name)}/SKILL.md`;
export const CODEX_REL = "AGENTS.md";

export interface TargetContext {
  tpls: Record<AgentRole, string>;
  knowledgeRoot: string | null;
  project: string;
  studio: string | null;
  view: OntologyView;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

/** The render of a role: the same text every runtime wraps. */
export function plainRender(ctx: TargetContext, role: AgentRole): { name: string; text: string } {
  const name = agentName(role, ctx.project, ctx.studio);
  return { name, text: renderAgent(ctx.tpls[role], { name, project: ctx.project, studio: ctx.studio, knowledgeRoot: ctx.knowledgeRoot }) };
}

/** The render split into its frontmatter description line and the body that follows the frontmatter (stamp included). */
function parts(text: string): { description: string; body: string } {
  const fm = FRONTMATTER.exec(text);
  return { description: /^description:.*$/m.exec(fm?.[1] ?? "")?.[0] ?? "description: \"\"", body: fm === null ? text : text.slice(fm[0].length) };
}

/** One file of a role for the runtimes that hold one file per agent. */
export function agentFile(ctx: TargetContext, runtime: "claude" | "antigravity", role: AgentRole): { name: string; rel: string; content: string } {
  const { name, text } = plainRender(ctx, role);
  const block = renderAreasBlock(ctx.view, runtime);
  if (runtime === "claude") return { name, rel: claudeRel(name), content: text + block };
  const { description, body } = parts(text);
  return { name, rel: antigravityRel(name), content: `---\nname: ${ANTIGRAVITY_AGENT_PREFIX}${name}\n${description}\n---\n${body}${block}` };
}

/** The design-os agents section of AGENTS.md for the given roles, in roster order; sentinels included. */
export function codexSection(ctx: TargetContext, roles: readonly AgentRole[]): string {
  const block = renderAreasBlock(ctx.view, "codex");
  const sections = ROSTER.filter((r) => roles.includes(r)).map((r) => { const { name, text } = plainRender(ctx, r); return `\n### ${name}\n${parts(text).body}`; });
  return `${CODEX_AGENTS_BEGIN}\n## design-os agents\n${block}${sections.join("")}${CODEX_AGENTS_END}`;
}

export const RUNTIME_LABEL: Record<Runtime, string> = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity" };
