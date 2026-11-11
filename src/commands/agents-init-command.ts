/**
 * `ui agents init` — one roster (templates/agents/<role>.md) rendered to each selected runtime's target: Claude Code
 * (.claude/agents/<name>.md), Antigravity (.agent/skills/design-os-agent-<name>/SKILL.md) and Codex (the design-os agents
 * section of AGENTS.md, written through the upsert-section artifact, so the text around it is never rewritten). Each
 * agent carries the generated ontology-areas block. The default of --runtimes is the runtimes the project already
 * holds a target for, or the RUNTIMES constant when it holds none. All-or-nothing: an existing target without --force is refused before anything is written.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { AdapterWriteError, findSentinelBlock, writeAdapterArtifacts } from "../core/adapter-writer.js";
import type { AdapterArtifact } from "../adapters/index.js";
import { ROSTER } from "../core/agents-gen.js";
import type { AgentRole } from "../core/agents-gen.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END, CODEX_REL, agentFile, codexSection, plainRender } from "../core/agents-targets.js";
import { RUNTIMES } from "../core/init-stub.js";
import type { Runtime } from "../core/init-stub.js";
import { closingLines, initLines, priorOf } from "./agents-init-report.js";
import type { InitRow } from "./agents-init-report.js";
import { preflight, refusalText } from "./agents-preflight.js";
import { isFail, isRosterRole, loadProject, regenerateCommand, runtimesWithTargets, targetContext } from "./agents-shared.js";

/** `--runtimes a,b`: the named runtimes in canonical order, or the refusal that names the unknown one. */
function parseRuntimes(flag: string | boolean | undefined): Runtime[] | string {
  if (flag === undefined) return [...RUNTIMES];
  if (typeof flag !== "string") return `--runtimes requires a value — runtimes: ${RUNTIMES.join(", ")}`;
  const asked = flag.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (asked.length === 0) return `--runtimes is empty — runtimes: ${RUNTIMES.join(", ")}`;
  for (const r of asked) if (!(RUNTIMES as readonly string[]).includes(r)) return `unknown runtime '${r}' — runtimes: ${RUNTIMES.join(", ")}`;
  return RUNTIMES.filter((r) => asked.includes(r));
}

function parseRoster(flag: string | boolean | undefined): AgentRole[] | string {
  if (flag === undefined) return [...ROSTER];
  if (typeof flag !== "string") return `--roster requires a value — roles: ${ROSTER.join(", ")}`;
  const asked = flag.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (asked.length === 0) return `--roster is empty — roles: ${ROSTER.join(", ")}`;
  for (const r of asked) if (!isRosterRole(r)) return `unknown roster role '${r}' — roles: ${ROSTER.join(", ")}`;
  return ROSTER.filter((r) => asked.includes(r));
}

export function runInit(parsed: ParsedArgs): CommandResult {
  const sub = "agents init";
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["dir", "roster", "force", "runtimes"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const proj = loadProject(parsed.flags["dir"]);
  if (isFail(proj)) return err(proj.code, proj.message);
  const ctx = targetContext(proj.root, proj.project);
  if (isFail(ctx)) return err(ctx.code, ctx.message);
  // Without --runtimes the run regenerates what the project already holds; a project with no target gets every runtime.
  const held = runtimesWithTargets(proj.root);
  if (isFail(held)) return err(held.code, held.message);
  const defaulted = parsed.flags["runtimes"] === undefined && held.length > 0;
  const runtimes = defaulted ? held : parseRuntimes(parsed.flags["runtimes"]);
  if (typeof runtimes === "string") return err("BAD_ARG", runtimes);
  const withoutTarget = RUNTIMES.filter((r) => !runtimes.includes(r) && !held.includes(r));
  const roles = parseRoster(parsed.flags["roster"]);
  if (typeof roles === "string") return err("BAD_ARG", roles);

  const rows: InitRow[] = [];
  const artifacts: AdapterArtifact[] = [];
  for (const runtime of runtimes) {
    if (runtime === "codex") {
      const section: AdapterArtifact = { mode: "upsert-section", absPath: join(proj.root, CODEX_REL), content: codexSection(ctx, roles), sentinelBegin: CODEX_AGENTS_BEGIN, sentinelEnd: CODEX_AGENTS_END };
      const prior = priorOf(section);
      for (const role of roles) rows.push({ runtime, role, name: plainRender(ctx, role).name, path: join(proj.root, CODEX_REL), written: true, ...prior });
      artifacts.push(section);
      continue;
    }
    for (const role of roles) {
      const f = agentFile(ctx, runtime, role);
      const artifact: AdapterArtifact = { mode: "write", absPath: join(proj.root, f.rel), content: f.content };
      rows.push({ runtime, role, name: f.name, path: join(proj.root, f.rel), written: true, ...priorOf(artifact) });
      artifacts.push(artifact);
    }
  }

  // What the run would be refused for (a section that is not one start line and one end line; a file Codex would read in
  // part) is answered before anything is written.
  const file = join(proj.root, CODEX_REL);
  const refused = preflight(existsSync(file) ? readFileSync(file, "utf8") : null, ctx, runtimes, roles);
  if (refused !== null) return err(refused.code, refusalText(refused, { runtimes, roles, force: parsed.flags["force"] === true }));

  // EXISTS pre-flight — all-or-nothing, never a silent overwrite.
  if (parsed.flags["force"] !== true) {
    const existing = artifacts.filter((a) => {
      if (!existsSync(a.absPath)) return false;
      return a.mode === "write" || findSentinelBlock(readFileSync(a.absPath, "utf8"), a.sentinelBegin, a.sentinelEnd) !== null;
    }).map((a) => `'${a.absPath}'`);
    if (existing.length > 0) return err("EXISTS", `agent file(s) already exist — re-run with --force to overwrite: ${existing.join(", ")}`);
  }
  try { writeAdapterArtifacts(artifacts, { force: true }); }
  catch (e) { return err("WRITE_ERROR", `cannot write agent files: ${e instanceof AdapterWriteError || e instanceof Error ? e.message : String(e)}`); }

  // `agents` keeps the shape `ui init --with-agents` reads: the Claude Code rows. `targets` lists every runtime.
  const claude = rows.filter((r) => r.runtime === "claude").map(({ role, name, path, written, replaced, differedOutsideBlock }) => ({ role, name, path, written, replaced, differedOutsideBlock }));
  if (parsed.json) return okJson(sub, { agents: claude, targets: rows, runtimes, runtimesWithoutTarget: withoutTarget });
  const lines = initLines(rows, join(proj.root, CODEX_REL));
  if (defaulted) lines.push(`Regenerated the runtimes this project already has: ${runtimes.join(", ")}.`, ...(withoutTarget.length === 0 ? [] : [`No target yet for ${withoutTarget.join(", ")}; add them with: ui agents init --runtimes ${withoutTarget.join(",")}`]));
  if (ctx.studio === null) lines.push("hint: no studio soul — 'ui ds soul init --studio' gives your agents a studio genealogy (name: MERIDIAN → meridian-<project>)");
  lines.push(...closingLines(rows));
  if (ctx.view.state === "notCurrent") lines.push(`The ontology file is not current, so the area blocks list no area (the roster was written all the same): ${ctx.view.sentence}.`, ...(ctx.view.next === null ? [] : [`Next: ${ctx.view.next}`]), `Then: ${regenerateCommand(runtimes, roles)}`);
  else if (ctx.view.state !== "areas") lines.push("The area block of each agent says there is no ontology yet.", "Next: ui ontology build", `Then: ${regenerateCommand(runtimes, roles)}`);
  else lines.push("Next: ui agents check");
  return ok(lines.join("\n") + "\n");
}
