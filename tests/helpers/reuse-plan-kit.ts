/** Shared CLI-seam helpers for the `ui reuse-plan check` tests. */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../../src/cli.js";

const FIX = fileURLToPath(new URL("../fixtures/reuse-plan/", import.meta.url));
/** Registry with Pattern/* templates, lifecycle-marked names, variants, and a token file. */
export const PROJECT = join(FIX, "project");
/** Figma-road registry: no Pattern/* names, no token file; its "page" category records are the masters. */
export const FLAT = join(FIX, "project-flat");
/** Registry without Pattern/* names plus design/patterns/*.md pattern files. */
export const FILES = join(FIX, "project-files");
/** Registry that declares no template at all: no Pattern/*, no template-like category, no pattern files. */
export const BARE = join(FIX, "project-bare");

export interface Finding { code: string; line: number; screen: string | null; slot: string | null; message: string }
export interface Screen { name: string; line: number; pattern: string | null; patternSource: string | null; reuse: number; total: number; skipped: number }
export interface DsNew { name: string; reason: string; screen: string; slot: string; line: number; hint?: string }
export interface Data {
  ok: boolean; registry: string; tokens: string; screens: Screen[]; dsNew: DsNew[];
  findings: Finding[]; warnings: Finding[]; errorCount: number; warningCount: number;
}

export function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

const scratch = mkdtempSync(join(tmpdir(), "reuse-plan-kit-"));
let n = 0;
export function planFile(text: string): string {
  const p = join(scratch, `plan-${++n}.md`);
  writeFileSync(p, text, "utf8");
  return p;
}

/** Run `check` on `text` against `dir` (plus extra flags); returns exit code + parsed data. */
export function check(text: string, dir = PROJECT, extra: string[] = []): { code: number; data: Data; file: string } {
  const file = planFile(text);
  const r = capture(["reuse-plan", "check", file, "--dir", dir, ...extra, "--json"]);
  const env = JSON.parse(r.out) as { ok: boolean; data?: Data; error?: { code: string } };
  return { code: r.code, data: env.data as Data, file };
}

export const codes = (d: Data): string[] => d.findings.map((f) => f.code);

/** A one-screen plan around the given rows (table body lines). Pattern "" omits the line. */
export function screen(rows: string[], pattern = "Pattern/ListPage"): string {
  return [
    "## Screen: S", pattern === "" ? "" : `Pattern: ${pattern}`, "",
    "| Slot | Rung | Use | Reason |", "|---|---|---|---|", ...rows, "",
  ].join("\n");
}
