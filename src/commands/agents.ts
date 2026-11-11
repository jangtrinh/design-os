/**
 * `ui agents` — generate + lint soul-bound, task-scoped project agents for the three runtimes (Claude Code subagents
 * under `.claude/agents/`, Antigravity skills under `.agent/skills/`, and the design-os agents section of Codex's
 * `AGENTS.md`). Pure kernel: src/core/agents-gen.ts (roster, naming, stamp), src/core/agents-targets.ts (the three
 * targets), src/core/agents-areas-block.ts (the generated ontology-areas block); knowledge: knowledge/design-agents.md.
 *
 * Opt-in by design — `ui init` only hints, unless the user passes the explicit `--with-agents` flag (the opt-in,
 * exercised at init time, Claude Code only). The emitter/linter pair: `init` renders templates/agents/<role>.md with
 * the genealogy name (studio soul `name:` × manifest name × role) and a stamp; `check` re-renders the live templates
 * and the ontology file and flags any file whose content no longer matches.
 */
import { join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { stripBlocks } from "../core/agents-areas-block.js";
import { agentFile } from "../core/agents-targets.js";
import { templateHash } from "../core/agents-gen.js";
import { isFail, isRosterRole, loadProject, resolveRoot, scanClaude, targetContext } from "./agents-shared.js";
import { runCheck } from "./agents-check-command.js";
import { runInit } from "./agents-init-command.js";

const CMD = "agents";

export const AGENTS_HELP = `ui agents — soul-bound, task-scoped project agents for Claude Code, Codex and Antigravity

Usage:
  ui agents init  [--dir <project>] [--runtimes claude,codex,antigravity] [--roster designer,curator,figma-hand] [--force] [--json]
  ui agents list  [--dir <project>] [--json]
  ui agents check [--dir <project>] [--json]

Subcommands:
  init    Render one roster to each runtime's target (opt-in; 'ui init' never runs this)
  list    Scan .claude/agents/*.md for design-os stamps → role / name / hash / fresh
  check   Findings-linter over the generated agents of every runtime found; exit 1 on error-severity findings

Targets (one roster, templates/agents/{designer,curator,figma-hand}.md, rendered to each):
  claude       .claude/agents/<name>.md
  antigravity  .agent/skills/design-os-agent-<name>/SKILL.md
  codex        the design-os agents section of AGENTS.md (the text around it is never rewritten)

Naming (genealogy — studio × project × role):
  With a studio soul ($EASE_DESIGN_HOME/studio-soul.md, frontmatter name: MERIDIAN)
  and project 'meridian-store' (design/ds.manifest.json name):
    designer   → designer-meridian-meridian-store
    curator    → curator-meridian-meridian-store
    figma-hand → figma-meridian-meridian-store
  Without a studio soul: designer-meridian-store / curator-meridian-store / figma-meridian-store
  (and init hints at 'ui ds soul init --studio'). Names are sanitized to
  ^[a-z][a-z0-9-]*$, capped at 64 chars.

Identity is RUNTIME-READ, never baked: a generated agent's first action is
'ui ds context' (which carries the project soul + the studio soul), so soul
edits propagate with zero drift. Only the NAME is baked at generate time —
rename the studio or project → 'ui agents init --force'.

Ontology areas: each agent carries one generated block, fenced by
<!-- design-os:ontology-areas:start --> and <!-- design-os:ontology-areas:end -->, that lists the areas of
design/knowledge/ontology.json with their node counts, and names the command 'ui ontology query "<your task>" --area "<area key>"'
once (the Codex section carries one block). It is the one deliberate exception to "never baked": the command regenerates it and 'check' re-renders
it from the ontology file and compares. A project with no ontology gets a block that says so and names 'ui ontology build'.

'init' options:
  --dir <path>        Project directory holding design/ (default: walk up from cwd)
  --runtimes <csv>    Runtimes to render, from: claude, codex, antigravity (default: all three; not what is installed)
  --roster <csv>      Roles to generate, from: designer, curator, figma-hand (default: all 3)
  --force             Overwrite existing targets (without it, an existing target → EXISTS)

'list' / 'check' options:
  --dir <path>    Project directory (default: the discovered DS project, else cwd)

'check' findings (one per file; it checks only the runtimes that have a target on disk and names the others):
  agent-stale          (error)   a Claude Code file no longer matches its template render outside its area block —
                                the template changed, the file was hand-edited, or the studio/project name moved;
                                fix: 'ui agents init --force'
  AGENTS_ROSTER_DRIFT  (error)   an Antigravity file or the Codex section differs from the roster outside its blocks,
                                or a role one runtime holds is missing from another
  ONTOLOGY_STALE       (error)   an area block differs from a fresh render of the ontology file
  agent-unknown-role   (warning) a stamped file's roster-role is not in the roster
  no-agents            (warning) no stamped agents found — agents are opt-in, never required

Common options:
  --json        Emit a JSON envelope
  -h, --help    Show this help

Error codes:
  DS_NOT_FOUND  No design/ds.manifest.json — agents bind to a project design
                system; run 'ui ds init <name>' (or /ui:learn) first
  BAD_ARG       Missing/unknown subcommand, a bad --roster role, or an unknown --runtimes name
  EXISTS        'init' target already exists (use --force to overwrite)
  BAD_MANIFEST  design/ds.manifest.json is malformed
  READ_ERROR    A template or agent file could not be read
  WRITE_ERROR   An agent file could not be written
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
`;

// ─── list ─────────────────────────────────────────────────────────────────────

function runList(parsed: ParsedArgs): CommandResult {
  const sub = "agents list";
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const root = resolveRoot(parsed.flags["dir"]);
  const agentsDir = join(root, ".claude", "agents");
  const agents = scanClaude(root);
  if (isFail(agents)) return err(agents.code, agents.message);
  if (agents.length === 0) {
    if (parsed.json) return okJson(sub, { dir: agentsDir, agents: [] });
    return ok(`agents list: no design-os agents in ${agentsDir} — run 'ui agents init'.\n`);
  }
  const proj = loadProject(parsed.flags["dir"]);
  if (isFail(proj)) return err(proj.code, proj.message);
  const ctx = targetContext(proj.root, proj.project);
  if (isFail(ctx)) return err(ctx.code, ctx.message);

  // Fresh means the roster outside the area block is the template render; the block is `check`'s to judge.
  const rows = agents.map((a) => ({
    name: a.name, role: a.stamp.role, hash: a.stamp.hash, path: a.path,
    fresh: isRosterRole(a.stamp.role) && templateHash(stripBlocks(a.text)) === templateHash(stripBlocks(agentFile(ctx, "claude", a.stamp.role).content)),
  }));
  if (parsed.json) return okJson(sub, { dir: agentsDir, agents: rows });
  return ok([`agents list: ${rows.length} design-os agent(s) in ${agentsDir}`, ...rows.map((r) => `  ${r.name.padEnd(32)} ${r.role.padEnd(12)} ${r.hash}  ${r.fresh ? "fresh" : "stale"}`)].join("\n") + "\n");
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export const agentsCommand = {
  name: CMD,
  summary: "Generate + lint soul-bound, task-scoped project agents (Claude Code, Codex, Antigravity)",
  hasSubcommands: true,
  help: AGENTS_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "init":  return runInit(parsed);
      case "list":  return runList(parsed);
      case "check": return runCheck(parsed);
      case undefined: {
        const msg = "ui agents requires a subcommand (init/list/check). Run 'ui agents --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui agents --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
