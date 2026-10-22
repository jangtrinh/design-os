/**
 * `ui reuse-plan check <file> [--dir <project>] [--file <registry>] [--tokens <file>] [--json]`
 * — I/O shell around the pure checker. Exit 0 ok / 1 findings / 2 cannot run (no usable
 * registry, unreadable plan).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { registryFileForDir } from "../core/design-system.js";
import { loadRegistry } from "../core/registry-store.js";
import { parseTokenFile } from "../core/token-model.js";
import type { TokenTree } from "../core/token-model.js";
import { parseReusePlan } from "../core/reuse-plan-parse.js";
import { buildNameIndex } from "../core/reuse-plan-names.js";
import type { RegistryNameEntry } from "../core/reuse-plan-names.js";
import { checkReusePlan } from "../core/reuse-plan-check.js";
import { renderReusePlanText } from "../core/reuse-plan-render.js";

const CMD = "reuse-plan check";

/** A command that could not run at all — exit 2, distinct from "ran and found problems" (1). */
function cannotRun(json: boolean, code: string, message: string): CommandResult {
  const res = json ? errJson(CMD, code, message) : errText(`ui: ${message}\n`);
  return { ...res, exitCode: 2 };
}

/** Token tree for rung-6 paths, or the reason it is unavailable. Read lazily, once. */
function tokenLoader(path: string): () => TokenTree | string {
  let cached: TokenTree | string | undefined;
  return () => {
    if (cached !== undefined) return cached;
    if (!existsSync(path)) return (cached = `no design tokens file at '${path}'`);
    try { cached = parseTokenFile(JSON.parse(readFileSync(path, "utf8"))); }
    catch (e) { cached = `tokens file '${path}' is unreadable: ${e instanceof Error ? e.message : String(e)}`; }
    return cached;
  };
}

/** Stems of `<designDir>/patterns/*.md`, README excluded; empty when the folder is absent. */
function patternFileStems(designDir: string): string[] {
  const dir = join(designDir, "patterns");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md") && f.toLowerCase() !== "readme.md")
    .map((f) => f.slice(0, -3))
    .sort();
}

export function runReusePlanCheck(parsed: ParsedArgs): CommandResult {
  const json = parsed.json;
  const usage = (message: string): CommandResult => (json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`));

  const file = parsed.positionals[0];
  if (file === undefined) return usage("ui reuse-plan check requires <file> (the task's reuse-plan.md)");
  const flags = { dir: parsed.flags["dir"], file: parsed.flags["file"], tokens: parsed.flags["tokens"] };
  for (const [name, v] of Object.entries(flags)) {
    if (v === true) return usage(`--${name} requires a value`);
  }
  const designDir = join(typeof flags.dir === "string" ? resolve(flags.dir) : process.cwd(), "design");
  const tokensPath = typeof flags.tokens === "string" ? resolve(flags.tokens) : join(designDir, "design.tokens.json");

  let text: string;
  try { text = readFileSync(file, "utf8"); }
  catch (e) {
    const missing = e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT";
    return cannotRun(json, missing ? "FILE_NOT_FOUND" : "READ_ERROR", missing ? `reuse plan not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const reg = typeof flags.file === "string"
    ? { path: resolve(flags.file), foreignRegistryAtDefaultPath: false }
    : registryFileForDir(designDir);
  if (!existsSync(reg.path)) {
    const foreign = reg.foreignRegistryAtDefaultPath ? " (a non-kernel component-registry.json occupies the default name and was not read)" : "";
    return cannotRun(json, "REGISTRY_NOT_FOUND", `no component registry at '${reg.path}'${foreign} — the plan cannot be checked without one; pass --dir <project> or --file <registry>`);
  }
  let entries: RegistryNameEntry[];
  try {
    entries = loadRegistry(reg.path).components.map((c) => ({
      name: c.name,
      variants: Array.isArray(c.variants) ? c.variants.filter((v): v is string => typeof v === "string") : [],
    }));
  } catch (e) {
    const code = e !== null && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "BAD_REGISTRY";
    return cannotRun(json, code, e instanceof Error ? e.message : String(e));
  }
  if (entries.some((c) => typeof c.name !== "string")) return cannotRun(json, "BAD_REGISTRY", `registry '${reg.path}' has a component without a string name`);

  const index = buildNameIndex(entries, patternFileStems(designDir));
  const result = checkReusePlan(parseReusePlan(text), { names: index, tokens: tokenLoader(tokensPath) });
  const exitCode = result.findings.length > 0 ? 1 : 0;
  if (json) {
    return okJsonWithExit(CMD, {
      file, registry: reg.path, registrySize: index.size, tokens: tokensPath, ok: exitCode === 0,
      errorCount: result.findings.length, warningCount: result.warnings.length, ...result,
    }, exitCode);
  }
  return { exitCode, stdout: renderReusePlanText(file, reg.path, tokensPath, index.size, result) };
}
