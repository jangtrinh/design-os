/**
 * `ui ds docs [--dir <project>] [--out <file>] [--format markdown|json]` —
 * regenerate component reference docs from the registry. Read-only (unless --out).
 * Decay-proof: the docs are a function of the registry + tokens, never hand-kept.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { parseTokenFile } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { loadRegistry } from "../core/registry-store.js";
import { buildDocsModel, renderMarkdown } from "../core/ds-docs.js";

const CMD = "ds docs";

/** Resolve token path → display value, best-effort (docs never require a sealed DS). */
function resolvedValues(designDir: string): Map<string, string> {
  const out = new Map<string, string>();
  const tokensPath = join(designDir, "design.tokens.json");
  if (!existsSync(tokensPath)) return out;
  try {
    const map = resolveTokens(parseTokenFile(JSON.parse(readFileSync(tokensPath, "utf8"))));
    for (const t of map) {
      out.set(t.path, typeof t.value === "object" && t.value !== null ? JSON.stringify(t.value) : String(t.value));
    }
  } catch {
    /* tokens unreadable → docs still render, just without resolved values */
  }
  return out;
}

export function runDocs(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const dirFlag = parsed.flags["dir"];
  const projectDir = typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd();
  const designDir = join(projectDir, "design");
  const regPath = join(designDir, "component-registry.json");
  if (!existsSync(regPath)) {
    return err("REGISTRY_NOT_FOUND", `no component-registry.json under '${designDir}' — run 'ui ds init' or 'ui registry register' first`);
  }

  const format = typeof parsed.flags["format"] === "string" ? parsed.flags["format"] : "markdown";
  if (!["markdown", "json"].includes(format)) {
    return err("BAD_ARG", `--format must be markdown | json, got '${format}'`);
  }

  let model;
  try {
    const registry = loadRegistry(regPath);
    model = buildDocsModel(registry.components, resolvedValues(designDir));
  } catch (e) {
    const code = (e as { code?: string }).code ?? "BAD_REGISTRY";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  const outFlag = parsed.flags["out"];
  const body = format === "json" ? JSON.stringify(model, null, 2) + "\n" : renderMarkdown(model);

  if (typeof outFlag === "string") {
    try {
      writeFileSync(resolve(outFlag), body, "utf8");
    } catch (e) {
      return err("WRITE_ERROR", `cannot write '${outFlag}': ${e instanceof Error ? e.message : String(e)}`);
    }
    const msg = `wrote docs for ${model.componentCount} component(s) → ${outFlag}\n`;
    return useJson ? okJson(CMD, { componentCount: model.componentCount, out: resolve(outFlag) }) : { exitCode: 0, stderr: msg };
  }

  return useJson ? okJson(CMD, model) : ok(body);
}
