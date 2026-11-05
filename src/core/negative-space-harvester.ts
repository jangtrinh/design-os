/**
 * negative-space-harvester.ts - count the cliches a codebase never uses.
 *
 * Onboarding records what exists; this records what is absent, and proves it with a denominator: every
 * probe answers `count` over `scannedFiles`, lists what it excluded and why, and says what it could
 * not judge (Art VIII: no "absent" without the files that were looked at). A zero is evidence, not a
 * decision; turning it into a proposal is negative-space-proposals.ts, and a ban is the owner's act.
 *
 * Sources come from the polyglot UI walk (same excludes, same skip reporting), plus token JSON files
 * (`*token*.json`) for the probes where a palette or font token is evidence. A Figma inventory
 * (`design/ds.json`, `design/canvas-inventory.json`) holds component names and sizes only, so it can
 * add hits by name/size and can never count a fill or font probe as zero: those say what is missing.
 *
 * Deterministic: sorted walk, no clock, no network; two runs over one tree give identical reports.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DSError } from "./design-system.js";
import { makeFileCtx } from "./negative-space-detector-kit.js";
import type { Exclusion, FileCtx, Hit } from "./negative-space-detector-kit.js";
import { NEGATIVE_SPACE_PROBES } from "./negative-space-probes.js";
import type { FigmaComponent } from "./negative-space-probes.js";
import { EXCLUDED_UI_DIRECTORIES, MAX_UI_FILE_BYTES, walkUiSources } from "./polyglot-ui-walk.js";
import type { UiSkip } from "./polyglot-ui-walk.js";

export type { Exclusion, Hit } from "./negative-space-detector-kit.js";

export const HIT_CAP = 10;
export const EXCLUDED_CAP = 20;
const INVENTORY_FILES = ["ds.json", "canvas-inventory.json"] as const;

export interface ProbeResult {
  id: string;
  slug: string;
  summary: string;
  /** Occurrences found in the files read plus Figma name/size hits. */
  count: number;
  /** Files this probe read (UI source, plus token JSON for the probes that use it). */
  scannedFiles: number;
  /** The first HIT_CAP hits in walk order; `hitsOmitted` is the rest. */
  hits: Hit[];
  hitsOmitted: number;
  excluded: Exclusion[];
  excludedOmitted: number;
  /** What a Figma inventory could not show for this probe (empty when no inventory is present). */
  notEvaluated: string[];
  /** Components the inventory contributed (0 without one). */
  figmaScanned: number;
}
export interface HarvestReport {
  sourceDir: string;
  walk: { uiFiles: number; tokenJsonFiles: number; total: number; skipped: UiSkip[] };
  figma: { present: boolean; files: string[]; components: number };
  probes: ProbeResult[];
}
export interface HarvestOptions {
  sourceDir: string;
  /** The project's `design/` directory: where the Figma inventory is looked for. */
  designDir?: string;
  /** Relative path prefixes (`design/`) to leave out, e.g. the design system's own store. */
  skipPrefixes?: readonly string[];
}

/** Token JSON files met outside excluded directories; unreadable or oversized ones are reported, not read. */
function walkTokenJson(root: string, skipPrefixes: readonly string[]): { files: string[]; relative: string[]; skipped: UiSkip[] } {
  const out = { files: [] as string[], relative: [] as string[], skipped: [] as UiSkip[] };
  const visit = (abs: string, rel: string): void => {
    let names: string[];
    try { names = readdirSync(abs).sort(); } catch { return; } // the UI walk already reported this directory
    for (const name of names) {
      const childAbs = join(abs, name);
      const childRel = rel === "" ? name : `${rel}/${name}`;
      let st;
      try { st = lstatSync(childAbs); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!EXCLUDED_UI_DIRECTORIES.includes(name)) visit(childAbs, childRel); continue; }
      if (!st.isFile() || !/token.*\.json$/i.test(name) || skipPrefixes.some((p) => childRel.startsWith(p))) continue;
      if (st.size > MAX_UI_FILE_BYTES) out.skipped.push({ path: childRel, reason: `larger than ${MAX_UI_FILE_BYTES / (1024 * 1024)} MB (${st.size} bytes)` });
      else { out.files.push(childAbs); out.relative.push(childRel); }
    }
  };
  visit(root, "");
  return out;
}

function readInventory(designDir: string): { files: string[]; components: (FigmaComponent & { file: string })[] } {
  const files: string[] = [];
  const components: (FigmaComponent & { file: string })[] = [];
  for (const name of INVENTORY_FILES) {
    const path = join(designDir, name);
    if (!existsSync(path)) continue;
    let doc: unknown;
    try { doc = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")); }
    catch (e) { throw new DSError("BAD_JSON", `Figma inventory '${path}' is not readable JSON (${e instanceof Error ? e.message : String(e)}). Fix the file or remove it.`); }
    const label = `design/${name}`;
    files.push(label);
    const o = (doc !== null && typeof doc === "object" ? doc : {}) as Record<string, unknown>;
    for (const key of ["components", "componentSets"]) {
      const list = Array.isArray(o[key]) ? (o[key] as unknown[]) : [];
      for (const c of list) {
        if (c === null || typeof c !== "object" || typeof (c as { name?: unknown }).name !== "string") continue;
        const { name, w, h } = c as { name: string; w?: unknown; h?: unknown };
        components.push({ name, file: label, ...(typeof w === "number" && { w }), ...(typeof h === "number" && { h }) });
      }
    }
  }
  return { files, components };
}

export function harvestNegativeSpace(opts: HarvestOptions): HarvestReport {
  const skipPrefixes = opts.skipPrefixes ?? [];
  const ui = walkUiSources(opts.sourceDir);
  const skipped = [...ui.skipped];
  const keep = ui.relative.map((rel) => !skipPrefixes.some((p) => rel.startsWith(p)));
  for (const p of skipPrefixes) {
    if (ui.relative.some((rel) => rel.startsWith(p))) skipped.push({ path: p, reason: "the design system's own store (not source)" });
  }
  const tokens = walkTokenJson(opts.sourceDir, skipPrefixes);
  skipped.push(...tokens.skipped);

  const uiCtxs: FileCtx[] = ui.files.flatMap((abs, i) => {
    if (keep[i] !== true) return [];
    try { return [makeFileCtx(ui.relative[i] as string, readFileSync(abs, "utf8"))]; }
    catch (e) { skipped.push({ path: ui.relative[i] as string, reason: `cannot read: ${e instanceof Error ? e.message : String(e)}` }); return []; }
  });
  const jsonCtxs: FileCtx[] = tokens.files.flatMap((abs, i) => {
    try { return [makeFileCtx(tokens.relative[i] as string, readFileSync(abs, "utf8"))]; }
    catch (e) { skipped.push({ path: tokens.relative[i] as string, reason: `cannot read: ${e instanceof Error ? e.message : String(e)}` }); return []; }
  });

  const inventory = opts.designDir === undefined ? { files: [], components: [] } : readInventory(opts.designDir);
  const present = inventory.files.length > 0;

  const probes = NEGATIVE_SPACE_PROBES.map((probe): ProbeResult => {
    const ctxs = probe.readsJson ? [...uiCtxs, ...jsonCtxs] : uiCtxs;
    const hits: Hit[] = [];
    const excluded: Exclusion[] = [];
    for (const ctx of ctxs) {
      const d = probe.detect(ctx);
      hits.push(...[...d.hits].sort((a, b) => a.line - b.line));
      excluded.push(...[...d.excluded].sort((a, b) => a.line - b.line));
    }
    for (const c of inventory.components) {
      const evidence = probe.figma?.(c);
      if (evidence !== undefined) hits.push({ file: c.file, line: 0, excerpt: evidence });
    }
    return {
      id: probe.id, slug: probe.slug, summary: probe.summary,
      count: hits.length, scannedFiles: ctxs.length,
      hits: hits.slice(0, HIT_CAP), hitsOmitted: Math.max(0, hits.length - HIT_CAP),
      excluded: excluded.slice(0, EXCLUDED_CAP), excludedOmitted: Math.max(0, excluded.length - EXCLUDED_CAP),
      notEvaluated: present ? [`figma inventory has no ${probe.figmaGap}`] : [],
      figmaScanned: inventory.components.length,
    };
  });

  return {
    sourceDir: opts.sourceDir,
    walk: { uiFiles: uiCtxs.length, tokenJsonFiles: jsonCtxs.length, total: ui.total - keep.filter((k) => !k).length + jsonCtxs.length, skipped },
    figma: { present, files: inventory.files, components: inventory.components.length },
    probes,
  };
}
