/**
 * `ui ingest-figma-ds <ds.json>` — onboard an EXISTING Figma design system.
 *
 * The onboarding entry point (J0): takes a `figma-agent scan-design-system`
 * output (ds.json = Variables + Styles + Components inventory) and compiles it,
 * deterministically and with zero network / zero LLM, into ease-design's
 * portable stores so an AI can understand · remember · work on the DS anywhere:
 *   <out>/tokens.json             DTCG tokens (primitive literals + semantic aliases; Light/Dark modes)
 *   <out>/component-registry.json component inventory (name · variants · props), registry-store shape
 *   <out>/DESIGN.md               the human+AI-readable DS spec
 *   <out>/design/memory.events.jsonl  (with --seed-memory) so the DS is remembered
 *
 * Deterministic (identical ds.json + --name + --now → identical bytes). All the
 * heavy transform lives in src/core/figma-ds-*.ts; this file is the I/O boundary.
 *
 * LIVE-E2E PENDING (plugin): running `figma-agent scan-design-system` on a real
 * Figma file and feeding its ds.json here. Also pending: teaching the scan to
 * emit `valuesByMode` per mode name so Light/Dark land automatically (this
 * compiler already consumes that richer shape; the current scan emits one value).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve, join } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { saveRegistry } from "../core/registry-store.js";
import { parseDsFile, ingestDesignSystem, DsIngestError } from "../core/figma-ds-ingest.js";
import {
  buildEvent,
  validateEvent,
  nextEventId,
  MemoryEventError,
} from "../core/memory-events.js";
import type { EventType } from "../core/memory-events.js";
import { memoryPaths, ledgerLineCount, appendEvent, compileAndWrite } from "../core/memory-store.js";

const CMD = "ingest-figma-ds";

export const INGEST_FIGMA_DS_HELP = `ui ingest-figma-ds — onboard an existing Figma design system

Usage:
  ui ingest-figma-ds <ds.json> [--out <dir>] [--name <slug>] [--seed-memory] [--now <iso>] [--json]

Takes a 'figma-agent scan-design-system' output (Variables + Styles + Components)
and compiles it — deterministically, zero-network, zero-LLM — into ease-design's
portable stores so an AI can understand, remember, and work on the DS on any runtime.

Writes (into <out>, default: current directory):
  tokens.json             DTCG tokens — primitive literals + semantic aliases; Light/Dark modes
  component-registry.json component inventory (name, variants, props)
  DESIGN.md               the human+AI-readable design-system spec
  design/memory.events.jsonl  only with --seed-memory (records the DS as remembered)

Options:
  --out <dir>      Output directory (default: current working directory)
  --name <slug>    Design-system name for DESIGN.md (default: the --out folder name)
  --seed-memory    Also seed 'ui memory' (harvested + component_registered events)
  --now <iso>      Deterministic clock for the seeded memory graph (ISO-8601)
  --json           Emit a JSON envelope instead of human-readable text
  -h, --help       Show this help

Modes:
  A variable's base/Light mode becomes its $value; other modes (e.g. Dark) are
  preserved under $extensions and documented — 'ui tokens compile' stays valid.

Error codes:
  BAD_ARG          Missing <ds.json> positional, or invalid --now
  UNKNOWN_FLAG     Unrecognised --flag (rejected, with a did-you-mean hint)
  FILE_NOT_FOUND   ds.json does not exist (ENOENT)
  READ_ERROR       ds.json exists but cannot be read
  BAD_JSON         ds.json is not valid JSON
  BAD_DS           ds.json is not a scan-design-system output (missing components/tokens/styles)
  WRITE_ERROR      An output file could not be written
`;

function flagStr(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

/** Seed the project memory with the DS provenance + one event per component. */
function seedMemory(outDir: string, source: string, componentNames: string[], nowIso: string): void {
  const paths = memoryPaths(outDir);
  const events: Array<{ type: EventType; data: Record<string, unknown> }> = [
    { type: "harvested", data: { source, what: `${componentNames.length} components ingested from a Figma design system` } },
    ...componentNames.map((name) => ({ type: "component_registered" as EventType, data: { name } })),
  ];
  for (const e of events) {
    validateEvent(e.type, e.data, undefined);
    const id = nextEventId(ledgerLineCount(paths));
    appendEvent(paths, buildEvent({ id, t: nowIso, type: e.type, data: e.data, actor: "ingest-figma-ds", medium: "figma" }));
  }
  compileAndWrite(paths, nowIso);
}

function runIngest(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  // 1. Positional: ds.json path
  const dsPath = parsed.positionals[0];
  if (dsPath === undefined) return err("BAD_ARG", "ui ingest-figma-ds requires a <ds.json> path");

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

  // 3. Read + parse ds.json
  let raw: string;
  try {
    raw = readFileSync(dsPath, "utf8");
  } catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    return notFound
      ? err("FILE_NOT_FOUND", `file not found: '${dsPath}'`)
      : err("READ_ERROR", `cannot read '${dsPath}': ${e instanceof Error ? e.message : String(e)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return err("BAD_JSON", `invalid JSON in '${dsPath}'`);
  }

  // 4. Validate shape + transform
  let result;
  try {
    const ds = parseDsFile(json);
    const outDir = resolve(flagStr(parsed, "out") ?? process.cwd());
    const name = flagStr(parsed, "name") ?? basename(outDir);
    const source = `figma scan-design-system (${basename(dsPath)})`;
    result = { ...ingestDesignSystem(ds, name, source), outDir, source, name };
  } catch (e) {
    if (e instanceof DsIngestError) return err(e.code, e.message);
    throw e;
  }

  // 5. Write the portable stores
  const { outDir } = result;
  const tokensPath = join(outDir, "tokens.json");
  const registryPath = join(outDir, "component-registry.json");
  const designMdPath = join(outDir, "DESIGN.md");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(tokensPath, JSON.stringify(result.tree, null, 2) + "\n", "utf8");
    saveRegistry(registryPath, result.registry);
    writeFileSync(designMdPath, result.designMd, "utf8");
    if (parsed.flags["seed-memory"] === true) {
      seedMemory(outDir, result.source, result.componentNames, nowIso);
    }
  } catch (e) {
    if (e instanceof MemoryEventError) return err(e.code, `cannot seed memory: ${e.message}`);
    return err("WRITE_ERROR", `cannot write output: ${e instanceof Error ? e.message : String(e)}`);
  }

  const data = {
    out: outDir,
    tokens: tokensPath,
    registry: registryPath,
    designMd: designMdPath,
    counts: result.counts,
    tiers: { primitives: result.stats.primitives, semantics: result.stats.semantics, skippedTokens: result.stats.skippedTokens },
    componentsRegistered: result.componentNames.length,
    memorySeeded: parsed.flags["seed-memory"] === true,
  };
  if (useJson) return okJson(CMD, data);
  const lines = [
    `Ingested Figma design system → ${outDir}`,
    `  tokens.json            ${result.stats.primitives} primitives · ${result.stats.semantics} semantic${result.stats.skippedTokens > 0 ? ` (${result.stats.skippedTokens} skipped)` : ""}`,
    `  component-registry.json ${result.componentNames.length} components`,
    `  DESIGN.md              ${result.counts.styles} styles documented`,
    ...(data.memorySeeded ? ["  design/memory.events.jsonl  seeded"] : []),
  ];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}

export const ingestFigmaDsCommand = {
  name: CMD,
  summary: "Onboard an existing Figma design system (ds.json → tokens + registry + DESIGN.md)",
  hasSubcommands: false,
  help: INGEST_FIGMA_DS_HELP,
  run: runIngest,
};
