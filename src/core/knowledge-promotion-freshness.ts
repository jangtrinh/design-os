/**
 * Freshness of live rulings: how old is the last verification, and do the
 * repo-path source anchors still resolve. Fs-free — the caller supplies `pathExists`.
 */
import { repoPathOf } from "./rulings-lint.js";
import { byCategoryThenId, effectiveStatus, stringArray, usableRulings } from "./knowledge-promotion-ruling.js";
import type { RulingRecord } from "./knowledge-promotion-ruling.js";

export type FreshVerdict = "fresh" | "stale" | "unanchored";

export interface FreshRow {
  id: string;
  verdict: FreshVerdict;
  /** Days since `verified_at` (or `since`); null when neither is a valid date. */
  ageDays: number | null;
  reasons: string[];
  deadAnchors: string[];
}

export interface FreshInput {
  doc: unknown;
  /** YYYY-MM-DD the age is measured against. */
  asOf: string;
  days: number;
  pathExists: (relPath: string) => boolean;
}

export interface FreshResult {
  rows: FreshRow[];
  /** Rulings not assessed because they are not live (draft / superseded / retired). */
  notLive: number;
  unusable: number;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: string): boolean => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

function ageInDays(r: RulingRecord, asOf: string): number | null {
  const ref = [r["verified_at"], r["since"]].find((v): v is string => typeof v === "string" && isIsoDate(v));
  if (ref === undefined) return null;
  return Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`)) / DAY_MS));
}

function assess(r: RulingRecord, input: FreshInput): FreshRow {
  const ageDays = ageInDays(r, input.asOf);
  const anchors = stringArray(r["source"]).map(repoPathOf).filter((p): p is string => p !== null);
  const deadAnchors = [...new Set(anchors.filter((p) => !input.pathExists(p)))];
  const reasons: string[] = [];
  if (ageDays === null) reasons.push("no valid verified_at or since date");
  else if (ageDays > input.days) reasons.push(`age ${ageDays}d > ${input.days}d`);
  for (const p of deadAnchors) reasons.push(`dead anchor ${p}`);
  const verdict: FreshVerdict = reasons.length > 0 ? "stale" : anchors.length === 0 ? "unanchored" : "fresh";
  return { id: String(r["id"]), verdict, ageDays, reasons, deadAnchors };
}

export function assessFreshness(input: FreshInput): FreshResult {
  const { usable, unusable } = usableRulings(input.doc);
  const live = [...usable].sort(byCategoryThenId).filter((r) => effectiveStatus(r) === "active");
  return { rows: live.map((r) => assess(r, input)), notLive: usable.length - live.length, unusable };
}
