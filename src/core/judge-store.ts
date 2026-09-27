/**
 * The judgments ledger (`design/judgments.jsonl`): append-only, one judgment per line.
 * A human decision arrives as a second line with the same id that repeats the pending
 * judgment unchanged and adds `human`; the report reads the last line per id, nothing is rewritten.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { validateJudgment } from "./judge-validate.js";
import type { JudgeFinding, Judgment } from "./judge-validate.js";

export interface LedgerRead {
  /** Every valid line, in file order. */
  records: Judgment[];
  errors: { line: number; findings: JudgeFinding[] }[];
}

export function readLedger(path: string): LedgerRead {
  const out: LedgerRead = { records: [], errors: [] };
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (text.trim() === "") return;
    let doc: unknown;
    try { doc = JSON.parse(text); }
    catch { out.errors.push({ line: i + 1, findings: [{ field: "(line)", message: "not valid JSON" }] }); return; }
    const findings = validateJudgment(doc);
    if (findings.length > 0) out.errors.push({ line: i + 1, findings });
    else out.records.push(doc as Judgment);
  });
  return out;
}

/** The last record per id: a judgment's current state. */
export function latestById(records: readonly Judgment[]): Judgment[] {
  const byId = new Map<string, Judgment>();
  for (const r of records) byId.set(r.id, r);
  return [...byId.values()];
}

const sameJudgment = (a: Judgment, b: Judgment): boolean =>
  JSON.stringify([a.decisionPoint, a.candidates, a.pick, a.kernelConstraints]) ===
  JSON.stringify([b.decisionPoint, b.candidates, b.pick, b.kernelConstraints]);

/** Reason the event cannot be appended to these records, or null when it can. */
export function appendConflict(existing: readonly Judgment[], ev: Judgment): string | null {
  const prior = existing.filter((r) => r.id === ev.id);
  const last = prior[prior.length - 1];
  if (last === undefined) return null;
  if (last.human !== undefined) return `judgment '${ev.id}' already has a human decision; the ledger is append-only`;
  if (ev.human === undefined) return `judgment '${ev.id}' already exists; record the human decision by repeating it with 'human'`;
  if (!sameJudgment(last, ev)) return `the human decision for '${ev.id}' must repeat the pending judgment unchanged (decisionPoint, candidates, pick, kernelConstraints)`;
  return null;
}

export function appendJudgment(path: string, ev: Judgment): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(ev)}\n`, "utf8");
}
