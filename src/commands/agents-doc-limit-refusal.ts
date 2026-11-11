/**
 * The refusal of `ui agents init` when the AGENTS.md it would leave is larger than Codex reads: what would be cut, the
 * three numbers, and the ways out, each a command that succeeds as printed (a run without Codex, a roster that fits).
 */
import { ROSTER } from "../core/agents-gen.js";
import type { AgentRole } from "../core/agents-gen.js";
import { CODEX_PROJECT_DOC_MAX_BYTES, docSizes } from "../core/agents-doc-limit.js";
import { codexSection } from "../core/agents-targets.js";
import type { TargetContext } from "../core/agents-targets.js";
import type { Runtime } from "../core/init-stub.js";

export interface RefusalInput {
  host: string | null;
  roles: readonly AgentRole[];
  ctx: TargetContext;
  runtimes: readonly Runtime[];
  /** The `--runtimes` value of the refused run, or null when it used the default. */
  runtimesFlag: string | null;
  force: boolean;
}

/** Every non-empty subset of the roles, the biggest first, in roster order within a size. */
function subsets(roles: readonly AgentRole[]): AgentRole[][] {
  const out: AgentRole[][] = [];
  for (let mask = (1 << roles.length) - 1; mask > 0; mask--) out.push(roles.filter((_, i) => (mask & (1 << i)) !== 0));
  return out.sort((a, b) => b.length - a.length);
}

/** null when the file that would result fits. */
export function overLimitMessage(i: RefusalInput): string | null {
  const sizes = docSizes(i.host, codexSection(i.ctx, i.roles));
  if (sizes.total <= CODEX_PROJECT_DOC_MAX_BYTES) return null;
  const force = i.force ? " --force" : "";
  const ways: string[] = [];
  const rest = i.runtimes.filter((r) => r !== "codex");
  if (rest.length > 0) ways.push(`ui agents init --runtimes ${rest.join(",")}${force}`);
  const smaller = subsets(i.roles).filter((s) => s.length < i.roles.length).find((s) => docSizes(i.host, codexSection(i.ctx, s)).total <= CODEX_PROJECT_DOC_MAX_BYTES);
  if (smaller !== undefined) ways.push(`ui agents init${i.runtimesFlag === null ? "" : ` --runtimes ${i.runtimesFlag}`}${force} --roster ${ROSTER.filter((r) => smaller.includes(r)).join(",")}`);
  return [
    `Codex would read only the first ${CODEX_PROJECT_DOC_MAX_BYTES} bytes of AGENTS.md and the agents section would be cut, so nothing was written: the text the project keeps outside the section is ${sizes.outside} bytes, the section is ${sizes.section} bytes, and the limit is ${CODEX_PROJECT_DOC_MAX_BYTES} bytes.`,
    "Ways out:",
    ...ways.map((w) => `  ${w}`),
    "  or shorten the project's own text in AGENTS.md, then run the command again",
  ].join("\n");
}
