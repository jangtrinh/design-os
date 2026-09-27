/**
 * `ui evidence lint` — shared types + folder-walk/JSON-read primitives used by
 * every rule module (evidence-rules-shots/probe/gates/deviations.ts) and the
 * orchestrator that assembles their PASS/FAIL/SKIPPED verdicts into one report.
 *
 * Pure except the fs reads themselves; no network, no model calls (constitution).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ruleR1, ruleR2 } from "./build-evidence-rules-shots.js";
import { ruleR3, ruleR7 } from "./build-evidence-rules-probe.js";
import { ruleR4, ruleR6 } from "./build-evidence-rules-gates.js";
import { readDeviationsText, ruleR5 } from "./build-evidence-rules-deviations.js";

export type RuleVerdict = "PASS" | "FAIL" | "SKIPPED";

export interface RuleResult {
  id: string;
  title: string;
  verdict: RuleVerdict;
  /** Required for FAIL/SKIPPED — why. Omitted on PASS. */
  reason?: string;
  /** File paths / line refs backing the verdict, for a human to re-check. */
  evidence?: string[];
}

export interface EvidenceLintReport {
  dir: string;
  widths: number[];
  rules: RuleResult[];
  passCount: number;
  failCount: number;
  skippedCount: number;
}

export interface WalkedFile {
  /** Posix-style path relative to the evidence dir root, e.g. "shots/full-1440.png". */
  rel: string;
  abs: string;
}

/**
 * Recursively list every regular file under `root`. Symlinks are skipped
 * (never followed) rather than throwing — a lint is read-only and should not
 * die on an evidence folder that happens to contain one.
 */
export function walkFiles(root: string): WalkedFile[] {
  const out: WalkedFile[] = [];
  function walk(relDir: string): void {
    let entries;
    try {
      entries = readdirSync(join(root, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of sorted) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) out.push({ rel, abs: join(root, rel) });
    }
  }
  walk("");
  return out;
}

/** Parse a file as JSON, returning undefined (never throwing) on any failure. */
export function readJsonSafe(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** True when `dir` exists and is a directory — the A1 "exit 2" precondition. */
export function isEvidenceDir(dir: string): boolean {
  try {
    return existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

const truncate = (s: string, max = 160): string => (s.length > max ? s.slice(0, max - 1) + "…" : s);

export function pass(id: string, title: string, evidence?: string[]): RuleResult {
  return { id, title, verdict: "PASS", ...(evidence ? { evidence } : {}) };
}
export function fail(id: string, title: string, reason: string, evidence?: string[]): RuleResult {
  return { id, title, verdict: "FAIL", reason: truncate(reason, 4000), ...(evidence ? { evidence } : {}) };
}
export function skip(id: string, title: string, reason: string): RuleResult {
  return { id, title, verdict: "SKIPPED", reason };
}

export function summarize(dir: string, widths: number[], rules: RuleResult[]): EvidenceLintReport {
  return {
    dir,
    widths,
    rules,
    passCount: rules.filter((r) => r.verdict === "PASS").length,
    failCount: rules.filter((r) => r.verdict === "FAIL").length,
    skippedCount: rules.filter((r) => r.verdict === "SKIPPED").length,
  };
}

/**
 * Run rules r1-r7 over one evidence folder. Pure over the filesystem snapshot
 * (one walk, read once); the caller (`ui evidence lint`) owns exit-code and
 * envelope shaping.
 */
export function runEvidenceLint(dir: string, widths: number[]): EvidenceLintReport {
  const files = walkFiles(dir);
  const deviationsText = readDeviationsText(files);
  const rules: RuleResult[] = [
    ruleR1(files),
    ruleR2(files, widths),
    ruleR3(files),
    ruleR4(files, deviationsText),
    ruleR5(files),
    ruleR6(files),
    ruleR7(files, deviationsText),
  ];
  return summarize(dir, widths, rules);
}
