/**
 * Everything `ui agents init` can refuse before it writes, as one pure question: given the AGENTS.md on disk, the
 * runtimes and the roles of a run, would it write, or what is refused and what can the reader do. `ui agents init` asks
 * it before writing; `ui agents check` asks it before printing a command, so it never prints a command the pre-flight
 * of `ui agents init` would refuse.
 */
import { classifySectionMarkers } from "../core/adapter-section-markers.js";
import { CODEX_PROJECT_DOC_MAX_BYTES, docSizes, limitFacts, shrinkAction } from "../core/agents-doc-limit.js";
import { ROSTER } from "../core/agents-gen.js";
import type { AgentRole } from "../core/agents-gen.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END, codexSection } from "../core/agents-targets.js";
import type { TargetContext } from "../core/agents-targets.js";
import type { Runtime } from "../core/init-stub.js";

export interface Refusal {
  code: "AGENTS_SECTION_MALFORMED" | "AGENTS_DOC_OVER_LIMIT";
  /** What was found or measured, as a sentence, with no command. */
  facts: string;
  /** What a person does by hand about it, in words, with the number that makes it actionable. */
  action: string;
}

/** null when a run for these runtimes and roles would write; the Codex section is the only target that can be refused. */
export function preflight(host: string | null, ctx: TargetContext, runtimes: readonly Runtime[], roles: readonly AgentRole[]): Refusal | null {
  if (!runtimes.includes("codex")) return null;
  if (host !== null) {
    const shape = classifySectionMarkers(host, CODEX_AGENTS_BEGIN, CODEX_AGENTS_END);
    if (shape.shape === "malformed") {
      return { code: "AGENTS_SECTION_MALFORMED", facts: `the design-os agents section of AGENTS.md has ${shape.begins} start marker line(s) and ${shape.ends} end marker line(s)`, action: "make them one start line followed by one end line, or remove them" };
    }
  }
  const sizes = docSizes(host, codexSection(ctx, roles));
  if (sizes.total <= CODEX_PROJECT_DOC_MAX_BYTES) return null;
  return { code: "AGENTS_DOC_OVER_LIMIT", facts: limitFacts(sizes, true), action: shrinkAction(sizes) };
}

/** The refusal of `ui agents init`: the facts, that nothing was written, and the ways out, each a command that is not refused. `run.force` is true when the run was forced or when a target the way out would write exists. */
export function refusalText(r: Refusal, run: { runtimes: readonly Runtime[]; roles: readonly AgentRole[]; force: boolean }): string {
  if (r.code === "AGENTS_SECTION_MALFORMED") return `${r.facts}, so nothing was written; ${r.action}, then run the command again`;
  const rest = run.runtimes.filter((x) => x !== "codex");
  const roster = ROSTER.filter((x) => run.roles.includes(x)).join(",");
  const other = rest.length > 0 ? [`  ui agents init${run.force ? " --force" : ""} --runtimes ${rest.join(",")} --roster ${roster}`] : [];
  return [`${r.facts}; nothing was written.`, "Ways out:", ...other, `  or ${r.action}, then run the command again`].join("\n");
}
