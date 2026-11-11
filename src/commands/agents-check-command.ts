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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { countBySeverity } from "../core/finding-schema.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { CODEX_PROJECT_DOC_MAX_BYTES, docSizes, limitFacts, shrinkAction } from "../core/agents-doc-limit.js";
import { preflight } from "./agents-preflight.js";
import { ROSTER } from "../core/agents-gen.js";
import type { AgentRole } from "../core/agents-gen.js";
import { blocksIn, stripBlocks } from "../core/agents-areas-block.js";
import { agentFile, codexSection } from "../core/agents-targets.js";
import { RUNTIMES } from "../core/init-stub.js";
import type { Runtime } from "../core/init-stub.js";
import { isFail, isRosterRole, loadProject, resolveRoot, scanAntigravity, scanClaude, regenerateCommand, scanCodex, targetContext } from "./agents-shared.js";
import type { ScannedAgent } from "./agents-shared.js";

interface AgentFinding { checkId: string; severity: "error" | "warning"; message: string }
const DRIFT = "AGENTS_ROSTER_DRIFT";
const STALE = "ONTOLOGY_STALE";

/** The command that regenerates what is on disk and nothing else: the runtimes found and, when a subset, the roles found. */
const cure = regenerateCommand;

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
    // A cure is printed only for the runtimes its own pre-flight would write; what would be refused is said in words.
    const rosterOfCure = ROSTER.filter((r) => union.has(r));
    const hostFile = join(root, "AGENTS.md");
    const refused = found.includes("codex") ? preflight(existsSync(hostFile) ? readFileSync(hostFile, "utf8") : null, ctx, found, rosterOfCure) : null;
    const writable = refused === null ? found : found.filter((r) => r !== "codex");
    // `target` is the runtime the finding is about: a finding about the refused Codex section gets the words, not a command.
    const heal = (what: string, target: Runtime): string => {
      const manual = refused === null ? "" : `the Codex section cannot be regenerated: ${refused.facts}; ${refused.action}`;
      if (writable.length === 0 || (refused !== null && target === "codex")) return manual;
      return `regenerate ${what}: ${cure(writable, union)}${manual === "" ? "" : `. ${manual[0]?.toUpperCase()}${manual.slice(1)}`}`;
    };
    // "Differs outside the block" and "block differs" are judged apart: outside is the roster, inside is the ontology.
    const judge = (target: Runtime, rel: string, label: string, text: string, expected: string, outsideCode: string, outsideMessage: string): void => {
      if (stripBlocks(text) !== stripBlocks(expected)) findings.push({ checkId: outsideCode, severity: "error", message: outsideMessage });
      else if (ctx.view.state !== "notCurrent" && blocksIn(text).join("") !== blocksIn(expected).join("")) findings.push({ checkId: STALE, severity: "error", message: `the area block of ${label} is not what the ontology gives now (${rel}); ${heal("it", target)}` });
    };
    for (const { a, role } of claudeFiles) {
      judge("claude", a.rel, `'${a.name}'`, a.text, agentFile(ctx, "claude", role).content, "agent-stale",
        `'${a.name}' (${a.stamp.role}) is stale — the file no longer matches its template render; ${heal("it", "claude")}`);
    }
    for (const { a, role } of antigravityFiles) {
      judge("antigravity", a.rel, `'${a.name}' for Antigravity`, a.text, agentFile(ctx, "antigravity", role).content, DRIFT,
        `'${a.rel}' (${a.stamp.role}) differs from the roster outside its area block — a hand edit, a changed template, or a renamed studio or project; ${heal("it", "antigravity")}`);
    }
    if (section !== null && section.bytes > CODEX_PROJECT_DOC_MAX_BYTES) { const sizes = docSizes(readFileSync(hostFile, "utf8"), section.text); findings.push({ checkId: "AGENTS_DOC_OVER_LIMIT", severity: "error", message: `${limitFacts(sizes, false)}; ${shrinkAction(sizes)}` }); }
    if (section !== null) {
      judge("codex", "AGENTS.md", "the design-os agents section of AGENTS.md", section.text, codexSection(ctx, sectionRoles), DRIFT,
        `the design-os agents section of AGENTS.md differs from the roster outside its area blocks — a hand edit, a changed template, or a renamed studio or project; ${heal("it", "codex")}`);
    }
    for (const runtime of found) {
      const missing = ROSTER.filter((r) => union.has(r) && !rolesOf.get(runtime)?.has(r));
      if (missing.length > 0) findings.push({ checkId: DRIFT, severity: "error", message: `the ${runtime} agents lack the role ${missing.join(", ")} that another runtime holds, so the runtimes do not share one roster; ${heal("them", runtime)}` });
    }
  }

  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.checkId.localeCompare(b.checkId) || a.message.localeCompare(b.message));
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const { warningCount } = countBySeverity(findings);
  const exitCode = errorCount > 0 ? 1 : 0;
  const without = found.length === 0 ? [] : RUNTIMES.filter((r) => !found.includes(r));

  if (parsed.json) return okJsonWithExit(sub, { dir: agentsDir, findings, errorCount, warningCount, runtimesChecked: found, runtimesWithoutTargets: without }, exitCode);
  const scope = found.length === 0 ? "" : ` (checked ${found.join(", ")}${without.length > 0 ? `; no target for ${without.join(", ")}` : ""})`;
  const lines = findings.length === 0
    ? [`agents check${scope}: ${agentsDir} — 0 findings.`]
    : [`agents check${scope}: ${agentsDir} — ${errorCount} error(s), ${warningCount} warning(s)`, ...findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]: ${f.message}`)];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}
