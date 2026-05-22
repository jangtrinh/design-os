/**
 * `ui tokens` command — compile a DTCG token file to CSS / Tailwind / Figma.
 *
 * Subcommands: compile
 * Output goes to stdout (D3: no filesystem writes).
 * --json mode returns all three artifacts in one envelope.
 */
import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errText, errJson, ok, okJson, internalErr } from "../core/output.js";
import { parseTokenFile, TokenError } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { emitCss, emitTailwind, emitFigma } from "../core/token-emit.js";

const CMD = "tokens";
const COMPILE = "tokens compile";

const VALID_TARGETS = new Set(["css", "tailwind", "figma"]);

export const TOKENS_HELP = `ui tokens — DTCG token file compiler

Usage:
  ui tokens compile <file.json> [--target css|tailwind|figma] [--json]

Subcommands:
  compile   Read a DTCG token file and emit the chosen target to stdout

Options:
  --target  Output format: css (default), tailwind, figma
  --json    Return all three artifacts in a JSON envelope (ignores --target)
  -h, --help  Show this help

Output targets:
  css       CSS custom properties in :root { }
  tailwind  Tailwind v4 @theme { } block
  figma     Figma Tokens Studio flat JSON

Error codes:
  BAD_ARG          Missing file argument or unknown --target value
  FILE_NOT_FOUND   File does not exist (ENOENT)
  READ_ERROR       File exists but cannot be read (permission denied, is a directory, etc.)
  BAD_JSON         File is not valid JSON
  BAD_TOKEN        Token leaf is missing $type or $value
  ALIAS_CYCLE      Circular alias reference
  DANGLING_ALIAS   Alias points to a non-existent token
  TYPE_MISMATCH    Alias crosses incompatible $type boundary
`;

// ─── compile subcommand ───────────────────────────────────────────────────────

function runCompile(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  // 1. Resolve file path from positionals
  const filePath = parsed.positionals[0];
  if (filePath === undefined) {
    const msg = "ui tokens compile requires a <file> argument";
    return useJson ? errJson(COMPILE, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // 2. Validate --target (only in text mode; ignored in --json mode)
  const rawTarget = parsed.flags["target"];
  const target =
    rawTarget === undefined || rawTarget === true ? "css" : String(rawTarget);

  if (!useJson && !VALID_TARGETS.has(target)) {
    const msg = `unknown --target '${target}' — must be css, tailwind, or figma`;
    return errText(`ui: ${msg}\n`);
  }

  // 3. Read file
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error &&
      "code" in e &&
      (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = isNotFound
      ? `file not found: '${filePath}'`
      : `cannot read file '${filePath}': ${String(e instanceof Error ? e.message : e)}`;
    return useJson ? errJson(COMPILE, code, msg) : errText(`ui: ${msg}\n`);
  }

  // 4. Parse JSON
  let parsed_json: unknown;
  try {
    parsed_json = JSON.parse(raw) as unknown;
  } catch {
    const msg = `invalid JSON in '${filePath}'`;
    return useJson ? errJson(COMPILE, "BAD_JSON", msg) : errText(`ui: ${msg}\n`);
  }

  // 5. Parse token file
  let tree;
  try {
    tree = parseTokenFile(parsed_json);
  } catch (e) {
    if (e instanceof TokenError) {
      return useJson
        ? errJson(COMPILE, e.code, e.message)
        : errText(`ui: ${e.message}\n`);
    }
    return internalErr(String(e), useJson, COMPILE);
  }

  // 6. Resolve aliases
  let resolvedMap;
  try {
    resolvedMap = resolveTokens(tree);
  } catch (e) {
    if (e instanceof TokenError) {
      return useJson
        ? errJson(COMPILE, e.code, e.message)
        : errText(`ui: ${e.message}\n`);
    }
    return internalErr(String(e), useJson, COMPILE);
  }

  // 7. Emit
  const css = emitCss(resolvedMap);
  const tailwind = emitTailwind(resolvedMap);
  const figmaStr = emitFigma(resolvedMap);

  if (useJson) {
    let figmaData: unknown;
    try {
      figmaData = JSON.parse(figmaStr) as unknown;
    } catch {
      figmaData = figmaStr;
    }
    return okJson(COMPILE, { css, tailwind, figma: figmaData });
  }

  // Text mode — single target
  switch (target) {
    case "tailwind": return ok(tailwind);
    case "figma":    return ok(figmaStr);
    default:         return ok(css);
  }
}

// ─── Command registration object ──────────────────────────────────────────────

export const tokensCommand = {
  name: CMD,
  summary: "Compile a DTCG token file to CSS / Tailwind / Figma variables",
  hasSubcommands: true,
  help: TOKENS_HELP,
  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "compile": return runCompile(parsed);
      case undefined: {
        const msg = "ui tokens requires a subcommand. Run 'ui tokens --help'.";
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${sub}'. Run 'ui tokens --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
    }
  },
};
