/**
 * Synthetic projects for the project-level questions (scan-budget, app-roots, source-authority) and a small answer
 * helper that builds an answer from the `--format claude` answer key alone, the way a host does. Every name is
 * invented; the shapes (a wide directory that exhausts the scan budget, two app roots, a sealed store beside a
 * differing second token file) are the measured ones, see tests/fixtures/owner-rulings/SOURCES.md.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "./owner-rulings-helpers.js";
import { writeFiles } from "./scan-wide-app-fixture.js";

const pkg = (deps: Record<string, string>): string => JSON.stringify({ name: "x", dependencies: deps });
export const tokenDoc = (entries: Record<string, string>): string =>
  JSON.stringify({ color: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { $type: "color", $value: v }])) });

/** A scratch project directory with `files` written into it. */
export function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "project-kinds-"));
  writeFiles(root, files);
  return root;
}

/** The files of a wide directory that spends the whole scan budget: `dir/sNN/fNNN.json`. */
export function wideFiles(dir: string, subdirs = 45, perDir = 100): Record<string, string> {
  const files: Record<string, string> = {};
  for (let d = 0; d < subdirs; d++) for (let f = 0; f < perDir; f++) files[`${dir}/s${String(d).padStart(2, "0")}/f${String(f).padStart(3, "0")}.json`] = "{}";
  return files;
}

export const TWO_APPS: Record<string, string> = {
  "apps/web/package.json": pkg({ next: "15" }), "apps/web/components/a.tsx": "", "apps/web/components/b.tsx": "", "apps/web/components/c.tsx": "",
  "apps/docs/package.json": pkg({}),
};
export const TWO_SOURCES: Record<string, string> = {
  "design/design.tokens.json": tokenDoc({ brand: "#112233", ink: "#000000" }),
  "design/tokens.json": tokenDoc({ brand: "#445566", paper: "#ffffff" }),
};

/** A truncated scan, two app roots and two differing token files: three independent project-level questions. */
export const severalClusters = (): string => projectWith({ "package.json": "{}", ...wideFiles("bulk"), ...TWO_APPS, ...TWO_SOURCES });

export interface KeyEntry {
  fingerprint: string;
  kind: string;
  multiSelect: boolean;
  options: { id: string; selects?: string[]; assigns?: Record<string, string> }[];
  memberChoices?: Record<string, { id: string }[]>;
  perMemberAnswer?: { choice: unknown; members: string[]; values?: string[] };
}

export const keyOf = (project: string): KeyEntry[] =>
  (JSON.parse(capture(["onboard", "questions", "--format", "claude", "--cwd", project]).out) as { answerKey: KeyEntry[] }).answerKey;

let counter = 0;
export function submit(project: string, answers: Record<string, unknown>[]): ReturnType<typeof capture> {
  const file = join(project, `answer-${++counter}.json`);
  writeFileSync(file, JSON.stringify({ answers }));
  return capture(["onboard", "answer", "--file", file, "--cwd", project, "--now", "2026-11-11T09:00:00Z", "--json"]);
}
