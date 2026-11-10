/**
 * negative-space-harvester.ts - count the cliches a codebase never uses.
 *
 * Onboarding records what exists; this records what is absent, and proves it with a denominator: every
 * probe answers `count` over `scannedFiles`, lists what it excluded and why, and says what it could
 * not judge (Art VIII: no "absent" without the files that were looked at). A zero is evidence, not a
 * decision; turning it into a proposal is negative-space-proposals.ts, and a ban is the owner's act.
 *
 * Sources come from the polyglot UI walk widened with stylesheets (`.css`, `.scss`, `.less`), so a
 * cliche that lives in a rule is seen; plus token JSON files (`*token*.json`) for the probes where a
 * palette or font token is evidence. Files of other template or style types are counted per extension
 * and NOT read; skipped files (unreadable, oversized, symbolic link) are counted per kind. Every number
 * reaches the report, so the evidence line can state what was read and what was not.
 * A Figma inventory (`design/ds.json`, `design/canvas-inventory.json`) holds component names and sizes
 * only, so it can add hits by name/size and can never count a fill or font probe as zero.
 *
 * One pass: each file is read once, every detector runs on it, only the hits are kept, and the file's
 * text is released before the next one is read. Deterministic: sorted walk, no clock, no network.
 */
import { readFileSync } from "node:fs";

import { fileKindOf, makeFileCtx, STYLE_EXTENSIONS } from "./negative-space-detector-kit.js";
import type { Exclusion, FileKind, Hit } from "./negative-space-detector-kit.js";
import { NEGATIVE_SPACE_LIMITS, NEGATIVE_SPACE_PROBES } from "./negative-space-probes.js";
import { readInventory, walkTokenJson } from "./negative-space-sources.js";
import { uiSourceExtension } from "./polyglot-ui-extractor.js";
import { walkUiSources } from "./polyglot-ui-walk.js";
import type { UiSkip } from "./polyglot-ui-walk.js";

export type { Exclusion, Hit } from "./negative-space-detector-kit.js";

export const HIT_CAP = 10;
/** First-level directories listed in the report (files directly in the source root are one more row). */
export const DIRECTORY_ROWS = 5;
export const EXCLUDED_CAP = 20;
/** Template and style types the harvest meets and does not read; counted per extension in the report. */
export const UNREAD_TEMPLATE_STYLE_EXTENSIONS: readonly string[] = [".astro", ".ejs", ".erb", ".hbs", ".liquid", ".mdx", ".njk", ".pcss", ".php", ".pug", ".sass", ".styl", ".twig"];

export interface ProbeResult {
  id: string;
  slug: string;
  summary: string;
  /** One plain sentence of what the detector matches. */
  matches: string;
  /** Occurrences found in the files read plus Figma name/size hits. */
  count: number;
  /** Files this probe read (the kinds it judges: UI source, plus stylesheets and token JSON where it uses them). */
  scannedFiles: number;
  /** Files of the kinds this probe judges that were met and not read (unreadable, oversized, symbolic link). */
  skippedFiles: number;
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
  walk: {
    uiFiles: number; styleFiles: number; tokenJsonFiles: number; total: number; skipped: UiSkip[];
    /** Template and style files met and not read, per extension (sorted). */
    unread: Record<string, number>;
    /** Where the files read came from: up to DIRECTORY_ROWS first-level directories, most files first, ties by path, then one `./` row for files directly in the source root. */
    directories: { path: string; files: number }[];
    /** First-level directories with files read that are not listed above. */
    directoriesOmitted: number;
  };
  figma: { present: boolean; files: string[]; components: number };
  probes: ProbeResult[];
  /** What no probe sees (printed with every report). */
  limits: readonly string[];
}
export interface HarvestOptions {
  sourceDir: string;
  /** The project's `design/` directory: where the Figma inventory is looked for. */
  designDir?: string;
  /** Relative path prefixes (`design/`) to leave out, e.g. the design system's own store. */
  skipPrefixes?: readonly string[];
}

/** One line counts once per probe: two tokens on a line (`"JetBrains Mono", monospace`) are one finding. */
function oncePerLine<T extends { file: string; line: number }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => { const k = `${x.file}:${x.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
interface Acc { count: number; scanned: number; hits: Hit[]; excluded: Exclusion[]; excludedTotal: number }

export function harvestNegativeSpace(opts: HarvestOptions): HarvestReport {
  const skipPrefixes = opts.skipPrefixes ?? [];
  const ui = walkUiSources(opts.sourceDir, { extraExtensions: STYLE_EXTENSIONS, unreadExtensions: UNREAD_TEMPLATE_STYLE_EXTENSIONS });
  const skipped = [...ui.skipped];
  const keep = ui.relative.map((rel) => !skipPrefixes.some((p) => rel.startsWith(p)));
  for (const p of skipPrefixes) {
    if (ui.relative.some((rel) => rel.startsWith(p))) skipped.push({ path: p, reason: "the design system's own store (not source)" });
  }
  const tokens = walkTokenJson(opts.sourceDir, skipPrefixes);
  skipped.push(...tokens.skipped);

  const accs: Acc[] = NEGATIVE_SPACE_PROBES.map(() => ({ count: 0, scanned: 0, hits: [], excluded: [], excludedTotal: 0 }));
  const read: Record<FileKind, number> = { ui: 0, style: 0, json: 0 };
  const perDirectory = new Map<string, number>();
  const scan = (abs: string, rel: string): void => {
    let source: string;
    try { source = readFileSync(abs, "utf8"); }
    catch (e) { skipped.push({ path: rel, reason: `cannot read: ${why(e)}` }); return; }
    const ctx = makeFileCtx(rel, source);
    read[ctx.kind]++;
    const slash = rel.indexOf("/");
    const top = slash === -1 ? "./" : `${rel.slice(0, slash)}/`;
    perDirectory.set(top, (perDirectory.get(top) ?? 0) + 1);
    NEGATIVE_SPACE_PROBES.forEach((probe, i) => {
      if (ctx.kind === "json" ? !probe.readsJson : ctx.kind === "style" && !probe.readsStyles) return;
      const acc = accs[i] as Acc;
      acc.scanned++;
      const d = probe.detect(ctx);
      d.hits = oncePerLine(d.hits);
      acc.count += d.hits.length;
      acc.excludedTotal += d.excluded.length;
      if (acc.hits.length < HIT_CAP) acc.hits.push(...[...d.hits].sort((a, b) => a.line - b.line).slice(0, HIT_CAP - acc.hits.length));
      if (acc.excluded.length < EXCLUDED_CAP) acc.excluded.push(...[...d.excluded].sort((a, b) => a.line - b.line).slice(0, EXCLUDED_CAP - acc.excluded.length));
    });
  };
  ui.files.forEach((abs, i) => { if (keep[i] === true) scan(abs, ui.relative[i] as string); });
  tokens.files.forEach((abs, i) => scan(abs, tokens.relative[i] as string));

  const inventory = opts.designDir === undefined ? { files: [], components: [] } : readInventory(opts.designDir);
  const present = inventory.files.length > 0;
  // a skipped FILE of a kind the harvest reads (a directory, or an entry that could not be inspected, has no kind)
  const readable = (path: string): boolean => uiSourceExtension(path) !== undefined || fileKindOf(path) !== "ui";
  const skippedFiles = skipped.filter((s) => !s.path.endsWith("/") && readable(s.path)).map((s) => fileKindOf(s.path));

  const probes = NEGATIVE_SPACE_PROBES.map((probe, i): ProbeResult => {
    const acc = accs[i] as Acc;
    const hits = acc.hits;
    let figmaHits = 0;
    for (const c of inventory.components) {
      const evidence = probe.figma?.(c);
      if (evidence === undefined) continue;
      figmaHits++;
      if (hits.length < HIT_CAP) hits.push({ file: c.file, line: 0, excerpt: evidence });
    }
    const count = acc.count + figmaHits;
    const judged = (k: FileKind): boolean => (k === "json" ? probe.readsJson : k === "style" ? probe.readsStyles : true);
    return {
      id: probe.id, slug: probe.slug, summary: probe.summary, matches: probe.matches,
      count, scannedFiles: acc.scanned, skippedFiles: skippedFiles.filter(judged).length,
      hits, hitsOmitted: Math.max(0, count - hits.length),
      excluded: acc.excluded, excludedOmitted: Math.max(0, acc.excludedTotal - acc.excluded.length),
      notEvaluated: present ? [`figma inventory has no ${probe.figmaGap}`] : [],
      figmaScanned: inventory.components.length,
    };
  });

  // the root row is its own: it is not a directory, so it never competes for one of the listed places
  const rootFiles = perDirectory.get("./") ?? 0;
  const dirRows = [...perDirectory].filter(([p]) => p !== "./").map(([path, files]) => ({ path, files })).sort((a, b) => b.files - a.files || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const unread = Object.fromEntries(Object.entries(ui.unread ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));
  return {
    sourceDir: opts.sourceDir,
    walk: {
      uiFiles: read.ui, styleFiles: read.style, tokenJsonFiles: read.json,
      total: ui.total - keep.filter((k) => !k).length + tokens.files.length + tokens.skipped.length,
      skipped, unread, directories: [...dirRows.slice(0, DIRECTORY_ROWS), ...(rootFiles > 0 ? [{ path: "./", files: rootFiles }] : [])], directoriesOmitted: Math.max(0, dirRows.length - DIRECTORY_ROWS),
    },
    figma: { present, files: inventory.files, components: inventory.components.length },
    probes,
    limits: NEGATIVE_SPACE_LIMITS,
  };
}
