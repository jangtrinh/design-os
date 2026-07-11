/**
 * `ui changelog [--dir <project>] [--format markdown|json]` — fold the DS manifest
 * changelog + recorded design decisions into a readable design changelog. Read-only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { buildChangelog, renderMarkdown } from "../core/changelog.js";
import type { DecisionInput } from "../core/changelog.js";
import type { DSChangelogEntry } from "../core/ds-manifest.js";
import { parseLedger } from "../core/memory-events.js";

const CMD = "changelog";

export const CHANGELOG_HELP = `ui changelog — fold the design-system history into a readable changelog

Usage:
  ui changelog [--dir <project>] [--format markdown|json]

Reads <project>/design/ds.manifest.json (changelog[]) and, if present,
design/memory.events.jsonl (recorded 'insight' decisions with provenance), and
emits a Keep-a-Changelog-style history — Added / Changed / Decisions, newest first,
each line provenance-tagged. Pure, read-only, zero-network.

Options:
  --dir <path>   Project directory holding design/ (default: cwd)
  --format <f>   markdown (default) | json
  -h, --help     Show this help

Error codes:
  BAD_ARG       Unknown --format value
  UNKNOWN_FLAG  Unrecognised --flag
  NO_MEMORY     No ds.manifest.json under the project (nothing to fold)
  BAD_JSON      The manifest is not valid JSON
`;

function readManifestChangelog(designDir: string): { name?: string; changelog: DSChangelogEntry[] } | { error: string } {
  const p = join(designDir, "ds.manifest.json");
  if (!existsSync(p)) return { error: "NO_MEMORY" };
  let m: { name?: unknown; changelog?: unknown };
  try {
    m = JSON.parse(readFileSync(p, "utf8")) as typeof m;
  } catch {
    return { error: "BAD_JSON" };
  }
  const changelog = Array.isArray(m.changelog) ? (m.changelog as DSChangelogEntry[]) : [];
  return { ...(typeof m.name === "string" ? { name: m.name } : {}), changelog };
}

function readDecisions(designDir: string): DecisionInput[] {
  const p = join(designDir, "memory.events.jsonl");
  if (!existsSync(p)) return [];
  try {
    return parseLedger(readFileSync(p, "utf8"))
      .filter((e) => e.type === "insight" && typeof e.data["text"] === "string")
      .map((e) => ({ t: e.t, text: e.data["text"] as string, ...(e.refs !== undefined ? { refs: e.refs } : {}) }));
  } catch {
    return []; // a malformed ledger must not break the DS changelog
  }
}

export const changelogCommand = {
  name: CMD,
  summary: "Fold the design-system history into a readable changelog",
  hasSubcommands: false,
  help: CHANGELOG_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const err = (code: string, msg: string): CommandResult => useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

    const format = typeof parsed.flags["format"] === "string" ? parsed.flags["format"] : "markdown";
    if (!["markdown", "json"].includes(format)) return err("BAD_ARG", `--format must be markdown | json, got '${format}'`);

    const dirFlag = parsed.flags["dir"];
    const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");

    const mf = readManifestChangelog(designDir);
    if ("error" in mf) {
      return mf.error === "NO_MEMORY"
        ? err("NO_MEMORY", `no ds.manifest.json under '${designDir}' — run 'ui ds init' first`)
        : err("BAD_JSON", `ds.manifest.json in '${designDir}' is not valid JSON`);
    }

    const model = buildChangelog(mf.changelog, readDecisions(designDir));
    if (useJson) return okJson(CMD, { ...(mf.name !== undefined ? { name: mf.name } : {}), ...model });
    return ok(renderMarkdown(model, mf.name));
  },
};
