/**
 * `ui ds diff <base-dir> <head-dir>` — compare two design-system states and classify
 * the change (semver + computed visual-breaking). Read-only; pure comparison over two
 * materialised states. The host produces the two dirs (e.g. from git refs):
 *   mkdir -p /tmp/base && git show REF:design/design.tokens.json > /tmp/base/design.tokens.json
 * Each dir needs `design.tokens.json`; `component-registry.json` is optional.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { parseTokenFile } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { diffDesignSystem } from "../core/ds-diff.js";
import type { DsState, DiffComponent } from "../core/ds-diff.js";
import { formatMarkdown, formatPrComment } from "../core/ds-diff-format.js";

const CMD = "ds diff";

function loadState(dir: string): DsState {
  const tokensPath = join(dir, "design.tokens.json");
  if (!existsSync(tokensPath)) {
    throw Object.assign(new Error(`no design.tokens.json in '${dir}'`), { code: "FILE_NOT_FOUND" });
  }
  let tokenJson: unknown;
  try {
    tokenJson = JSON.parse(readFileSync(tokensPath, "utf8"));
  } catch (e) {
    throw Object.assign(new Error(`invalid JSON in '${tokensPath}': ${e instanceof Error ? e.message : String(e)}`), { code: "BAD_JSON" });
  }
  let tokens;
  try {
    tokens = resolveTokens(parseTokenFile(tokenJson));
  } catch (e) {
    throw Object.assign(new Error(`bad token file '${tokensPath}': ${e instanceof Error ? e.message : String(e)}`), { code: "BAD_JSON" });
  }

  const components: DiffComponent[] = [];
  const regPath = join(dir, "component-registry.json");
  if (existsSync(regPath)) {
    let regJson: { components?: unknown };
    try {
      regJson = JSON.parse(readFileSync(regPath, "utf8")) as { components?: unknown };
    } catch (e) {
      throw Object.assign(new Error(`invalid JSON in '${regPath}': ${e instanceof Error ? e.message : String(e)}`), { code: "BAD_JSON" });
    }
    const list = Array.isArray(regJson.components) ? regJson.components : [];
    for (const c of list as Record<string, unknown>[]) {
      if (typeof c["name"] !== "string") continue;
      components.push({
        name: c["name"],
        category: typeof c["category"] === "string" ? c["category"] : "",
        tokensUsed: Array.isArray(c["tokensUsed"]) ? (c["tokensUsed"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
        variants: Array.isArray(c["variants"]) ? (c["variants"] as unknown[]).filter((x): x is string => typeof x === "string") : undefined,
        states: Array.isArray(c["states"]) ? (c["states"] as unknown[]).filter((x): x is string => typeof x === "string") : undefined,
        markup: typeof c["markup"] === "string" ? c["markup"] : undefined,
      });
    }
  }
  return { tokens, components };
}

function posInt(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function runDiff(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const baseDir = parsed.positionals[0];
  const headDir = parsed.positionals[1];
  if (baseDir === undefined || headDir === undefined) {
    return err("BAD_ARG", "ui ds diff requires <base-dir> and <head-dir> (each holding design.tokens.json)");
  }

  const format = typeof parsed.flags["format"] === "string" ? parsed.flags["format"] : "markdown";
  if (!["markdown", "json", "pr-comment"].includes(format)) {
    return err("BAD_ARG", `--format must be markdown | json | pr-comment, got '${format}'`);
  }

  let base: DsState, head: DsState;
  try {
    base = loadState(resolve(baseDir));
    head = loadState(resolve(headDir));
  } catch (e) {
    const code = (e as { code?: string }).code ?? "READ_ERROR";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  const baseVersion = typeof parsed.flags["base-version"] === "string" ? parsed.flags["base-version"] : undefined;
  const diff = diffDesignSystem(base, head, {
    ...(posInt(parsed.flags["color-tolerance"]) !== undefined ? { colorTolerance: posInt(parsed.flags["color-tolerance"]) } : {}),
    ...(posInt(parsed.flags["dim-tolerance"]) !== undefined ? { dimensionTolerancePct: posInt(parsed.flags["dim-tolerance"]) } : {}),
    ...(baseVersion !== undefined ? { baseVersion } : {}),
  });

  // A dangling reference is a genuine broken state (like coverage's unknownRefs) → exit 1.
  const exitCode = diff.dangling.length > 0 ? 1 : 0;

  if (useJson) return okJsonWithExit(CMD, diff, exitCode);
  const text = format === "pr-comment" ? formatPrComment(diff, baseVersion) : formatMarkdown(diff, baseVersion);
  return { exitCode, stdout: text };
}
