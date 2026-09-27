/** `ui design lint <project-root>` — filesystem shell over the design-dir rules. */
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, forTerminal, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { lintDesignDir } from "../core/design-dir-lint.js";
import { loadProjectView } from "../core/design-dir-scan.js";
import type { Schema } from "../core/method-json-schema.js";

const SUB = "design lint";
const err = (json: boolean, code: string, message: string): CommandResult =>
  json ? errJson(SUB, code, message) : errText(`ui: ${message}\n`);

function loadSchema(): Schema {
  const roots = resolvePackageRoots(dirname(fileURLToPath(import.meta.url)));
  if (roots.templatesRoot === null) throw new Error("installed schemas are unavailable");
  return JSON.parse(readFileSync(join(dirname(roots.templatesRoot), "schemas", "design-dir.schema.json"), "utf8")) as Schema;
}

export function runDesignLint(parsed: ParsedArgs): CommandResult {
  const unknown = findUnknownFlag(parsed.flags, []);
  if (unknown !== null) return err(parsed.json, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (parsed.positionals.length !== 1) return err(parsed.json, "BAD_ARG", "ui design lint requires exactly one <project-root>");
  const root = resolve(parsed.positionals[0]!);
  try { if (!statSync(root).isDirectory()) throw new Error(); }
  catch { return err(parsed.json, "NOT_A_DIRECTORY", `'${root}' is not a directory`); }
  let schema: Schema;
  try { schema = loadSchema(); }
  catch { return err(parsed.json, "SCHEMA_UNAVAILABLE", "installed design-dir schema cannot be read"); }

  const findings = lintDesignDir(loadProjectView(root), schema);
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const exitCode = errorCount > 0 ? 1 : 0;
  if (parsed.json) return okJsonWithExit(SUB, { root, findings, errorCount, warningCount }, exitCode);
  const head = `design lint: ${errorCount} error(s), ${warningCount} warning(s)${findings.length === 0 ? " — clean" : ""}`;
  const lines = findings.flatMap((f) => [
    `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}] ${forTerminal(f.path, 100)} — ${forTerminal(f.message, 140)}`,
    `      fix: ${forTerminal(f.fix, 200)}`,
  ]);
  return { exitCode, stdout: [head, ...lines].join("\n") + "\n" };
}
