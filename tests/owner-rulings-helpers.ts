/** Shared helpers for the owner-rulings suites: in-process CLI capture, a tree hash, a scratch project, cluster factories. */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";
import { parseArgs } from "../src/core/cli-args.js";
import type { ParsedArgs } from "../src/core/cli-args.js";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import type { Cluster, ClusterOption } from "../src/core/owner-rulings/cluster.js";
import { CLUSTER_KIND_TABLE } from "../src/core/owner-rulings/cluster-kinds.js";
import type { ClusterKind } from "../src/core/owner-rulings/cluster-kinds.js";
import type { KindDetection } from "../src/core/owner-rulings/kind-emitter.js";

export interface Captured { code: number; out: string; err: string }

export function capture(args: string[]): Captured {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = origOut; process.stderr.write = origErr; }
}

/** Parsed arguments for a call that goes to a command function directly (with injected emitters). */
export const argsOf = (...args: string[]): ParsedArgs => parseArgs(args);

/** SHA-256 over every file path and byte under `dir` (sorted), skipping top-level names in `skip`. */
export function hashTree(dir: string, skip: readonly string[] = []): string {
  const h = createHash("sha256");
  const visit = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const next = rel === "" ? name : `${rel}/${name}`;
      if (skip.includes(next)) continue;
      if (statSync(join(dir, next)).isDirectory()) { h.update(`d:${next}\n`); visit(next); }
      else { h.update(`f:${next}\n`); h.update(readFileSync(join(dir, next))); }
    }
  };
  visit("");
  return h.digest("hex");
}

export function scratchProject(): string {
  return mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "owner-rulings-"));
}

/**
 * Options for a cluster of `kind` over `members`: a multi-select kind gets one option per member (`keep-<m>`
 * selecting it) and a single-choice kind gets `a` and `b`. The last option is always `review-individually`.
 */
export function optionsFor(kind: ClusterKind, members: readonly string[]): ClusterOption[] {
  const review: ClusterOption = { id: "review-individually", label: "Review individually", consequence: "asks per member" };
  if (CLUSTER_KIND_TABLE[kind].setValued) {
    const per = members.slice(0, 3).map((m, i, all) => ({
      id: `keep-${m}`, label: `Keep ${m}`, consequence: `keeps ${m}`, ...(i === 0 ? { recommended: true } : {}),
      selects: i === all.length - 1 ? members.slice(i) : [m],
    }));
    return [...per, review];
  }
  return [{ id: "a", label: "Option A", consequence: `does A to ${members.length}`, recommended: true }, { id: "b", label: "Option B", consequence: "does B" }, review];
}

/** A cluster as it would sit in pending.json. */
export const clusterOf = (kind: ClusterKind, members: string[]): Cluster =>
  buildCluster({ kind, question: `Question for ${kind}?`, members, options: optionsFor(kind, members) });

/** A detection whose questions are built from the members actually asked. */
export const detectionOf = (kind: ClusterKind, members: string[], domain: string[] = members): KindDetection => ({
  kind, members, domain,
  ask: (these) => ({ question: `Question for ${kind}?`, options: optionsFor(kind, these) }),
});
