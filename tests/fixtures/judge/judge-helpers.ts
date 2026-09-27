import { expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../../../src/cli.js";

const ROOT = process.cwd();

export const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "judge", "judgment-persona-family.json"), "utf8")) as Record<string, unknown>;
export const FAMILIES_PATH = join(ROOT, "knowledge", "personas", "families.json");
export const FAMILIES = JSON.parse(readFileSync(FAMILIES_PATH, "utf8")) as { unreliableAttributes: { attribute: string }[]; families: Family[] };
export const JUDGMENT_SCHEMA = JSON.parse(readFileSync(join(ROOT, "schemas", "judgment.schema.json"), "utf8"));

export interface Family { slug: string; platform: string; apps: number; screens: number; nearest: string; attributes: { attribute: string; share: number; weak: boolean }[]; mobbinUrls: string[] }

export function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

export const tmp = (): string => mkdtempSync(join(tmpdir(), "judge-"));
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function judgment(id: string, point = "art-direction", mutate: (j: Record<string, unknown>) => void = () => {}): Record<string, unknown> {
  const j = clone(FIXTURE);
  j["id"] = id;
  j["decisionPoint"] = point;
  j["candidates"] = ["alpha", "beta", "gamma"];
  j["pick"] = { candidate: "alpha", evidenceRefs: [{ type: "pattern-card", ref: "knowledge/patterns/hero.md" }] };
  mutate(j);
  return j;
}
export const withHuman = (j: Record<string, unknown>, decision: string, changedTo?: string): Record<string, unknown> =>
  ({ ...clone(j), human: { decision, ...(changedTo !== undefined ? { changedTo } : {}), ts: "2026-09-27T10:00:00.000Z" } });

export function record(ledger: string, ev: unknown): { code: number; body: { ok: boolean; error?: { code: string }; data?: { findings?: { field: string }[] } } } {
  const r = capture(["judge", "record", "--out", ledger, "--event", JSON.stringify(ev), "--json"]);
  return { code: r.code, body: JSON.parse(r.out) };
}

export interface Point { decisionPoint: string; total: number; resolved: number; pending: number; accepted: number; changed: number; rejected: number; agreementRate: number | null; status: string }
export function report(ledger: string, extra: string[] = []): { code: number; out: string; points: Point[]; problems: unknown[] } {
  const j = capture(["judge", "report", ledger, "--json", ...extra]);
  const data = JSON.parse(j.out).data;
  return { code: j.code, out: capture(["judge", "report", ledger, ...extra]).out, points: data.points, problems: data.problems };
}

/** A ledger with `decisions.length` resolved art-direction judgments. */
export function ledgerWith(decisions: ("accepted" | "changed-to" | "rejected")[], point = "art-direction"): string {
  const path = join(tmp(), "judgments.jsonl");
  decisions.forEach((d, i) => {
    const base = judgment(`j-${point}-${i}`, point);
    expect(record(path, base).code).toBe(0);
    expect(record(path, withHuman(base, d, d === "changed-to" ? "beta" : undefined)).code).toBe(0);
  });
  return path;
}
export const stat = (points: Point[], point: string): Point => points.find((p) => p.decisionPoint === point) as Point;

