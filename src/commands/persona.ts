/**
 * `ui persona` — persona-family corpus checks (PR-FU5b A2: thin-family floor).
 *
 * Read-only. `lint` judges `knowledge/personas/families.json` (or any file in
 * the same shape) against a screens-per-app floor and a minimum app count,
 * treating a family's own `history` note as a declared exception.
 */
import { readFileSync } from "node:fs";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { lintThinFamilies } from "../core/persona-lint-thin-family.js";
import type { ThinFamilyInput } from "../core/persona-lint-thin-family.js";

const CMD = "persona";
const DEFAULT_MIN_SCREENS_PER_APP = 6;

export const PERSONA_HELP = `ui persona — persona-family corpus checks

Usage:
  ui persona lint <families.json> [--min-screens-per-app 6] [--json]

Subcommands:
  lint  Thin-family floor: for every family, reports screens/apps and flags
        \`thin\` when the ratio is below the floor or apps < 3, listing the
        slug. Exit 1 when any thin family lacks a \`history\` entry whose note
        contains "thin" or "provisional" — a declared gap, not a silent one.

Options:
  --min-screens-per-app <n>  Minimum screens/apps ratio before a family is
                             flagged thin (default 6)
  --json                     Emit a JSON envelope instead of human-readable output
  -h, --help                 Show this help

Exit codes:
  0  No thin-and-unexcused family
  1  At least one family is thin and lacks an excusing history note, or a
     user/file error

Error codes:
  BAD_ARG         Missing subcommand, missing <families.json>, or
                  --min-screens-per-app not a positive number
  UNKNOWN_FLAG    An unrecognised --flag
  FILE_NOT_FOUND  <families.json> does not exist
  READ_ERROR      <families.json> exists but cannot be read
  BAD_JSON        <families.json> is not valid JSON, or has no "families" array
`;

function runLint(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const file = parsed.positionals[0];
  if (file === undefined) {
    const msg = "ui persona lint requires <families.json>";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const floorFlag = parsed.flags["min-screens-per-app"];
  let minScreensPerApp = DEFAULT_MIN_SCREENS_PER_APP;
  if (typeof floorFlag === "string") {
    const n = Number(floorFlag);
    if (!Number.isFinite(n) || n <= 0) {
      const msg = `--min-screens-per-app must be a positive number, got '${floorFlag}'`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    minScreensPerApp = n;
  }

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = isNotFound ? `file not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  let doc: { families?: unknown };
  try {
    doc = JSON.parse(raw) as { families?: unknown };
  } catch (e) {
    const msg = `'${file}' is not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "BAD_JSON", msg) : errText(`ui: ${msg}\n`);
  }
  if (!Array.isArray(doc.families)) {
    const msg = `'${file}' has no "families" array`;
    return useJson ? errJson(CMD, "BAD_JSON", msg) : errText(`ui: ${msg}\n`);
  }

  const families: ThinFamilyInput[] = (doc.families as Array<Record<string, unknown>>).map((f) => ({
    slug: typeof f["slug"] === "string" ? f["slug"] : "",
    apps: typeof f["apps"] === "number" ? f["apps"] : 0,
    screens: typeof f["screens"] === "number" ? f["screens"] : 0,
    history: Array.isArray(f["history"]) ? (f["history"] as Array<{ note?: unknown }>) : undefined,
  }));

  const result = lintThinFamilies(families, minScreensPerApp);
  const exitCode = result.pass ? 0 : 1;

  if (useJson) {
    return okJsonWithExit(CMD, { file, minScreensPerApp, ...result }, exitCode);
  }

  const lines = [`persona lint: ${file} — floor ${minScreensPerApp} screens/app, min 3 apps`];
  for (const r of result.rows) {
    const status = !r.thin ? "" : r.excused ? " thin (excused)" : " thin";
    lines.push(`  ${!r.thin ? " " : r.excused ? "!" : "✗"} ${r.slug}  apps=${r.apps} screens=${r.screens} ratio=${r.ratio.toFixed(1)}${status}`);
  }
  lines.push(
    "",
    result.pass
      ? "PASS — no unexcused thin family"
      : `FAIL — ${result.failing.length} thin famil${result.failing.length === 1 ? "y" : "ies"} without a history note: ${result.failing.join(", ")}`,
  );
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

export const personaCommand = {
  name: CMD,
  summary: "Persona-family corpus checks (thin-family floor)",
  hasSubcommands: true,
  help: PERSONA_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "lint":
        return runLint(parsed);
      case undefined:
        return parsed.json
          ? errJson(CMD, "BAD_ARG", "ui persona requires a subcommand (lint). Run 'ui persona --help'.")
          : errText("ui: ui persona requires a subcommand (lint). Run 'ui persona --help'.\n");
      default:
        return parsed.json
          ? errJson(CMD, "BAD_ARG", `unknown subcommand '${parsed.subcommand}'. Run 'ui persona --help'.`)
          : errText(`ui: unknown subcommand '${parsed.subcommand}'. Run 'ui persona --help'.\n`);
    }
  },
};
