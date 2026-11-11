/**
 * Helpers for the Figma-ingest suites: build scans in memory, run the real CLI against a scan, answer the questions it
 * leaves in pending.json through `ui onboard answer`, and run again, exactly as a host would.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planIngest } from "../src/core/figma-ds-ingest.js";
import type { DsFile } from "../src/core/figma-ds-ingest.js";
import { validateAnswers } from "../src/core/owner-rulings/answer-validator.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import { appendRulings, readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { CLUSTER_KIND_TABLE } from "../src/core/owner-rulings/cluster-kinds.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture, scratchProject } from "./owner-rulings-helpers.js";
import type { Captured } from "./owner-rulings-helpers.js";

export const NOW = "2026-11-11T09:00:00Z";

/** An answer: one option id, a list of ids (multi-select), or review individually with a members map. */
export type Answer = string | string[] | { choice: string; members: Record<string, string> };
export type Choose = (cluster: Cluster) => Answer;

/** One entry of an answers file. */
export const answerEntry = (c: Cluster, a: Answer): Record<string, unknown> =>
  typeof a === "object" && !Array.isArray(a) ? { fingerprint: c.fingerprint, ...a } : { fingerprint: c.fingerprint, choice: a };

/** Review individually: every member takes the choice `pick` gives it (a member choice id of an assigned question). */
export const reviewing = (pick: (member: string, cluster: Cluster) => string): Choose => (c) =>
  ({ choice: "review-individually", members: Object.fromEntries(c.members.map((m) => [m, pick(m, c)])) });

/** Writes a scan file and returns its path. */
export function writeScan(dir: string, scan: unknown, name = "scan.json"): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(scan, null, 2));
  return path;
}

/** The ingest command line against a scan; `cwd` holds the rulings and the pending file, `out` receives the stores. */
export const ingestArgs = (scan: string, cwd: string, out: string, extra: string[] = []): string[] =>
  ["ingest-figma-ds", scan, "--cwd", cwd, "--out", out, "--name", "synthetic", "--now", NOW, ...extra];

/** Answers every pending cluster of the project with `choose`; returns the clusters it answered. */
export function answerPending(cwd: string, choose: Choose): { answered: Cluster[]; result: Captured } {
  const clusters = readPending(cwd).clusters;
  const answers = clusters.map((c) => answerEntry(c, choose(c)));
  const file = join(cwd, `answers-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ answers }));
  return { answered: clusters, result: capture(["onboard", "answer", "--file", file, "--cwd", cwd, "--now", NOW, "--json"]) };
}

/** Runs the ingest, answers what it asks, and runs it again, until it writes (exit 0) or `rounds` run out. */
export function ingestUntilReady(scan: string, cwd: string, out: string, choose: Choose, extra: string[] = [], rounds = 8): { final: Captured; rounds: number; asked: Cluster[][] } {
  const asked: Cluster[][] = [];
  for (let round = 1; round <= rounds; round++) {
    const final = capture(ingestArgs(scan, cwd, out, extra));
    if (final.code === 0) return { final, rounds: round, asked };
    const { answered, result } = answerPending(cwd, choose);
    asked.push(answered);
    if (result.code !== 0) throw new Error(`answer refused: ${result.out}${result.err}`);
  }
  throw new Error(`the ingest still asks after ${rounds} rounds`);
}

/** The recommended option of a question, else every option that keeps something (multi-select) or the first (single). */
export const takeRecommended: Choose = (c): string | string[] => {
  const rec = c.options.find((o) => o.recommended === true);
  if (CLUSTER_KIND_TABLE[c.kind].setValued) return rec === undefined ? c.options.filter((o) => (o.selects ?? []).length > 0).map((o) => o.id) : [rec.id];
  return (rec ?? c.options[0]!).id;
};

/** Always the option with this id when the cluster has it; otherwise the recommended one. */
export const preferring = (id: string): Choose => (c) => (c.options.some((o) => o.id === id) ? id : takeRecommended(c));

/** The first option of a question whose id starts with `prefix`; otherwise the recommended one. */
export const preferringPrefix = (prefix: string): Choose => (c) => c.options.find((o) => o.id.startsWith(prefix))?.id ?? takeRecommended(c);

export const newProject = (): string => scratchProject();

/** A colour variable. */
export const colorVar = (id: string, name: string, collection: string, valuesByMode?: unknown): Record<string, unknown> =>
  ({ id: `VariableID:${id}`, name, type: "COLOR", collection, ...(valuesByMode === undefined ? { value: { r: 0.1, g: 0.2, b: 0.3, a: 1 } } : { valuesByMode }) });
export const aliasTo = (id: string): { type: "VARIABLE_ALIAS"; id: string } => ({ type: "VARIABLE_ALIAS", id: `VariableID:${id}` });
export const comp = (id: string, name: string, page?: { id: string; name: string }, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ id, name, type: "COMPONENT", ...(page === undefined ? {} : { page }), ...extra });
export const scanOf = (parts: { components?: unknown[]; tokens?: unknown[]; frames?: unknown[]; sensing?: unknown }): Record<string, unknown> =>
  ({ components: parts.components ?? [], tokens: parts.tokens ?? [], styles: [], ...(parts.frames === undefined ? {} : { frames: parts.frames }), ...(parts.sensing === undefined ? {} : { sensing: parts.sensing }) });

/** Records the owner's rulings for a scan without going through the CLI: asks, answers with `choose`, repeats until ready. */
export function seedRulings(cwd: string, ds: DsFile, choose: Choose, rounds = 8): void {
  for (let i = 0; i < rounds; i++) {
    const rulings = readRulingStore(cwd).rulings;
    const plan = planIngest(ds, "synthetic", "synthetic", rulings);
    if (plan.result !== null) return;
    const open = resolveDetections(plan.detections, rulings, "ingest-figma-ds").open;
    const verdict = validateAnswers(open, { answers: open.map((c) => answerEntry(c, choose(c))) }, NOW, rulings);
    if (!verdict.ok) throw new Error(`answer refused: ${verdict.message}`);
    appendRulings(cwd, verdict.rulings);
  }
  throw new Error("the scan still raises questions after the rounds");
}
