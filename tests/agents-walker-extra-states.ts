/**
 * States next to the pairwise twelve that the walker also starts from. They are not a cover: each one is a shape a
 * review found missing, built by commands, with one line saying what it is for.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capture } from "./owner-rulings-helpers.js";
import { OWN_TEXT, freshBuilt } from "./agents-walker-states.js";

export interface ExtraState { name: string; why: string; build: () => string }

const agentsInit = (p: string, ...flags: string[]): void => {
  const d = capture(["agents", "init", "--dir", p, ...flags]);
  if (d.code !== 0) throw new Error(`the state could not be built: ${d.out}${d.err}`);
};
const edit = (p: string, rel: string, change: (text: string) => string): void => writeFileSync(join(p, rel), change(readFileSync(join(p, rel), "utf8")));
const START = "<!-- BEGIN design-os agents -->";

export const EXTRA_STATES: readonly ExtraState[] = [
  { name: "Antigravity targets only", why: "the add line and every cure must name the one runtime the project holds", build: () => { const p = freshBuilt(); agentsInit(p, "--runtimes", "antigravity"); return p; } },
  { name: "Codex target only", why: "a project with no per-agent files, only the agents section of AGENTS.md", build: () => { const p = freshBuilt(); agentsInit(p, "--runtimes", "codex"); return p; } },
  { name: "Claude agents plus an agents section with malformed markers", why: "a malformed section is not a target, and no command may be printed for it", build: () => { const p = freshBuilt(); agentsInit(p, "--runtimes", "claude,codex"); edit(p, "AGENTS.md", (t) => t.replace("<!-- END design-os agents -->\n", "")); return p; } },
  { name: "Claude agents plus an Antigravity folder with the agent prefix and no roster stamp", why: "a folder this tool did not write is left alone, so no command that would write there is printed", build: () => { const p = freshBuilt(); agentsInit(p, "--runtimes", "claude"); const dir = join(p, ".agent", "skills", "design-os-agent-designer-imported-ds"); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "SKILL.md"), "written by hand\n"); return p; } },
  { name: "a roster that differs between two runtimes", why: "the cure must name the runtimes and roles found and widen neither", build: () => { const p = freshBuilt(); agentsInit(p, "--runtimes", "claude", "--roster", "designer"); agentsInit(p, "--runtimes", "antigravity"); return p; } },
  { name: "one target changed by hand outside its block", why: "the stale-agent cure on a project with every runtime", build: () => { const p = freshBuilt(); agentsInit(p); const f = readdirSync(join(p, ".claude", "agents")).find((n) => n.startsWith("designer-")) as string; edit(p, `.claude/agents/${f}`, (t) => t.replace("You are", "You were")); return p; } },
  { name: "the agents section placed before the project's own text", why: "the pairwise rows have the section after the person's text", build: () => { const p = freshBuilt(); writeFileSync(join(p, "AGENTS.md"), OWN_TEXT); agentsInit(p, "--runtimes", "codex"); edit(p, "AGENTS.md", (t) => { const i = t.indexOf(START); return `${t.slice(i).trimEnd()}\n\n${t.slice(0, i).trimEnd()}\n`; }); return p; } },
];
