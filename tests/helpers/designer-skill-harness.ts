/**
 * Shared harness for the design-os-designer skill tests: runs the skill's Node scripts as real
 * subprocesses (the way an agent does), builds evidence folders into temp dirs, and copies the skill
 * so a test can break a copy without touching the shipped files.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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
export function nodeAsync(script: string, args: string[], env: NodeJS.ProcessEnv = {}, killAfterMs = 120000): Promise<Run> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    // A hung child is killed so a failing test cannot hang the suite; its status then reads as null.
    const timer = setTimeout(() => child.kill("SIGKILL"), killAfterMs);
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("close", (status) => { clearTimeout(timer); resolveRun({ status, stdout, stderr }); });
  });
}

/** Processes whose command line mentions `marker` (a unique temp dir): leftover browsers after a run. */
export function processesMentioning(marker: string): string[] {
  const ps = spawnSync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return ps.stdout.split("\n").filter((line) => line.includes(marker) && !line.includes("ps -ax"));
}

/**
 * Whether look can render here (Playwright and a Chromium-family browser). CI ships both: a skip there is a
 * regression, so it throws unless DESIGN_OS_LOOK_OPTIONAL=1 declares the runner browser-less.
 */
export function lookAvailable(): boolean {
  const probe = node(join(SKILL_DIR, "look.mjs"), ["--evidence", build(join(SKILL_DIR, "examples", "pricing-page.html")), "--sheet", join(makeTemp(), "probe.png"), "--widths", "375"]);
  const available = probe.status === 0 || probe.status === 1;
  if (!available && ciIsOn(process.env["CI"]) && process.env["DESIGN_OS_LOOK_OPTIONAL"] !== "1") {
    throw new Error(`look could not run in CI (exit ${probe.status}): ${probe.stdout}${probe.stderr} — set DESIGN_OS_LOOK_OPTIONAL=1 only for a runner without a browser`);
  }
  return available;
}

/**
 * Run look asynchronously (widths 375 unless overridden) with its own TMPDIR, so any browser it leaves behind is
 * findable with `ps`; leftovers are killed so a failing test never orphans one.
 */
export async function lookIsolated(page: string, extra: string[]): Promise<{ run: Run; leftovers: string[] }> {
  const tmp = makeTemp("look-tmp-");
  const evidence = build(page);
  const run = await nodeAsync(join(SKILL_DIR, "look.mjs"), ["--evidence", evidence, "--sheet", join(makeTemp(), "s.png"), "--widths", "375", ...extra], { TMPDIR: tmp }, 70000);
  await new Promise((done) => setTimeout(done, 500));
  const leftovers = processesMentioning(tmp);
  for (const line of leftovers) process.kill(Number(line.trim().split(/\s+/)[0]), "SIGKILL");
  return { run, leftovers };
}

/** CI counts as on only for a real value: "", "0" and "false" mean off. */
export function ciIsOn(value: string | undefined): boolean {
  return value !== undefined && !["", "0", "false"].includes(value.trim().toLowerCase());
}

/** validate's verdict: its failure lines or `ok`, without the `note:` and `warn:` lines printed before it. */
export function verdictLines(stdout: string): string[] {
  return lines(stdout).filter((l) => !l.startsWith("note:") && !l.startsWith("warn:"));
}

/** Lines of validate output that are failures: everything except `note:` and `warn:` lines. */
export function failureLines(stdout: string): string[] {
  return lines(stdout).filter((l) => !l.startsWith("note:") && !l.startsWith("warn:") && l !== "ok");
}

/** An HTML file copied into a folder of its own, the way a user copies an example into a project before building it. */
export function stage(file: string): string {
  const dest = join(makeTemp("designer-page-"), basename(file));
  copyFileSync(file, dest);
  return dest;
}

/**
 * Build an evidence folder for `target` into a fresh temp dir; returns its path. The unit is the page's folder, so a
 * file that sits among siblings in the skill's examples or the broken fixtures is staged into its own folder first.
 */
export function build(target: string, skillDir = SKILL_DIR): string {
  const out = join(makeTemp(), "evidence");
  // One shared empty --project keeps repo fixtures from being graded against this repository's own brand tokens.
  emptyProject ??= makeTemp("designer-noproject-");
  const page = [join(SKILL_DIR, "examples"), BROKEN_DIR].includes(dirname(target)) ? stage(target) : target;
  const run = node(join(skillDir, "build.mjs"), ["--target", page, "--out", out, "--project", emptyProject]);
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

/** Model families, model slugs (spaced or hyphenated) and private orchestration tools that must never be hard-coded. */
export const FORBIDDEN: readonly [string, RegExp][] = [
  ["model family", /\b(sonnet|opus|haiku|fable)\b/i],
  ["model slug", /\b(?:gpt|gemini|claude|grok)[ -]?\d[\w.-]*/i],
  ["model slug", /\b(?:gemini|claude|grok)-[a-z0-9.]+-(?:flash|pro|high|medium|low|mini|fast|build|sol|terra|luna)\b/i],
  ["o-series model", /\bo[134](?:-(?:mini|pro|preview|high|low))?\b/i],
  ["o-series model", /\bopenai\s+o\d/i],
  ["private tool", /\b(grok|codex-web|orca|kongming|cmux|tmux|agy|jev|laya|astra)\b/i],
];

/** Scan `text` for forbidden names. The checkout's own path (which may hold e.g. `claude-501`) is not content, so it is removed first. */
export function forbiddenHits(rawText: string, installRoot: string = REPO_ROOT): string[] {
  const text = rawText.split(installRoot).join("");
  const hits: string[] = [];
  for (const [label, pattern] of FORBIDDEN) {
    const m = pattern.exec(text);
    if (m !== null) hits.push(`${label}: ${m[0]}`);
  }
  return hits;
}
