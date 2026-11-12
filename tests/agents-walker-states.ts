/**
 * The states the agents walker starts from. Each one is built by the kernel's own commands in a temp project, never by
 * hand-written generated files. Four axes: which runtimes hold a target, whether the roster is whole or a subset, whether
 * the ontology file is current, not current or missing, and what AGENTS.md held. The twelve rows below are a pairwise
 * cover: every value of every axis meets every value of every other axis in at least one row (asserted in the test).
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capture } from "./owner-rulings-helpers.js";
import { ring1Project } from "./ontology-helpers.js";
import { build } from "./ontology-helpers.js";
import { copyTree } from "./ontology-query-helpers.js";
import { CODEX_PROJECT_DOC_MAX_BYTES } from "../src/core/agents-doc-limit.js";

export const AXES = {
  runtimes: ["claude", "claude+codex", "all"],
  roster: ["whole", "subset"],
  ontology: ["current", "notCurrent", "missing"],
  agentsMd: ["absent", "own", "large", "kernel"],
} as const;
export interface Row { runtimes: (typeof AXES.runtimes)[number]; roster: (typeof AXES.roster)[number]; ontology: (typeof AXES.ontology)[number]; agentsMd: (typeof AXES.agentsMd)[number] }

export const ROWS: readonly Row[] = [
  { runtimes: "claude", roster: "whole", ontology: "current", agentsMd: "absent" },
  { runtimes: "claude", roster: "subset", ontology: "notCurrent", agentsMd: "own" },
  { runtimes: "claude", roster: "whole", ontology: "missing", agentsMd: "large" },
  { runtimes: "claude", roster: "subset", ontology: "current", agentsMd: "kernel" },
  { runtimes: "claude+codex", roster: "subset", ontology: "notCurrent", agentsMd: "absent" },
  { runtimes: "claude+codex", roster: "whole", ontology: "missing", agentsMd: "own" },
  { runtimes: "claude+codex", roster: "subset", ontology: "current", agentsMd: "large" },
  { runtimes: "claude+codex", roster: "whole", ontology: "notCurrent", agentsMd: "kernel" },
  { runtimes: "all", roster: "whole", ontology: "missing", agentsMd: "absent" },
  { runtimes: "all", roster: "subset", ontology: "current", agentsMd: "own" },
  { runtimes: "all", roster: "whole", ontology: "notCurrent", agentsMd: "large" },
  { runtimes: "all", roster: "subset", ontology: "missing", agentsMd: "kernel" },
];
export const rowLabel = (r: Row): string => `${r.runtimes} / ${r.roster} roster / ontology ${r.ontology} / AGENTS.md ${r.agentsMd}`;

export const OWN_TEXT = "# Team notes\n\nKeep the cards flat.\n";
let bases: { built: string; unbuilt: string } | null = null;
/** One built and one unbuilt ring-1 project, made once; every row starts from a copy. */
function base(): { built: string; unbuilt: string } {
  if (bases === null) {
    const built = ring1Project();
    if (build(built).code !== 0) throw new Error("the ontology of the base project did not build");
    bases = { built, unbuilt: ring1Project() };
  }
  return bases;
}

/** A copy of the built base project: the start of every extra state. */
export const freshBuilt = (): string => copyTree(base().built);

/** The scan changes after the ontology was built, so the file on disk no longer matches the sources. */
function makeNotCurrent(p: string): void {
  const file = join(p, "design", "ds.json");
  const scan = JSON.parse(readFileSync(file, "utf8")) as { components: Record<string, unknown>[] };
  scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "Kit" };
  writeFileSync(file, JSON.stringify(scan, null, 2));
}

/** A temp project in the state of the row, built by commands. */
export function buildState(row: Row): string {
  const p = copyTree(row.ontology === "missing" ? base().unbuilt : base().built);
  if (row.ontology === "notCurrent") makeNotCurrent(p);
  if (row.agentsMd === "kernel") { if (capture(["init", "--runtime", "codex", "--cwd", p]).code !== 0) throw new Error("ui init --runtime codex failed"); }
  else if (row.agentsMd !== "absent") writeFileSync(join(p, "AGENTS.md"), OWN_TEXT);
  const runtimes = row.runtimes === "claude" ? "claude" : row.runtimes === "claude+codex" ? "claude,codex" : "claude,antigravity,codex";
  const done = capture(["agents", "init", "--dir", p, "--runtimes", runtimes, ...(row.roster === "subset" ? ["--roster", "designer"] : [])]);
  if (done.code !== 0) throw new Error(`the state could not be built: ${done.out}${done.err}`);
  // A large AGENTS.md: the person's own text grows until a regenerate of the whole file passes the Codex limit.
  const agents = join(p, "AGENTS.md");
  if (row.agentsMd === "large") {
    const now = Buffer.byteLength(readFileSync(agents, "utf8"));
    writeFileSync(agents, `${readFileSync(agents, "utf8").trimEnd()}\n\n${"x".repeat(Math.max(1, CODEX_PROJECT_DOC_MAX_BYTES + 1000 - now - 2))}\n`);
  }
  return p;
}

/** Removes the base projects at the end of the run. */
export function dropBases(): void {
  if (bases !== null) { rmSync(bases.built, { recursive: true, force: true }); rmSync(bases.unbuilt, { recursive: true, force: true }); bases = null; }
}
