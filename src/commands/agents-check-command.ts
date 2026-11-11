/**
 * `ui agents check` — the findings-linter over the generated agents of every runtime that has a target on disk.
 * It re-renders each target from the live templates and the ontology file and compares; it writes nothing.
 *   agent-stale          (error)   a Claude Code file differs outside its area block from its template render (unchanged)
 *   AGENTS_ROSTER_DRIFT  (error)   an Antigravity file or the Codex section differs outside its block from the roster, or
 *                                  a role one runtime holds is missing from another
 *   ONTOLOGY_STALE       (error)   an area block differs from a fresh render of the ontology file
 *   agent-unknown-role   (warning) a stamped target's roster-role is not in the roster
 *   no-agents            (warning) no stamped agent of any runtime (agents are opt-in)
 * One finding per file; the cure it names reproduces exactly the runtimes and roles found, never more.
 */
import { join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { countBySeverity } from "../core/finding-schema.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { CODEX_PROJECT_DOC_MAX_BYTES } from "../core/agents-doc-limit.js";
import { ROSTER } from "../core/agents-gen.js";
import type { AgentRole } from "../core/agents-gen.js";
import { blocksIn, stripBlocks } from "../core/agents-areas-block.js";
import { agentFile, codexSection } from "../core/agents-targets.js";
import { RUNTIMES } from "../core/init-stub.js";
import type { Runtime } from "../core/init-stub.js";
import { isFail, isRosterRole, loadProject, resolveRoot, scanAntigravity, scanClaude, scanCodex, targetContext } from "./agents-shared.js";
import type { ScannedAgent } from "./agents-shared.js";

interface AgentFinding { checkId: string; severity: "error" | "warning"; message: string }
const DRIFT = "AGENTS_ROSTER_DRIFT";
const STALE = "ONTOLOGY_STALE";

/** The command that regenerates what is on disk and nothing else: the runtimes found and, when a subset, the roles found. */
function cure(found: readonly Runtime[], roles: ReadonlySet<AgentRole>): string {
  const subset = ROSTER.some((r) => !roles.has(r));
  return `ui agents init --force --runtimes ${found.join(",")}${subset ? ` --roster ${ROSTER.filter((r) => roles.has(r)).join(",")}` : ""}`;
}

export function runCheck(parsed: ParsedArgs): CommandResult {
  const sub = "agents check";
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const root = resolveRoot(parsed.flags["dir"]);
  const agentsDir = join(root, ".claude", "agents");
  const claude = scanClaude(root);
  if (isFail(claude)) return err(claude.code, claude.message);
  const antigravity = scanAntigravity(root);
  if (isFail(antigravity)) return err(antigravity.code, antigravity.message);
  const codex = scanCodex(root);
  if (codex !== null && isFail(codex)) return err(codex.code, codex.message);
  const malformed = codex !== null && "malformed" in codex ? codex.malformed : null;
  const section = codex === null || isFail(codex) || "malformed" in codex || codex.roles.length === 0 ? null : codex;

  const found: Runtime[] = RUNTIMES.filter((r) => (r === "claude" ? claude.length > 0 : r === "antigravity" ? antigravity.length > 0 : section !== null));
  const findings: AgentFinding[] = [];
  if (malformed !== null) findings.push({ checkId: "AGENTS_SECTION_MALFORMED", severity: "error", message: `the design-os agents section of AGENTS.md has ${malformed.begins} start marker line(s) and ${malformed.ends} end marker line(s), so it is not checked and is not regenerated; make them one start line followed by one end line, or remove them` });
  if (found.length === 0) {
    if (malformed === null) findings.push({ checkId: "no-agents", severity: "warning", message: `no design-os agents under '${agentsDir}' — agents are opt-in; run 'ui agents init' to create them` });
  } else {
    const proj = loadProject(parsed.flags["dir"]);
    if (isFail(proj)) return err(proj.code, proj.message);
    const ctx = targetContext(proj.root, proj.project);
    if (isFail(ctx)) return err(ctx.code, ctx.message);
    if (ctx.view.state === "notCurrent") findings.push({ checkId: STALE, severity: "error", message: `the ontology file is not current, so the area blocks cannot be trusted: ${ctx.view.sentence}${ctx.view.next === null ? "" : `. Next: ${ctx.view.next}`}` });
    const rolesOf = new Map<Runtime, Set<AgentRole>>(found.map((r) => [r, new Set<AgentRole>()]));
    const unknownRole = (what: string, role: string): void => { findings.push({ checkId: "agent-unknown-role", severity: "warning", message: `${what} carries roster-role '${role}', which is not in the roster (${ROSTER.join(", ")})` }); };
    const files = (runtime: "claude" | "antigravity", list: ScannedAgent[]): { a: ScannedAgent; role: AgentRole }[] => list.flatMap((a) => {
      if (!isRosterRole(a.stamp.role)) { unknownRole(`'${a.name}.md'`, a.stamp.role); return []; }
      rolesOf.get(runtime)?.add(a.stamp.role);
      return [{ a, role: a.stamp.role }];
    });
    const claudeFiles = files("claude", claude);
    const antigravityFiles = files("antigravity", antigravity);
    const sectionRoles: AgentRole[] = [];
    for (const r of section?.roles ?? []) {
      if (isRosterRole(r)) { sectionRoles.push(r); rolesOf.get("codex")?.add(r); }
      else unknownRole("the design-os agents section of AGENTS.md", r);
    }
    const union = new Set<AgentRole>([...rolesOf.values()].flatMap((s) => [...s]));
    const heal = cure(found, union);
    // "Differs outside the block" and "block differs" are judged apart: outside is the roster, inside is the ontology.
    const judge = (rel: string, label: string, text: string, expected: string, outsideCode: string, outsideMessage: string): void => {
      if (stripBlocks(text) !== stripBlocks(expected)) findings.push({ checkId: outsideCode, severity: "error", message: outsideMessage });
      else if (ctx.view.state !== "notCurrent" && blocksIn(text).join("") !== blocksIn(expected).join("")) findings.push({ checkId: STALE, severity: "error", message: `the area block of ${label} is not what the ontology gives now (${rel}); regenerate it: ${heal}` });
    };
    for (const { a, role } of claudeFiles) {
      judge(a.rel, `'${a.name}'`, a.text, agentFile(ctx, "claude", role).content, "agent-stale",
        `'${a.name}' (${a.stamp.role}) is stale — the file no longer matches its template render; regenerate it: ${heal}`);
    }
    for (const { a, role } of antigravityFiles) {
      judge(a.rel, `'${a.name}' for Antigravity`, a.text, agentFile(ctx, "antigravity", role).content, DRIFT,
        `'${a.rel}' (${a.stamp.role}) differs from the roster outside its area block — a hand edit, a changed template, or a renamed studio or project; regenerate it: ${heal}`);
    }
    if (section !== null && section.bytes > CODEX_PROJECT_DOC_MAX_BYTES) findings.push({ checkId: "AGENTS_DOC_OVER_LIMIT", severity: "error", message: `AGENTS.md is ${section.bytes} bytes and Codex reads only the first ${CODEX_PROJECT_DOC_MAX_BYTES} bytes, so the agents section may be cut; shorten the project's own text in AGENTS.md` });
    if (section !== null) {
      judge("AGENTS.md", "the design-os agents section of AGENTS.md", section.text, codexSection(ctx, sectionRoles), DRIFT,
        `the design-os agents section of AGENTS.md differs from the roster outside its area blocks — a hand edit, a changed template, or a renamed studio or project; regenerate it: ${heal}`);
    }
    for (const runtime of found) {
      const missing = ROSTER.filter((r) => union.has(r) && !rolesOf.get(runtime)?.has(r));
      if (missing.length > 0) findings.push({ checkId: DRIFT, severity: "error", message: `the ${runtime} agents lack the role ${missing.join(", ")} that another runtime holds, so the runtimes do not share one roster; regenerate them: ${heal}` });
    }
  }

  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.checkId.localeCompare(b.checkId) || a.message.localeCompare(b.message));
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const { warningCount } = countBySeverity(findings);
  const exitCode = errorCount > 0 ? 1 : 0;
  const without = found.length === 0 ? [] : RUNTIMES.filter((r) => !found.includes(r));

  if (parsed.json) return okJsonWithExit(sub, { dir: agentsDir, findings, errorCount, warningCount, runtimesChecked: found, runtimesWithoutTargets: without }, exitCode);
  const lines = findings.length === 0
    ? [`agents check: ${agentsDir} — 0 findings.`]
    : [`agents check: ${agentsDir} — ${errorCount} error(s), ${warningCount} warning(s)`, ...findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]: ${f.message}`)];
  if (without.length > 0) lines.push(`checked: ${found.join(", ")}; no generated target found for: ${without.join(", ")}`);
  return { exitCode, stdout: lines.join("\n") + "\n" };
}
