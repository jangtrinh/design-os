/**
 * Shared harness for the design-os-designer skill tests: runs the skill's Node scripts as real
 * subprocesses (the way an agent does), builds evidence folders into temp dirs, and copies the skill
 * so a test can break a copy without touching the shipped files.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILL_DIR = join(REPO_ROOT, "skills", "design-os-designer");
export const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");
export const BROKEN_DIR = join(REPO_ROOT, "tests", "fixtures", "designer-skill", "broken");
export const EXAMPLES = ["pricing-page.html", "incident-board.html"] as const;

export interface Run { status: number | null; stdout: string; stderr: string }

const scratch: string[] = [];
let emptyProject: string | undefined;

export function makeTemp(prefix = "designer-skill-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

export function cleanTemps(): void {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  emptyProject = undefined;
}

export function node(script: string, args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Run {
  const run = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
    timeout: 180000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** Asynchronous variant for tests that must keep their own event loop running (a local server). */
export function nodeAsync(script: string, args: string[]): Promise<Run> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], { env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

/** Build an evidence folder for `target` into a fresh temp dir; returns its path. */
export function build(target: string, skillDir = SKILL_DIR): string {
  const out = join(makeTemp(), "evidence");
  // One shared empty --project keeps repo fixtures from being graded against this repository's own brand tokens.
  emptyProject ??= makeTemp("designer-noproject-");
  const run = node(join(skillDir, "build.mjs"), ["--target", target, "--out", out, "--project", emptyProject]);
  if (run.status !== 0) throw new Error(`build failed (${run.status}): ${run.stderr}${run.stdout}`);
  return out;
}

export function validate(evidence: string, skillDir = SKILL_DIR, extra: string[] = [], env: NodeJS.ProcessEnv = {}): Run {
  return node(join(skillDir, "validate.mjs"), ["--evidence", evidence, "--ui", DIST_CLI, ...extra], env);
}

/** A writable copy of the skill folder (without examples) for tamper tests. */
export function copySkill(): string {
  const dir = join(makeTemp(), "design-os-designer");
  cpSync(SKILL_DIR, dir, { recursive: true, filter: (src) => !src.includes(`${join("design-os-designer", "examples")}`) });
  return dir;
}

export function lines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim() !== "");
}

export const hasBuiltBinary = existsSync(DIST_CLI);

export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function writeText(path: string, text: string): void {
  writeFileSync(path, text);
}

/** A gate-clean page with room for extra head and body markup. */
export function htmlPage(head = "", body = "<p>Version two ships next week.</p>"): string {
  return [
    "<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">', "<title>Fixture page</title>", head,
    "<style>", "  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; font-size: 1rem; line-height: 1.5; color: #1b2a2f; background: #ffffff; }",
    "  h1 { font-size: 1.75rem; margin: 0 0 16px; text-wrap: balance; }", "</style>", "</head>", "<body>", "<main>",
    "<h1>Release notes</h1>", body, "</main>", "</body>", "</html>", "",
  ].join("\n");
}

export function writeFile(dir: string, rel: string, text: string | Buffer): string {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
}

/** A scratch project with a compiled design system, made by the real `ui ds init`. */
export function makeProject(): string {
  const dir = makeTemp("designer-project-");
  const run = node(DIST_CLI, ["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "test", "--dir", dir,
    "--persona-data", join(REPO_ROOT, "knowledge", "personas", "personas.json")]);
  if (run.status !== 0) throw new Error(`ds init failed: ${run.stderr}${run.stdout}`);
  return dir;
}

/** Run build.mjs with explicit args (no --out added) from `cwd`. */
export function buildRun(args: string[], cwd?: string, skillDir = SKILL_DIR): Run {
  return node(join(skillDir, "build.mjs"), args, {}, cwd);
}
