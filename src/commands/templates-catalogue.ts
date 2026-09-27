/** `ui templates catalogue|lint` — maintainer emitter and linter for template descriptions. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import type { Schema } from "../core/method-json-schema.js";
import { buildTemplateCatalogue, registeredTemplatePaths, serialiseTemplateCatalogue } from "../core/template-catalogue-build.js";
import { lintTemplateCatalogue } from "../core/template-catalogue-check.js";
import type { CatalogueFinding } from "../core/template-catalogue-check.js";

const DEFAULT_OUT = "schemas/template-descriptions.json";

function packageRoot(): string {
  const roots = resolvePackageRoots(dirname(fileURLToPath(import.meta.url)));
  if (roots.templatesRoot === null) throw new Error("installed templates are unavailable");
  return dirname(roots.templatesRoot);
}

function report(command: string, parsed: ParsedArgs, data: Record<string, unknown>, findings: CatalogueFinding[]): CommandResult {
  const exitCode = findings.length > 0 ? 1 : 0;
  if (parsed.json) return okJsonWithExit(command, { ...data, findings, errorCount: findings.length }, exitCode);
  const head = typeof data["summary"] === "string" ? data["summary"] : "";
  return { exitCode, stdout: [head, ...findings.map((f) => `  ✗ [${f.checkId}] ${f.message}`)].filter(Boolean).join("\n") + "\n" };
}

function fail(command: string, parsed: ParsedArgs, code: string, message: string): CommandResult {
  return parsed.json ? errJson(command, code, message) : errText(`ui: ${message}\n`);
}

function readSchema(root: string): Schema {
  return JSON.parse(readFileSync(join(root, "schemas", "template-descriptions.schema.json"), "utf8")) as Schema;
}

export function runTemplatesCatalogue(parsed: ParsedArgs): CommandResult {
  const command = "templates catalogue";
  const unknown = findUnknownFlag(parsed.flags, ["out", "check"]);
  if (unknown) return fail(command, parsed, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (parsed.positionals.length || parsed.flags["out"] === true) return fail(command, parsed, "BAD_ARG", "templates catalogue takes no positionals; --out requires a file path");
  const out = resolve(typeof parsed.flags["out"] === "string" ? parsed.flags["out"] : DEFAULT_OUT);
  let root: string; let schema: Schema;
  try { root = packageRoot(); schema = readSchema(root); }
  catch (e) { return fail(command, parsed, "SCHEMA_UNAVAILABLE", e instanceof Error ? e.message : String(e)); }
  const raw = new Map<string, Buffer>();
  try { for (const rel of registeredTemplatePaths()) raw.set(rel, readFileSync(join(root, "templates", rel))); }
  catch (e) { return fail(command, parsed, "TEMPLATE_UNREADABLE", e instanceof Error ? e.message : String(e)); }
  const emitted = serialiseTemplateCatalogue(buildTemplateCatalogue(raw));
  if (parsed.flags["check"] !== true) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, emitted);
    return report(command, parsed, { out, summary: `wrote ${out}` }, []);
  }
  let onDisk: string;
  try { onDisk = readFileSync(out, "utf8"); }
  catch { return report(command, parsed, { out, summary: `catalogue check: ${out}` }, [{ checkId: "catalogue-missing", message: `${out} does not exist; run ui templates catalogue --out ${out}` }]); }
  let findings: CatalogueFinding[];
  try { findings = lintTemplateCatalogue(JSON.parse(onDisk), schema); }
  catch { findings = [{ checkId: "catalogue-schema", message: `${out} is not valid JSON` }]; }
  if (findings.length === 0 && onDisk !== emitted) {
    findings = [{ checkId: "catalogue-drift", message: `${out} differs from the template frontmatter; run ui templates catalogue --out ${out}` }];
  }
  return report(command, parsed, { out, summary: `catalogue check: ${out}` }, findings);
}

export function runTemplatesLint(parsed: ParsedArgs): CommandResult {
  const command = "templates lint";
  const unknown = findUnknownFlag(parsed.flags, []);
  if (unknown) return fail(command, parsed, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (parsed.positionals.length > 1) return fail(command, parsed, "BAD_ARG", "templates lint takes at most one catalogue path");
  let root: string; let schema: Schema;
  try { root = packageRoot(); schema = readSchema(root); }
  catch (e) { return fail(command, parsed, "SCHEMA_UNAVAILABLE", e instanceof Error ? e.message : String(e)); }
  const file = resolve(parsed.positionals[0] ?? join(root, DEFAULT_OUT));
  let doc: unknown;
  try { doc = JSON.parse(readFileSync(file, "utf8")); }
  catch { return fail(command, parsed, "BAD_JSON", `cannot read '${file}' as JSON`); }
  return report(command, parsed, { file, summary: `templates lint: ${file}` }, lintTemplateCatalogue(doc, schema));
}
