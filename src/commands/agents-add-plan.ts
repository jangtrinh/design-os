/**
 * For the runtimes a default `ui agents init` left alone: which of them the command that adds them would write, and for
 * each one it would refuse, the reason as a code, the facts and the manual action in words. It asks the same pre-flight
 * the command itself runs (markers, size limit) and the same exists test, so the line the run prints is never refused.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole } from "../core/agents-gen.js";
import { CODEX_REL, agentFile } from "../core/agents-targets.js";
import type { TargetContext } from "../core/agents-targets.js";
import { RUNTIME_LABEL } from "../core/agents-targets.js";
import type { Runtime } from "../core/init-stub.js";
import { preflight } from "./agents-preflight.js";

export interface NotAddable { runtime: Runtime; code: string; words: string }
export interface AddPlan { addable: Runtime[]; notAddable: NotAddable[] }

/** `candidates` are the runtimes with no valid target; an agents section with malformed markers is refused by the pre-flight, not added. */
export function planAdd(root: string, ctx: TargetContext, candidates: readonly Runtime[], roles: readonly AgentRole[]): AddPlan {
  const file = join(root, CODEX_REL);
  const host = existsSync(file) ? readFileSync(file, "utf8") : null;
  const addable: Runtime[] = [];
  const notAddable: NotAddable[] = [];
  for (const runtime of candidates) {
    if (runtime === "codex") {
      const refused = preflight(host, ctx, ["codex"], roles);
      if (refused !== null) { notAddable.push({ runtime, code: refused.code, words: refused.code === "AGENTS_SECTION_MALFORMED" ? `The ${refused.facts.replace(/^the /, "")} and was left alone; ${refused.action}.` : `${RUNTIME_LABEL[runtime]} is not added: ${refused.facts}; ${refused.action}.` }); continue; }
      addable.push(runtime);
      continue;
    }
    const foreign = roles.map((role) => agentFile(ctx, runtime, role).rel).find((rel) => existsSync(join(root, rel)));
    if (foreign !== undefined) { notAddable.push({ runtime, code: "EXISTS", words: `${RUNTIME_LABEL[runtime]} is not added: ${foreign} was not written by this tool, so it is left alone.` }); continue; }
    addable.push(runtime);
  }
  return { addable, notAddable };
}
