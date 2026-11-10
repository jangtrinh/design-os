/** `ui onboard` / `ui onboard status`: the setup checklist, read-only, always exit 0. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env, cwd as processCwd } from "node:process";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { renderBanner, ruleHeader, checkItem } from "../core/report-style.js";
import { rulingsRow } from "./onboard-rulings-row.js";
import type { RulingsRow } from "./onboard-rulings-row.js";

const CMD = "onboard";

// ─── Step model ─────────────────────────────────────────────────────────────

type StepState = "done" | "pending" | "warn";
interface Step {
  id: string;
  label: string;
  state: StepState;
  optional: boolean;
  hint: string;
}

const HINTS = {
  adapters: "run `ui init` to install the runtime adapters",
  git: "run `git init` — DESIGN:OS needs version control",
  ds: "run `ui ds init` (new) or `ui ds import` (existing) to set up the design system",
  soul: "run `ui ds soul` to declare your design stance",
  heartbeat: "wired automatically by `ui ds init`/`ui ds import`",
  agents: "run `ui agents init` for soul-bound project agents (Claude Code)",
  figma: "open the Figma Design Agent plugin, then `figma-agent status`",
  figmaAbsent:
    "using Figma? install the Design Agent: https://github.com/jangtrinh/design-os-figma-plugin",
} as const;

/** `design/soul.md`'s frontmatter `status:` value, or null if unreadable/absent.
 * Never throws — a soul path that is a directory or unreadable must not crash the
 * always-exit-0 command. */
function readSoulStatus(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm === null) return null;
    const sm = (fm[1] ?? "").match(/^status:\s*(\S+)/m);
    return sm?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Any `.claude/agents/*.md` file present. */
function hasAgentFiles(cwd: string): boolean {
  const dir = join(cwd, ".claude", "agents");
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

/**
 * A configured Figma reference: the `FIGMA_AGENT_FILE` env pin — the signal the
 * figma-agent itself uses. (The current DSManifest schema carries no figma field,
 * so there is nothing reliable to read from disk; a raw-text scan would
 * false-positive on any manifest that merely mentions "figma".)
 */
function hasFigmaRef(): boolean {
  return (env["FIGMA_AGENT_FILE"] ?? "").length > 0;
}

/**
 * Is the `figma-agent` binary reachable on PATH?
 *
 * Walks PATH entries and stats the candidate — no process is spawned, so the
 * kernel stays a pure transform (Art I.2) and a probe can never hang on a
 * misbehaving binary.
 *
 * Onboarding's whole job is to say what to do next, so a next step the reader
 * cannot perform is worse than no step at all: before this probe existed, every
 * run told the reader to type `figma-agent status`, and on a machine without it
 * that is a `command not found` in the one place a newcomer trusts. The agent
 * lives in its own repo (design-os-figma-plugin), so absence is the normal case,
 * not a fault.
 */
function figmaAgentOnPath(): boolean {
  const path = env["PATH"] ?? "";
  if (path.length === 0) return false;
  return path
    .split(":")
    .filter((dir) => dir.length > 0)
    .some((dir) => existsSync(join(dir, "figma-agent")));
}

function detectSteps(cwd: string, rulings: RulingsRow): Step[] {
  const hasAdapters =
    existsSync(join(cwd, ".claude", "ease-design.json")) ||
    existsSync(join(cwd, ".agent", "ease-design.json")) ||
    existsSync(join(cwd, "AGENTS.ease-design.json"));
  const hasGit = existsSync(join(cwd, ".git"));
  const hasDs = existsSync(join(cwd, "design", "ds.manifest.json"));
  const soulStatus = readSoulStatus(join(cwd, "design", "soul.md"));
  const hasHeartbeat = existsSync(join(cwd, "design", "heartbeat.json"));
  const hasAgents = hasAgentFiles(cwd);
  const hasFigma = hasFigmaRef();

  const soulState: StepState = soulStatus === null ? "pending" : soulStatus === "ratified" ? "done" : "warn";

  return [
    { id: "adapters", label: "runtime adapters installed", state: hasAdapters ? "done" : "pending", optional: false, hint: HINTS.adapters },
    { id: "git", label: "git initialized", state: hasGit ? "done" : "pending", optional: false, hint: HINTS.git },
    { id: "ds", label: "design system", state: hasDs ? "done" : "pending", optional: false, hint: HINTS.ds },
    { id: "soul", label: "design soul", state: soulState, optional: false, hint: HINTS.soul },
    { id: "heartbeat", label: "learning loop (soul · heartbeat · harvest)", state: hasHeartbeat ? "done" : "pending", optional: false, hint: HINTS.heartbeat },
    { id: "rulings", label: rulings.label, state: rulings.state, optional: false, hint: rulings.hint },
    { id: "agents", label: "project agents      (optional)", state: hasAgents ? "done" : "pending", optional: true, hint: HINTS.agents },
    // The hint depends on whether the agent is reachable: tell an equipped
    // machine to open the plugin, and an unequipped one where to get it.
    { id: "figma", label: "figma design agent  (optional)", state: hasFigma ? "done" : "pending", optional: true, hint: figmaAgentOnPath() ? HINTS.figma : HINTS.figmaAbsent },
  ];
}

/** ready = every non-optional step is not `pending` (warn is allowed — e.g. an
 * unratified soul still counts as set-up; git absence is `pending` and blocks). */
function computeReady(steps: Step[]): boolean {
  return steps.filter((s) => !s.optional).every((s) => s.state !== "pending");
}

/** First non-optional step that is actually `pending` (blocking), in table order
 * — or null when nothing is pending (a lone unratified soul is `warn`, not next). */
function firstPendingHint(steps: Step[]): string | null {
  const first = steps.find((s) => !s.optional && s.state === "pending");
  return first === undefined ? null : first.hint;
}

// ─── Text formatting ────────────────────────────────────────────────────────

function formatText(steps: Step[], ready: boolean, banner: boolean, templatesRoot: string, rulings: RulingsRow): string {
  const lines: string[] = [];
  if (banner) lines.push(renderBanner(templatesRoot));
  lines.push(ruleHeader("onboarding", ready ? "READY" : "SETUP"));
  lines.push("");
  for (const step of steps) {
    lines.push(checkItem(step.state, step.label, step.hint));
  }
  if (rulings.recorded + rulings.pending > 0) {
    lines.push(`  questions to ready: ${rulings.recorded} answered, ${rulings.pending} pending`);
  }
  lines.push("");
  const next = ready
    ? 'run `/ui:generate "<your idea>"` to start designing'
    : (firstPendingHint(steps) ?? 'run `/ui:generate "<your idea>"` to start designing');
  lines.push(`  next: ${next}`);
  lines.push("  explore what DESIGN:OS can do → `ui guide`");
  return lines.join("\n") + "\n";
}

// ─── Command handler ────────────────────────────────────────────────────────

export function runStatus(parsed: ParsedArgs): CommandResult {
  // The central flag guard cannot see a bare `ui onboard` once the command has subcommands, so guard here.
  const unknown = findUnknownFlag(parsed.flags, ["cwd", "no-banner"]);
  if (unknown !== null) {
    const msg = unknownFlagMessage(unknown);
    return parsed.json ? errJson(CMD, "UNKNOWN_FLAG", msg) : errText(`ui: ${msg}\n`);
  }
  const useJson = parsed.json;
  const cwdFlag = parsed.flags["cwd"];
  const targetCwd = typeof cwdFlag === "string" ? cwdFlag : processCwd();
  const banner = parsed.flags["no-banner"] !== true;

  const rulings = rulingsRow(targetCwd);
  const steps = detectSteps(targetCwd, rulings);
  const ready = computeReady(steps);

  if (useJson) {
    return okJson(CMD, {
      steps: steps.map((s) => ({ id: s.id, state: s.state, optional: s.optional })),
      ready,
      rulings: { pending: rulings.pending, recorded: rulings.recorded, stale: rulings.stale },
    });
  }

  const thisFile = fileURLToPath(import.meta.url);
  const { templatesRoot } = resolvePackageRoots(dirname(thisFile));
  return { exitCode: 0, stdout: formatText(steps, ready, banner, templatesRoot ?? "", rulings) };
}

