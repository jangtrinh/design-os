/**
 * The walker: from a state, follow every command the tool prints, depth first-in-first-out to a depth of four, and hold
 * four invariants after every command. Each violation is a string that names the state, the command and the invariant.
 *   1. a command creates no target for a runtime or a role the state did not have, unless its own line names it;
 *   2. nothing changes except generated agent targets, the ontology file and the agents section of AGENTS.md;
 *   3. a printed command, run as printed from the state that printed it, exits 0, with no exception;
 *   4. a walk ends at `ui agents check` with exit 0, or at an output that prints no command.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { capture } from "./owner-rulings-helpers.js";
import { copyTree } from "./ontology-query-helpers.js";
import { blocksIn } from "../src/core/agents-areas-block.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END } from "../src/core/agents-targets.js";
import { scanAntigravity, scanClaude, scanCodex } from "../src/commands/agents-shared.js";
import { extractCommands } from "./agents-walker-extract.js";

export const MAX_DEPTH = 4;
type Snap = Map<string, string>;
export interface WalkResult { followed: number; ends: number; violations: string[] }

function snapshot(dir: string): Snap {
  const out: Snap = new Map();
  const visit = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const next = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, next)).isDirectory()) visit(next); else out.set(next, readFileSync(join(dir, next), "utf8"));
    }
  };
  visit("");
  return out;
}
const hashOf = (s: Snap): string => { const h = createHash("sha1"); for (const [k, v] of s) h.update(`${k}\n${v}\n`); return h.digest("hex"); };
const SECTION = new RegExp(`${CODEX_AGENTS_BEGIN}[\\s\\S]*?${CODEX_AGENTS_END}`);
const outside = (text: string | undefined): string => (text ?? "").replace(SECTION, "").trimEnd();
const isTarget = (path: string): boolean => /^\.claude\/agents\/[^/]+\.md$/.test(path) || /^\.agent\/skills\/design-os-agent-[^/]+\/SKILL\.md$/.test(path) || path === "design/knowledge/ontology.json";

/** "runtime:role" for every generated target of the project. */
function targetsOf(dir: string): Set<string> {
  const out = new Set<string>();
  const claude = scanClaude(dir); const anti = scanAntigravity(dir); const codex = scanCodex(dir);
  if (Array.isArray(claude)) for (const a of claude) out.add(`claude:${a.stamp.role}`);
  if (Array.isArray(anti)) for (const a of anti) out.add(`antigravity:${a.stamp.role}`);
  if (codex !== null && "roles" in codex) for (const r of codex.roles) out.add(`codex:${r}`);
  return out;
}
const flagValues = (argv: string[], flag: string): string[] => { const i = argv.indexOf(flag); return i < 0 ? [] : (argv[i + 1] ?? "").split(","); };
/** Runs a printed command in the project: `ui onboard` names the project with --cwd, every other command with --dir. */
const run = (dir: string, argv: string[], extra: string[] = []): ReturnType<typeof capture> => capture([...argv, argv[0] === "onboard" ? "--cwd" : "--dir", dir, ...extra]);
/**
 * The area block tells an agent how to ask the owner an open ruling question, with `ui onboard questions`. That is an
 * instruction for when a question is open, not a next action of the state: with nothing pending it exits 1 by design
 * ("nothing is pending"). It is skipped, by name, from area blocks only; every other text that prints it is followed.
 */
const asksTheOwner = (argv: string[]): boolean => argv[0] === "onboard" && argv[1] === "questions";
/** `ui agents check` is a verdict, not a write: its exit code is judged by invariant 4, not by invariant 3. */
const isVerdict = (argv: string[]): boolean => argv[0] === "agents" && argv[1] === "check";

export function walk(label: string, root: string): WalkResult {
  const violations: string[] = [];
  let followed = 0; let ends = 0;
  const seen = new Set<string>();
  interface Node { dir: string; depth: number; trail: string; extra: string[][] }
  const queue: Node[] = [];
  const say = (n: number, where: string, what: string): void => { violations.push(`[${label}] invariant ${n} (${where}): ${what}`); };
  const cmd = (argv: string[]): string => `ui ${argv.join(" ")}`;

  /** Commands a state prints by itself: its check, and the area block of every generated target. */
  const printedBy = (dir: string, snap: Snap): { check: string[][]; blocks: string[][]; code: number } => {
    const blocks = [...snap].filter(([k]) => isTarget(k) && k !== "design/knowledge/ontology.json").flatMap(([, v]) => blocksIn(v)).concat(blocksIn(snap.get("AGENTS.md") ?? "")).join("\n");
    const check = run(dir, ["agents", "check"]);
    return { check: extractCommands(check.out + check.err), blocks: extractCommands(blocks).filter((a) => !asksTheOwner(a)), code: check.code };
  };

  // The state itself, and the two probes that print refusals: `ui agents init` with and without --force.
  const probes: string[][] = [];
  for (const flags of [[], ["--force"]]) {
    const t = copyTree(root);
    const r = run(t, ["agents", "init"], flags);
    // The bare command older texts told a reader to run: it creates no target for a runtime the state did not have.
    const had = targetsOf(root); const hadRuntimes = new Set([...had].map((x) => x.split(":")[0]));
    for (const x of targetsOf(t)) if (had.size > 0 && !hadRuntimes.has(x.split(":")[0])) say(1, `after ui agents init ${flags.join(" ")}`.trim(), `a bare command created a target for the runtime ${x.split(":")[0]}, which the state did not have`);
    if (hashOf(snapshot(t)) === hashOf(snapshot(root))) probes.push(...extractCommands(r.out + r.err));
    else queue.push({ dir: t, depth: 1, trail: `agents init ${flags.join(" ")}`.trim(), extra: extractCommands(r.out + r.err) });
  }
  queue.unshift({ dir: root, depth: 0, trail: "the state", extra: probes });
  seen.add(hashOf(snapshot(root)));
  for (const n of queue) seen.add(hashOf(snapshot(n.dir)));

  while (queue.length > 0) {
    const node = queue.shift() as Node;
    const snap = snapshot(node.dir);
    const here = hashOf(snap);
    const printed = printedBy(node.dir, snap);
    const todo: string[][] = [...printed.check, ...printed.blocks, ...node.extra];
    const ran = new Set<string>();
    const progressed = new Set<string>();
    for (let i = 0; i < todo.length; i++) {
      const argv = todo[i] as string[];
      if (ran.has(argv.join(" "))) continue;
      ran.add(argv.join(" "));
      const where = `after ${cmd(argv)}, via ${node.trail}`;
      const work = copyTree(node.dir);
      const r = run(work, argv);
      followed++;
      const after = snapshot(work);
      const next = hashOf(after);

      // 1. no runtime and no role the state did not have, unless the line names it.
      const had = targetsOf(node.dir); const now = targetsOf(work);
      const runtimes = new Set([...had].map((t) => t.split(":")[0])); const roles = new Set([...had].map((t) => t.split(":")[1]));
      const named = { runtimes: flagValues(argv, "--runtimes"), roles: flagValues(argv, "--roster") };
      for (const t of now) {
        const [rt, role] = t.split(":") as [string, string];
        if (had.has(t) || had.size === 0) continue;
        if (!runtimes.has(rt) && !named.runtimes.includes(rt)) say(1, where, `it created a target for the runtime ${rt}, which the state did not have and the command does not name`);
        if (!roles.has(role) && !named.roles.includes(role)) say(1, where, `it created a target for the role ${role}, which the state did not have and the command does not name`);
      }
      // 2. only generated targets, the ontology file and the agents section change.
      for (const path of new Set([...snap.keys(), ...after.keys()])) {
        if (snap.get(path) === after.get(path) || isTarget(path)) continue;
        if (path === "AGENTS.md" && outside(snap.get(path)) === outside(after.get(path))) continue;
        say(2, where, `${path} changed and is neither a generated target nor the agents section`);
      }
      // 3. a printed command, run as printed from the state that printed it, exits 0: a refusal that points elsewhere is still a refusal.
      const printedNow = extractCommands(r.out + r.err);
      if (r.code !== 0 && !isVerdict(argv)) say(3, where, `it exits ${r.code} when run as printed: ${(r.out + r.err).trim().split("\n")[0]?.slice(0, 160)}`);
      if (r.code === 0 && next !== here) progressed.add(argv.join(" "));
      if (next === here) { for (const more of printedNow) if (!ran.has(more.join(" "))) todo.push(more); continue; }
      if (!seen.has(next) && node.depth + 1 <= MAX_DEPTH) { seen.add(next); queue.push({ dir: work, depth: node.depth + 1, trail: `${node.trail} > ${cmd(argv)}`, extra: printedNow }); }
    }
    // 4. a state ends at a clean check, or at a check that prints no command; never at one whose commands lead nowhere.
    ends++;
    if (printed.code !== 0 && printed.check.length > 0) {
      if (node.depth >= MAX_DEPTH) say(4, node.trail, `the check still exits ${printed.code} after ${MAX_DEPTH} commands and prints ${printed.check.map(cmd).join(" | ")}`);
      else if (!printed.check.some((c) => progressed.has(c.join(" ")))) say(4, node.trail, `the check exits ${printed.code} and every command it prints is refused or changes nothing: ${printed.check.map(cmd).join(" | ")}`);
    }
  }
  return { followed, ends, violations };
}
