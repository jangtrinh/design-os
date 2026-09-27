import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { scanProseReads } from "../core/seam-scan.js";
import { lintSeamReads, parseSeamAllowlist } from "../core/seam-allowlist.js";
/** Source-only walk; symlinks are refused rather than silently escaping the scan. */
export function readSeamSources(root: string): Record<string, string> {
  const sources: Record<string, string> = {};
  function walk(relative: string) {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`source symlink is not supported: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) sources[path] = readFileSync(join(root, path), "utf8");
    }
  }
  walk("src"); return sources;
}
export function runSeamLint(parsed: ParsedArgs, root = process.cwd()): CommandResult {
  const command = "seam lint";
  const fail = (code: string, message: string) => parsed.json ? errJson(command, code, message) : errText(`ui: ${message}\n`);
  const unknown = findUnknownFlag(parsed.flags, ["allowlist"]);
  if (unknown) return fail("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (parsed.positionals.length || parsed.flags["allowlist"] === true) return fail("BAD_ARG", "seam lint takes no positionals; --allowlist requires a file path");
  const path = resolve(root, typeof parsed.flags["allowlist"] === "string" ? parsed.flags["allowlist"] : "schemas/seam-allowlist.json");
  let allowed;
  try { allowed = parseSeamAllowlist(readFileSync(path, "utf8")); }
  catch (error) { return fail("BAD_ALLOWLIST", `${path}: ${error instanceof Error ? error.message : String(error)}`); }
  try {
    const result = lintSeamReads(scanProseReads(readSeamSources(root)), allowed);
    const exitCode = result.errorCount ? 1 : 0;
    const summary = `reads ${result.readCount} / allowed ${result.allowedCount} / new ${result.newCount}`;
    if (parsed.json) return okJsonWithExit(command, { ...result, summary }, exitCode);
    return { exitCode, stdout: [summary, ...result.findings.map((finding) => `[${finding.checkId}] ${finding.message}`)].join("\n") + "\n" };
  } catch (error) { return fail("READ_ERROR", `cannot scan src/: ${error instanceof Error ? error.message : String(error)}`); }
}
