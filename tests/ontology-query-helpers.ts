/**
 * Helpers of the query suites: projects built by the kernel's own commands (see ontology-helpers.ts), the query run
 * through the CLI seam, and the printed next actions run back as printed.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { build, fullProject, ring1Project } from "./ontology-helpers.js";
import type { Scan } from "./ontology-helpers.js";

export interface QueryEntry { id: string; name: string; kind: string; source: string; score: number }
export interface QueryGroup { group: string; entries: QueryEntry[]; leftOut: number }
export interface QueryData {
  query: string; area: string | null; budget: number;
  matchCount: number; matches: QueryEntry[]; nearest: { id: string; name: string }[];
  pack: { characters: number; text: string; groups: QueryGroup[] } | null;
}

/** The query as a person types it: the text first, then the flags. */
export const query = (project: string, text: string, ...flags: string[]): ReturnType<typeof capture> => capture(["ontology", "query", text, "--dir", project, ...flags]);
export function queryData(project: string, text: string, ...flags: string[]): QueryData {
  const done = query(project, text, "--json", ...flags);
  const env = JSON.parse(done.out) as { ok?: boolean; data?: QueryData; error?: { code: string; message: string } };
  if (done.code !== 0 || env.data === undefined) throw new Error(`query failed (${done.code}): ${done.out}${done.err}`);
  return env.data;
}
export const failure = (project: string, text: string, ...flags: string[]): { code: number; error: { code: string; message: string } } => {
  const done = query(project, text, "--json", ...flags);
  return { code: done.code, error: (JSON.parse(done.out) as { error: { code: string; message: string } }).error };
};

/** Splits a printed command the way a shell does for the quoting the kernel prints: double quotes with backslash escapes. */
export function shellWords(line: string): string[] {
  const words: string[] = [];
  let cur = "";
  let started = false;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (quoted) {
      if (c === "\\" && i + 1 < line.length) cur += line[++i];
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') { quoted = true; started = true; }
    else if (c === " ") { if (started) { words.push(cur); cur = ""; started = false; } }
    else { cur += c; started = true; }
  }
  if (started) words.push(cur);
  return words;
}

/** Every `ui ...` command a text prints, as the arguments after `ui`, with `--dir` appended so it runs in the project. */
export function printedCommands(out: string, project: string): string[][] {
  return [...out.matchAll(/(?:^|[\s:`])ui ((?:ontology|agents|onboard)[^\n`]*)/g)].map((m) => [...shellWords((m[1] as string).trim().replace(/\s*\([A-Z_]+\)$/, "").replace(/[.;,]$/, "")), "--dir", project]);
}

/** The ring-1 project with its ontology built. */
export function builtRing1(): string {
  const p = ring1Project();
  const done = build(p);
  if (done.code !== 0) throw new Error(done.out + done.err);
  return p;
}

/** The ring-2 project: the owner's `inferred-links` answers given, the ontology built. */
export function builtFull(): string {
  const p = fullProject();
  build(p);
  const answers = keyOf(p).filter((k) => k.kind === "inferred-links").map((k) => ({ fingerprint: k.fingerprint, choice: "standalone" }));
  const done = submit(p, answers);
  if (done.code !== 0) throw new Error(done.out + done.err);
  const again = build(p);
  if (again.code !== 0) throw new Error(again.out + again.err);
  return p;
}

/** Changes the scan the ontology reads (design/ds.json) after the project was built by commands, then rebuilds the ontology. */
export function changeScanAndRebuild(project: string, change: (scan: Scan) => void): void {
  const file = join(project, "design", "ds.json");
  const scan = JSON.parse(readFileSync(file, "utf8")) as Scan;
  change(scan);
  writeFileSync(file, JSON.stringify(scan, null, 2));
  const done = build(project);
  if (done.code !== 0) throw new Error(done.out + done.err);
}

/** A copy of a project tree at another path. */
export function copyTree(project: string): string {
  const to = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ontology-copy-"));
  cpSync(project, to, { recursive: true });
  return to;
}
