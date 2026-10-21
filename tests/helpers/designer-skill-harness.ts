/**
 * Shared harness for the design-os-designer skill tests: runs the skill's Node scripts as real
 * subprocesses (the way an agent does), builds evidence folders into temp dirs, and copies the skill
 * so a test can break a copy without touching the shipped files.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

export function makeTemp(prefix = "designer-skill-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

export function cleanTemps(): void {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
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

/** Build an evidence folder for `target` into a fresh temp dir; returns its path. */
export function build(target: string, skillDir = SKILL_DIR): string {
  const out = join(makeTemp(), "evidence");
  const run = node(join(skillDir, "build.mjs"), ["--target", target, "--out", out]);
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
