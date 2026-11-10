/**
 * `ui scan` command — detect existing design signals in a project.
 *
 * A read-only reconnaissance pass that classifies a project as greenfield,
 * brownfield (code or HTML), or already-carrying a compiled design system, and
 * routes the user to the right next command (/ui:learn vs /ui:generate). It is
 * the entry point for the brownfield-onboarding track: `/ui:learn` runs it
 * first, and `ui init` reuses its verdict for a next-step hint.
 *
 * Deterministic and read-only: never writes, never calls the network. Exit 0
 * always on a readable root (the verdict is data, not a pass/fail); exit 1 only
 * when the root itself cannot be read (READ_ERROR) or an unknown positional is
 * passed (BAD_ARG). No subcommands — hasSubcommands: false.
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { cwd as processCwd } from "node:process";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { scanProject } from "../core/project-scan.js";
import type { ScanResult } from "../core/project-scan.js";

const CMD = "scan";

export const SCAN_HELP = `ui scan — detect existing design signals in a project

Usage:
  ui scan [--cwd <path>] [--json]

Walks a project directory (read-only) and reports the framework, styling
approach, representative CSS/HTML files, component directories, nested app
roots (a package.json below the root, with its framework and Tailwind v4 CSS
entry), and whether a compiled design system is already present — then prints
a routing verdict. When the walk hits its entry cap, it says which first-level
directories consumed the budget. Dot-directories are not walked.

Options:
  --cwd <path>  Directory to scan (default: current working directory)
  --json        Emit the full ScanResult as a JSON envelope
  -h, --help    Show this help

Verdicts (the final line of text output):
  brownfield-code   existing UI code detected      → run /ui:learn
  brownfield-html   existing markup/styles detected → run /ui:learn
  ds-present        a design system is already compiled → /ui:generate
  greenfield        empty project                  → /ui:generate

Exit codes:
  0  Scan completed (any verdict — the verdict is data, not a failure)
  1  BAD_ARG (unexpected positional) or READ_ERROR (root unreadable)
`;

const VERDICT_LINE: Record<ScanResult["verdict"], string> = {
  "brownfield-code": 'verdict: brownfield-code — existing UI detected. Next: /ui:learn',
  "brownfield-html": 'verdict: brownfield-html — existing markup detected. Next: /ui:learn',
  "ds-present": 'verdict: ds-present — design system already compiled. Next: /ui:generate "<intent>"',
  greenfield: 'verdict: greenfield — empty project. Next: /ui:generate "<intent>"',
};

function fileList(files: Array<{ path: string; bytes: number }>): string {
  return files.map((f) => `${f.path} (${f.bytes}b)`).join(", ");
}

/** Compact human summary: one line per non-empty field, verdict line last. */
function formatText(r: ScanResult): string {
  const lines: string[] = [];
  if (r.framework !== null) lines.push(`framework: ${r.framework}`);
  if (r.styling.length > 0) lines.push(`styling: ${r.styling.join(", ")}`);
  if (r.tailwindConfig !== null) lines.push(`tailwind config: ${r.tailwindConfig}`);
  if (r.tailwindCss !== null) lines.push(`tailwind v4 css: ${r.tailwindCss}`);
  for (const a of r.apps) {
    const parts = [a.framework ?? "no framework", a.styling.length > 0 ? a.styling.join("+") : "no styling"];
    if (a.tailwindCss !== null) parts.push(`tailwind v4 css ${a.tailwindCss}`);
    if (a.componentDirs.length > 0) parts.push(`${a.componentDirs.length} component dir(s)`);
    lines.push(`app: ${a.path} (${parts.join(", ")})`);
  }
  if (r.componentDirs.length > 0) {
    lines.push(
      `component dirs: ${r.componentDirs.map((d) => `${d.path} (${d.files} files)`).join(", ")}`,
    );
  }
  if (r.htmlFiles.length > 0) lines.push(`html files: ${fileList(r.htmlFiles)}`);
  if (r.cssFiles.length > 0) lines.push(`css files: ${fileList(r.cssFiles)}`);
  if (r.designMd !== null) lines.push(`DESIGN.md: ${r.designMd}`);
  if (r.dsStatus !== "none") lines.push(`design system: ${r.dsStatus}`);
  if (r.truncated) {
    const top = r.budget[0];
    lines.push(
      `scan stopped at ${r.visited} entries — the map above is incomplete.` +
        (top !== undefined ? ` Largest consumer: ${top.dir} (${top.visited} entries). Next: ui scan --cwd <app directory> to scan one subtree on its own.` : ""),
    );
    if (r.budget.length > 1) lines.push(`budget: ${r.budget.map((b) => `${b.dir} (${b.visited})`).join(", ")}`);
  }
  lines.push(VERDICT_LINE[r.verdict]);
  return lines.join("\n") + "\n";
}

export const scanCommand = {
  name: CMD,
  summary: "Detect existing design signals in a project (framework, styling, components)",
  hasSubcommands: false,
  help: SCAN_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // scan takes no positionals — a stray one is a misuse, not a path.
    if (parsed.positionals.length > 0) {
      const msg = `unexpected argument '${parsed.positionals[0]}' — ui scan takes no positionals (use --cwd <path>)`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    const cwdFlag = parsed.flags["cwd"];
    const root = typeof cwdFlag === "string" ? resolve(cwdFlag) : processCwd();

    if (!existsSync(root) || !statSync(root).isDirectory()) {
      const msg = `cannot scan '${root}': not a readable directory`;
      return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    let result: ScanResult;
    try {
      result = scanProject(root);
    } catch (e) {
      const msg = `scan failed for '${root}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    if (useJson) return okJson(CMD, result);
    return { exitCode: 0, stdout: formatText(result) };
  },
};
