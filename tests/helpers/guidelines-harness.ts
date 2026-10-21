/**
 * Shared harness for the Figma-export tests of `ui ds guidelines`: run the CLI in-process, build
 * private temp projects from the synthetic fixtures, answer every slot, and generate large inputs.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../../src/cli.js";
import { canonicalHash, canonicalStringify } from "../../src/core/ds-manifest.js";

export const FIXTURES = join(import.meta.dirname, "..", "fixtures", "ds-guidelines");
export const NOW = "2026-10-15T00:00:00Z";
export const FULL = ["**Do:** Keep every header on one line.", "**Don't:** Let a header wrap.", "**Why:** Wrapped headers break the scan line."];

export function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { out += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

const scratch: string[] = [];
export const cleanScratch = (): void => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); };
export function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(d);
  return d;
}

/** The sealed basic DS plus any of the fixture overlays ("rulings", "terminology", "scenarios"). */
export function project(overlays: readonly string[] = ["rulings", "terminology"]): { dir: string; pack: string } {
  const dir = tempDir("ease-guidelines-fig-");
  cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
  for (const o of overlays) cpSync(join(FIXTURES, o), dir, { recursive: true });
  return { dir, pack: join(dir, "design", "guidelines") };
}

export const build = (dir: string, extra: string[] = []) => capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, ...extra]);
export const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
export const manifestOf = (pack: string): Record<string, unknown> => JSON.parse(read(pack, "guidelines.manifest.json")) as Record<string, unknown>;

export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/")).sort();
}

/** Put a full Do/Don't/Why answer under every unanswered slot of the pack; returns how many. */
export function answerAll(pack: string): number {
  let n = 0;
  for (const f of listFiles(pack).filter((p) => p.endsWith(".md") && p !== "guidelines.orphans.md")) {
    const out: string[] = [];
    for (const line of read(pack, f).split("\n")) {
      out.push(line);
      if (line.startsWith("> QUESTION(")) { out.push(...FULL); n++; }
    }
    writeFileSync(join(pack, f), out.join("\n"));
  }
  return n;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

const pad = (n: number): string => String(n).padStart(4, "0");
const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const filler = " keeps the shared pattern consistent across screens, flows and the dialogs that open from them.";

/**
 * A rulings file with `global` tier-A rulings (`g-0001…`, category status-vocabulary) and
 * app-scoped ones (`a-0001…` for alpha, `b-0001…` for beta). `since` grows with the number, so a
 * smaller number is an older ruling. No ruling says never / always / do not (no slots).
 */
export function bulkRulings(counts: { global: number; alpha: number; beta: number }): unknown {
  const make = (prefix: string, n: number, category: string, scope: unknown): unknown[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${pad(i + 1)}`, category, text: `Rule ${prefix}${pad(i + 1)}${filler}`, scope, source: ["notes/bulk.md"], since: day(i), verified_by: "owner",
    }));
  return {
    schema: "owner-rulings/1", at: NOW,
    rulings: [
      ...make("g", counts.global, "status-vocabulary", "global"),
      ...make("a", counts.alpha, "forms-inputs", { apps: ["alpha"] }),
      ...make("b", counts.beta, "forms-inputs", { apps: ["beta"] }),
    ],
  };
}

/** Add `count` spacing tokens and reseal the store (a large vocabulary.md). */
export function addTokens(dir: string, count: number): void {
  const d = join(dir, "design");
  const tokens = JSON.parse(read(d, "design.tokens.json")) as Record<string, Record<string, unknown>>;
  for (let i = 0; i < count; i++) tokens["spacing"]![`x${i}`] = { $value: `${i}px`, $type: "dimension" };
  const manifest = JSON.parse(read(d, "ds.manifest.json")) as Record<string, unknown>;
  manifest["compiledHash"] = canonicalHash(tokens);
  writeFileSync(join(d, "design.tokens.json"), canonicalStringify(tokens));
  writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
}
