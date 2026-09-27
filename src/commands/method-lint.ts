/** `ui method lint <run.json>` — filesystem shell over the method-run linter. */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, forTerminal, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { lintMethodRun, methodStatusLine } from "../core/method-lint.js";
import type { Schema } from "../core/method-json-schema.js";

const SUB = "method lint";
const err = (json: boolean, code: string, message: string): CommandResult =>
  json ? errJson(SUB, code, message) : errText(`ui: ${message}\n`);

function parseSchema(name: string): Schema {
  const roots = resolvePackageRoots(dirname(fileURLToPath(import.meta.url)));
  if (roots.templatesRoot === null) throw new Error("installed schemas are unavailable");
  return JSON.parse(readFileSync(join(dirname(roots.templatesRoot), "schemas", name), "utf8")) as Schema;
}

export function runMethodLint(parsed: ParsedArgs): CommandResult {
  const unknown = findUnknownFlag(parsed.flags, []);
  if (unknown !== null) return err(parsed.json, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (parsed.positionals.length !== 1) return err(parsed.json, "BAD_ARG", "ui method lint requires exactly one <run.json>");
  const file = resolve(parsed.positionals[0]!);
  let doc: unknown;
  try { doc = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) {
    const code = e instanceof SyntaxError ? "BAD_JSON" : "FILE_NOT_FOUND";
    return err(parsed.json, code, code === "BAD_JSON" ? `'${file}' is not valid JSON` : `cannot read '${file}'`);
  }
  let runSchema: Schema; let briefSchema: Schema;
  try { runSchema = parseSchema("method-run.schema.json"); briefSchema = parseSchema("design-brief.schema.json"); }
  catch { return err(parsed.json, "SCHEMA_UNAVAILABLE", "installed method or brief schema cannot be read"); }
  const findings = lintMethodRun({ doc, runSchema, briefSchema, readBrief: (path) => {
    try { return JSON.parse(readFileSync(isAbsolute(path) ? path : resolve(dirname(file), path), "utf8")) as unknown; }
    catch { return null; }
  } });
  const errorCount = findings.length;
  const line = methodStatusLine(doc, findings);
  const data = { file, line, findings, errorCount, warningCount: 0 };
  if (parsed.json) return okJsonWithExit(SUB, data, errorCount > 0 ? 1 : 0);
  return { exitCode: errorCount > 0 ? 1 : 0,
    stdout: [line, ...findings.map((f) => `  ✗ [${f.checkId}] ${forTerminal(f.message)}`)].join("\n") + "\n" };
}
