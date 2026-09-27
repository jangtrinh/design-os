/** `ui pattern lint <card.json|dir>` — filesystem shell over the pattern-card linter. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, forTerminal, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { lintPatternCard } from "../core/pattern-lint.js";
import type { PatternFinding } from "../core/pattern-lint.js";
import type { Schema } from "../core/method-json-schema.js";

const SUB = "pattern lint";
const err = (json: boolean, code: string, message: string): CommandResult =>
  json ? errJson(SUB, code, message) : errText(`ui: ${message}\n`);

function loadSchema(): Schema {
  const roots = resolvePackageRoots(dirname(fileURLToPath(import.meta.url)));
  if (roots.templatesRoot === null) throw new Error("installed schemas are unavailable");
  return JSON.parse(readFileSync(join(dirname(roots.templatesRoot), "schemas", "pattern-card.schema.json"), "utf8")) as Schema;
}

function cardFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? cardFiles(child) : entry.name.endsWith(".json") ? [child] : [];
  });
}

export function runPatternLint(parsed: ParsedArgs): CommandResult {
  const unknown = findUnknownFlag(parsed.flags, []);
  if (unknown !== null) return err(parsed.json, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (parsed.positionals.length !== 1) return err(parsed.json, "BAD_ARG", "ui pattern lint requires exactly one <card.json|dir>");
  const target = resolve(parsed.positionals[0]!);
  let files: string[];
  try { files = cardFiles(target); }
  catch { return err(parsed.json, "FILE_NOT_FOUND", `cannot read '${target}'`); }
  if (files.length === 0) return err(parsed.json, "FILE_NOT_FOUND", `no .json cards under '${target}'`);
  let schema: Schema;
  try { schema = loadSchema(); }
  catch { return err(parsed.json, "SCHEMA_UNAVAILABLE", "installed pattern-card schema cannot be read"); }

  const results: Array<{ file: string; findings: PatternFinding[] }> = [];
  for (const file of files) {
    let doc: unknown;
    try { doc = JSON.parse(readFileSync(file, "utf8")); }
    catch (e) {
      if (!(e instanceof SyntaxError)) return err(parsed.json, "FILE_NOT_FOUND", `cannot read '${file}'`);
      return err(parsed.json, "BAD_JSON", `'${file}' is not valid JSON`);
    }
    const location = { stem: basename(file, ".json"), parent: basename(dirname(file)) };
    results.push({ file, findings: lintPatternCard({ doc, schema, location }) });
  }
  const errorCount = results.reduce((total, r) => total + r.findings.length, 0);
  const exitCode = errorCount > 0 ? 1 : 0;
  if (parsed.json) return okJsonWithExit(SUB, { target, files: results, errorCount, warningCount: 0 }, exitCode);
  const lines = results.flatMap((r) => r.findings.map((f) => `  ✗ ${basename(dirname(r.file))}/${basename(r.file)} [${f.checkId}] ${forTerminal(f.message)}`));
  return { exitCode, stdout: [`pattern lint: ${results.length} card(s), ${errorCount} error(s)`, ...lines].join("\n") + "\n" };
}
