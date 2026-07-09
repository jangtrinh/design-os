/**
 * `ui synthesize-conventions <usage-dna.json>` — learn a product's applied
 * conventions (C7). The onboarding companion to `ui ingest-figma-ds` (C0):
 * C0 extracts the DS vocabulary (tokens/components); this learns the applied
 * grammar — how real screens USE it — from a `figma-agent scan-conventions`
 * usage-dna.json, and compiles it, deterministically and with zero network /
 * zero LLM, into:
 *   <out>/CONVENTIONS.md            measured DO/DON'T with counts (+ DS cross-ref)
 *   <out>/design/memory.events.jsonl  (with --seed-memory) — prefers/avoids insights
 *
 * With --ds tokens.json, measured values are cross-referenced against the DS
 * scale so REAL deviations (off-grid spacing, off-scale radius, stray fonts,
 * raw/unbound fills) are separated from valid on-scale values. Deterministic:
 * identical usage-dna + tokens + --now → identical bytes. The heavy transform
 * lives in src/core/figma-conventions-*.ts; this file is the I/O boundary.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve, join } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import {
  parseDnaFile,
  parseDsScale,
  synthesizeConventions,
  ConvSynthError,
} from "../core/figma-conventions-synth.js";
import type { DsScale } from "../core/figma-conventions-synth.js";
import {
  buildEvent,
  validateEvent,
  nextEventId,
  MemoryEventError,
} from "../core/memory-events.js";
import { memoryPaths, ledgerLineCount, appendEvent, compileAndWrite } from "../core/memory-store.js";

const CMD = "synthesize-conventions";

export const SYNTHESIZE_CONVENTIONS_HELP = `ui synthesize-conventions — learn applied conventions from real screens

Usage:
  ui synthesize-conventions <usage-dna.json> [--ds <tokens.json>] [--out <dir>] [--seed-memory] [--now <iso>] [--json]

Takes a 'figma-agent scan-conventions' output (usage-dna.json — per-section
token-binding %, auto-layout %, radius/spacing histograms, component + font
counts) and compiles it — deterministically, zero-network, zero-LLM — into a
CONVENTIONS.md of measured DO/DON'T. It is the applied-grammar companion to
'ui ingest-figma-ds' (which extracts the DS vocabulary).

Writes (into <out>, default: current directory):
  CONVENTIONS.md              measured DO/DON'T with counts (Layout · Color · Spacing · Radius · Typography · Components · Per-section · Provenance)
  design/memory.events.jsonl  only with --seed-memory (prefers/avoids insight events)

Options:
  --ds <tokens.json>  DTCG tokens.json; cross-references the DS scale/grid so real
                      deviations (off-grid spacing, off-scale radius, stray fonts,
                      raw fills) are split from valid on-scale values
  --out <dir>         Output directory (default: current working directory)
  --seed-memory       Also seed 'ui memory' (a harvested anchor + prefers/avoids insights)
  --now <iso>         Deterministic clock for the seeded memory graph (ISO-8601)
  --json              Emit a JSON envelope instead of human-readable text
  -h, --help          Show this help

Error codes:
  BAD_ARG          Missing <usage-dna.json> positional, or invalid --now
  UNKNOWN_FLAG     Unrecognised --flag (rejected, with a did-you-mean hint)
  FILE_NOT_FOUND   usage-dna.json (or --ds tokens.json) does not exist (ENOENT)
  READ_ERROR       A file exists but cannot be read
  BAD_JSON         A file is not valid JSON
  BAD_DNA          usage-dna.json is not a scan-conventions output (not a section array)
  BAD_DS           --ds is not a DTCG tokens.json object
  WRITE_ERROR      An output file could not be written
`;

function flagStr(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

/** Read + JSON-parse a file, mapping fs/JSON failures onto the shared error helper. */
function readJson(path: string, err: (code: string, msg: string) => CommandResult): { json: unknown } | { fail: CommandResult } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    return { fail: notFound
      ? err("FILE_NOT_FOUND", `file not found: '${path}'`)
      : err("READ_ERROR", `cannot read '${path}': ${e instanceof Error ? e.message : String(e)}`) };
  }
  try {
    return { json: JSON.parse(raw) as unknown };
  } catch {
    return { fail: err("BAD_JSON", `invalid JSON in '${path}'`) };
  }
}

/** Seed project memory with a harvested anchor + one insight per prefers/avoids line. */
function seedMemory(outDir: string, source: string, insights: string[], nowIso: string): void {
  const paths = memoryPaths(outDir);
  let n = ledgerLineCount(paths);
  const harvestData = { source, what: "applied conventions learned from real screens" };
  validateEvent("harvested", harvestData, undefined);
  const harvestedId = nextEventId(n);
  appendEvent(paths, buildEvent({ id: harvestedId, t: nowIso, type: "harvested", data: harvestData, actor: CMD, medium: "figma" }));
  n += 1;
  for (const text of insights) {
    const data = { text };
    validateEvent("insight", data, [harvestedId]);
    const id = nextEventId(n);
    appendEvent(paths, buildEvent({ id, t: nowIso, type: "insight", data, actor: CMD, medium: "figma", refs: [harvestedId] }));
    n += 1;
  }
  compileAndWrite(paths, nowIso);
}

function runSynthesize(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  // 1. Positional: usage-dna.json path
  const dnaPath = parsed.positionals[0];
  if (dnaPath === undefined) return err("BAD_ARG", "ui synthesize-conventions requires a <usage-dna.json> path");

  // 2. --now (optional; must be ISO if present)
  const nowFlag = parsed.flags["now"];
  let nowIso: string;
  if (nowFlag === undefined) {
    nowIso = new Date().toISOString();
  } else if (typeof nowFlag === "string" && !Number.isNaN(Date.parse(nowFlag))) {
    nowIso = nowFlag;
  } else {
    return err("BAD_ARG", `--now expected an ISO-8601 timestamp, got '${String(nowFlag)}'`);
  }

  // 3. Read + parse the usage-dna.json
  const dnaRead = readJson(dnaPath, err);
  if ("fail" in dnaRead) return dnaRead.fail;

  // 4. Optionally read + parse the DS tokens.json
  let ds: DsScale | undefined;
  const dsPath = flagStr(parsed, "ds");
  let dsScale: DsScale | undefined;
  if (dsPath !== undefined) {
    const dsRead = readJson(dsPath, err);
    if ("fail" in dsRead) return dsRead.fail;
    try {
      dsScale = parseDsScale(dsRead.json);
    } catch (e) {
      if (e instanceof ConvSynthError) return err(e.code, e.message);
      throw e;
    }
    ds = dsScale;
  }

  // 5. Validate the DNA shape + synthesize
  let result;
  try {
    const dna = parseDnaFile(dnaRead.json);
    const source = basename(dnaPath);
    result = synthesizeConventions(dna, ds, source);
  } catch (e) {
    if (e instanceof ConvSynthError) return err(e.code, e.message);
    throw e;
  }

  // 6. Write CONVENTIONS.md (+ optional memory seed)
  const outDir = resolve(flagStr(parsed, "out") ?? process.cwd());
  const conventionsPath = join(outDir, "CONVENTIONS.md");
  const seed = parsed.flags["seed-memory"] === true;
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(conventionsPath, result.conventionsMd, "utf8");
    if (seed) seedMemory(outDir, `figma scan-conventions (${basename(dnaPath)})`, result.insights, nowIso);
  } catch (e) {
    if (e instanceof MemoryEventError) return err(e.code, `cannot seed memory: ${e.message}`);
    return err("WRITE_ERROR", `cannot write output: ${e instanceof Error ? e.message : String(e)}`);
  }

  const data = {
    out: outDir,
    conventions: conventionsPath,
    stats: result.stats,
    dsCrossReferenced: ds !== undefined,
    insights: result.insights,
    memorySeeded: seed,
  };
  if (useJson) return okJson(CMD, data);
  const lines = [
    `Synthesized applied conventions → ${outDir}`,
    `  CONVENTIONS.md  ${result.stats.walkedSections} sections · ${result.stats.screens} screens · ${result.stats.autoPct}% auto-layout · ${result.stats.tokenizedPct}% token-bound fills`,
    ...(ds !== undefined ? [`  deviations      ${result.stats.deviations} (cross-referenced against the DS)`] : ["  deviations      not computed (no --ds supplied)"]),
    ...(result.stats.truncated.length > 0 ? [`  truncated       ${result.stats.truncated.join(", ")} (re-scan with a higher --budget)`] : []),
    ...(seed ? [`  design/memory.events.jsonl  seeded (${result.insights.length} insights)`] : []),
  ];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}

export const synthesizeConventionsCommand = {
  name: CMD,
  summary: "Learn applied conventions from real screens (usage-dna.json → CONVENTIONS.md)",
  hasSubcommands: false,
  help: SYNTHESIZE_CONVENTIONS_HELP,
  run: runSynthesize,
};
