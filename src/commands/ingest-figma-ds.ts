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
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { basename, resolve, join } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errJsonWithData, errText, okJson } from "../core/output.js";
import { saveRegistry } from "../core/registry-store.js";
import { registryFileForDir } from "../core/design-system.js";
import { parseDsFile, planIngest, DsIngestError } from "../core/figma-ds-ingest.js";
import { leftOutLines } from "../core/figma-ds-designdoc-ledger.js";
import { ledgerLines } from "../core/figma-ds-ledger.js";
import { blockOnOpenClusters } from "../core/owner-rulings/block-contract.js";
import type { ClusterKind } from "../core/owner-rulings/cluster-kinds.js";
import { RulingStoreError, readRulingStore } from "../core/owner-rulings/ruling-store.js";
import { MemoryEventError } from "../core/memory-events.js";
import { MemoryAppendCommittedError } from "../core/memory-error.js";
import { memoryPaths } from "../core/memory-store.js";
import { INGEST_FIGMA_DS_HELP } from "./ingest-figma-ds-help.js";
import { seedMemory } from "./ingest-figma-ds-memory.js";

export { INGEST_FIGMA_DS_HELP } from "./ingest-figma-ds-help.js";

const CMD = "ingest-figma-ds";

/** The questions this command computes completely: it replaces its own stored ones with what it finds now. */
const OWN_KINDS: readonly ClusterKind[] = [
  "figma-collections", "token-path-collision", "figma-library-pages", "screen-pages",
  "archived-marked-nodes", "duplicate-component-names", "classification-conflicts", "untypeable-tokens",
];

function flagStr(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
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
  // Guard: --out must not resolve to a directory literally named "design" — that is
  // the sealed path (design/component-registry.json, design/ds.manifest.json) that
  // `ds init` and `ds import` own. This command writes the portable, UNSEALED bundle;
  // landing it at the sealed path would drop an unsealed component-registry.json where
  // loadDesignSystem expects a manifest-backed one. Refuse before any write.
  const outDir = resolve(flagStr(parsed, "out") ?? process.cwd());
  if (basename(outDir) === "design") {
    return err(
      "SEALED_PATH_COLLISION",
      `--out '${outDir}' is the sealed design-system path (a directory named 'design') — ` +
        "ingest-figma-ds writes an unsealed bundle and must not land it there. Use a " +
        "different --out, then 'ui ds import' to seal it into a project's design/ directory.",
    );
  }

  const cwd = resolve(flagStr(parsed, "cwd") ?? process.cwd());
  // A typo in --cwd must not create a project: the questions would be stored where nobody looks.
  if (flagStr(parsed, "cwd") !== undefined && !(existsSync(cwd) && statSync(cwd).isDirectory())) {
    return err("BAD_ARG", `--cwd '${cwd}' is not an existing directory; nothing was created`);
  }
  try {
    const ds = parseDsFile(json);
    const name = flagStr(parsed, "name") ?? basename(outDir);
    const source = `figma scan-design-system (${basename(dsPath)})`;
    const plan = planIngest(ds, name, source, readRulingStore(cwd).rulings);
    const blocked = blockOnOpenClusters({ command: CMD, projectDir: cwd, detections: plan.detections, ownKinds: OWN_KINDS, json: useJson });
    if (blocked !== null) return blocked;
    if (plan.result === null) throw new Error("the ingest has no open question and no result: this is a bug in the ingest stages");
    result = { ...plan.result, outDir, source, name };
  } catch (e) {
    if (e instanceof DsIngestError || e instanceof RulingStoreError) return err(e.code, e.message);
    throw e;
  }

  // 5. Write the portable stores (outDir was resolved and guarded above)
  const tokensPath = join(outDir, "tokens.json");
  // Stage-4 N6 — route through the shared resolver so a foreign artifact (e.g. a project's
  // own generated component registry) already occupying `component-registry.json` is never
  // overwritten; the kernel writes `figma-component-registry.json` instead. Every other
  // registry consumer (figma reconcile, ds diff/docs/specimen) resolves the same way.
  const { path: registryPath, foreignRegistryAtDefaultPath } = registryFileForDir(outDir);
  const designMdPath = join(outDir, "DESIGN.md");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(tokensPath, JSON.stringify(result.tree, null, 2) + "\n", "utf8");
    saveRegistry(registryPath, result.registry);
    writeFileSync(designMdPath, result.designMd, "utf8");
    if (parsed.flags["seed-memory"] === true) {
      seedMemory(outDir, result.source, result.componentNames, result.icons.count, result.screens.length, nowIso);
    }
  } catch (e) {
    if (e instanceof MemoryAppendCommittedError) {
      return useJson
        ? errJsonWithData(CMD, e.code, e.message, { committed: true, id: e.id, ids: e.ids, partial: e.partial, ledger: memoryPaths(outDir).ledger, warn: e.message })
        : errText(`ui: ${e.message}\n`);
    }
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
    icons: result.icons.count,
    screens: result.screens.length,
    memorySeeded: parsed.flags["seed-memory"] === true,
    ledger: result.ledger,
    excluded: result.excluded,
    pageSignal: result.pageSignal,
    bindings: result.bindings,
    ...(result.frames === null ? {} : { frames: result.frames }),
    ...(foreignRegistryAtDefaultPath && { foreignRegistryAtDefaultPath }),
  };
  if (useJson) return okJson(CMD, data);
  const classifiedNote = [
    ...(result.icons.count > 0 ? [`${result.icons.count} icons`] : []),
    ...(result.screens.length > 0 ? [`${result.screens.length} screens`] : []),
  ];
  const lines = [
    `Ingested Figma design system → ${outDir}`,
    `  tokens.json            ${result.stats.primitives} primitives · ${result.stats.semantics} semantic${result.stats.skippedTokens > 0 ? ` (${result.stats.skippedTokens} skipped)` : ""}`,
    `  component-registry.json ${result.componentNames.length} components${classifiedNote.length > 0 ? ` (${classifiedNote.join(" · ")} classified out)` : ""}`,
    `  DESIGN.md              ${result.counts.styles} styles documented`,
    ...(data.memorySeeded ? ["  design/memory.events.jsonl  seeded"] : []),
    "  ledger",
    ...ledgerLines(result.ledger).map((l) => `    ${l}`),
    ...leftOutLines(result.excluded).map((l) => `    ${l}`),
    ...(result.pageSignal === "absent" && result.ledger.in.components > 0 ? ["    pageSignal: absent (the scan carries no page; the page question was skipped)"] : []),
    ...(foreignRegistryAtDefaultPath
      ? [`  ! component-registry.json is a FOREIGN file — wrote ${registryPath} instead`]
      : []),
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
