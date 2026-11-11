/**
 * Project scanner — deterministic, read-only detection of existing design
 * signals in a project root. Powers `ui scan` and the `ui init` next-step hint.
 *
 * Pure except fs reads (readdir/stat/readFile) and loadDesignSystem (fs reads
 * only). No network, no writes, no Date.now, no randomness. Byte-identical
 * results come from the SORT, not the traversal order: every directory's
 * entries are visited in sorted (alphabetical) order. The walk itself is
 * breadth-first — a full level is visited before any one subtree is
 * descended into, so a shallow UI dir is found before an
 * alphabetically-earlier-but-deeper sibling can burn the entry cap.
 *
 * `truncated` reflects the ENTRY cap (MAX_ENTRIES) only. The DEPTH cap
 * (MAX_DEPTH) stops descending one branch but never sets it: an entry-capped
 * map is missing arbitrary things anywhere (the honest "do not trust this"
 * signal); a depth-capped map is complete everywhere shallower than the cap —
 * conflating the two made `truncated` mean "something, somewhere, was not
 * visited", which is close enough to always-true to be useless (spec 009
 * fix-scan-discovery: it caused a live misdiagnosis on spaflow — an agent read
 * `truncated: true`, on a tree far under the entry cap, and built a wrong
 * theory instead of noticing one route dir was 7 levels deep).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import type { Dirent } from "node:fs";
import { pathsForDir, loadDesignSystem, DSError } from "./design-system.js";
import {
  buildApps, findTailwindV4Css, frameworkOf, ownerOf, readDeps, stylingOf,
} from "./project-scan-apps.js";
import type { AppCandidate, AppRoot } from "./project-scan-apps.js";
import { NO_SCAN_RULINGS, honouredOf, onWayToKeptRoot, walkDecision } from "./project-scan-rulings.js";
import type { Honoured, ScanRulings } from "./project-scan-rulings.js";

export type { AppRoot } from "./project-scan-apps.js";

// ─── Result shape ───────────────────────────────────────────────────────────────

export interface ScanResult {
  /** "next"|"react"|"vue"|"svelte"|"astro"|"vite"|null — first package.json dep match in priority order. */
  framework: string | null;
  /** Subset of "tailwind","css","scss","css-in-js" in that fixed order. */
  styling: string[];
  /** Repo-relative path to a tailwind config, or null. */
  tailwindConfig: string | null;
  /** Top 5 .css files by size (bytes desc, then path asc). */
  cssFiles: Array<{ path: string; bytes: number }>;
  /** Top 5 .html files by size (same ordering). */
  htmlFiles: Array<{ path: string; bytes: number }>;
  /** Dirs with >=3 direct code files that are named components|ui|widgets, or sit under a "components" ancestor (outside any test tree). */
  componentDirs: Array<{ path: string; files: number }>;
  /** "./DESIGN.md" when present at the root, else null. */
  designMd: string | null;
  /** Compiled design-system state at <root>/design. */
  dsStatus: "none" | "present" | "tampered";
  /** Routing verdict derived from the signals above. */
  verdict: "greenfield" | "brownfield-code" | "brownfield-html" | "ds-present";
  /** True only when the walk hit MAX_ENTRIES — the map is missing arbitrary entries. The depth cap (MAX_DEPTH) never sets this; it only stops descending one branch. */
  truncated: boolean;
  /** Directory entries visited. Equals MAX_ENTRIES when truncated by the entry cap. */
  visited: number;
  /** Tailwind v4 CSS-first entry of the scan root itself (`tailwindcss` dep + `@import "tailwindcss"` / `@theme`), or null. */
  tailwindCss: string | null;
  /** Nested app roots (a package.json below the scan root, outside test trees), sorted by path. The scan root's own signals stay in the fields above. */
  apps: AppRoot[];
  /** When truncated: the first-level directories that consumed the entry budget, most entries first, top 5. Empty otherwise. */
  budget: Array<{ dir: string; visited: number }>;
  /** Present only when an owner ruling exists (or could not be read): the directories skipped, the app roots kept, left out and not ruled yet. */
  honoured?: Honoured;
}

// ─── Tunables ───────────────────────────────────────────────────────────────────

// Ecosystem-scoped, not "plausible": an entry earns its place by files-burned
// on a real repo (9-project measurement), not by guessing every tool's cache
// dir. JS/JS-tooling entries predate this comment; .venv/venv/__pycache__
// (Python) were added after dana-desktop — a polyglot (Electron+React+Python)
// repo — showed a 8187-file .venv alone was 54% of its whole tree and sorted
// ahead of the real UI. .vercel/.pytest_cache measured too (<10 files each,
// noise) and .tox/target/Pods/.gradle/etc. measured 0/9 — none of those ship.
/**
 * Directories no walk should descend. Corpus-counted, not guessed: ten
 * plausible additions measured 0 hits across nine real projects, while `.venv`
 * alone was 8,187 files — 54% of one repo's tree.
 *
 * Exported so the lint target resolver shares these DECISIONS rather than
 * forking a second list that drifts from this one.
 */
export const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "out", "coverage", "vendor", ".git",
  ".next", ".turbo", ".cache", ".agent", ".claude", "design",
  ".venv", "venv", "__pycache__",
]);
/**
 * Dot-directories are skipped as a class, the way the lint target resolver has
 * always skipped them (lint-target.ts): every tool cache, ours and anyone's,
 * without the kernel naming a product. Corpus count recorded with spec 033
 * task 2.1: 0 component dirs under a dot-directory across 32 projects, 13,856
 * entries (9.8%) and 245 code files that are not UI components.
 */
export const isSkippedDir = (name: string): boolean => SKIP_DIRS.has(name) || name.startsWith(".");
/** Shared with the lint target resolver — see SKIP_DIRS. */
export const MAX_DEPTH = 6;
export const MAX_ENTRIES = 4000;
const CODE_EXT = new Set([".tsx", ".jsx", ".vue", ".svelte", ".html"]);
// Corpus-counted (9 real code projects), same discipline as SKIP_DIRS above:
// name-only matching saw 375/1485 (25%) component files — every miss (dashboard
// 73, icons 109, mdx 63, editor 43, marketing 28, settings 23, landing 19,
// library 37, demos 35 …) sat under a "components" ancestor with an
// unlisted name. A directory now also qualifies by ANCESTRY: >=3 direct code
// files AND (own name in this set OR a "components" dir sits above it in the
// walk) AND it is not inside a test tree (TEST_DIR_NAMES below) — measured at
// 872/1485 (58%). "widgets" is 0/9 today (never fires on this corpus) but is
// an existing published contract; kept, not removed, on that basis alone.
const COMPONENT_DIR_NAMES = new Set(["components", "ui", "widgets"]);
// Directories whose file counts are real but are not component inventory —
// __tests__ alone measured 289 files across 2 projects, none of them a
// component dir; counting by name without this guard over-collects.
const TEST_DIR_NAMES = new Set(["__tests__", "__mocks__", "test", "tests", "spec", "stories"]);
const TAILWIND_CONFIG_RE = /^tailwind\.config\.(js|ts|cjs|mjs)$/;

// ─── Small helpers ───────────────────────────────────────────────────────────────

/** Repo-relative POSIX-style path (forward slashes, deterministic on Windows). */
function relPath(root: string, p: string): string {
  return relative(root, p).split(sep).join("/");
}

function fileBytes(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

function byBytesDescThenPath(
  a: { path: string; bytes: number },
  b: { path: string; bytes: number },
): number {
  if (b.bytes !== a.bytes) return b.bytes - a.bytes;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

// ─── Filesystem walk ─────────────────────────────────────────────────────────────

interface WalkAccum {
  css: Array<{ path: string; bytes: number }>;
  html: Array<{ path: string; bytes: number }>;
  scssPaths: string[];
  tailwindConfigs: string[];
  componentDirs: Array<{ path: string; files: number }>;
  appCandidates: AppCandidate[];
  /** Entries visited per first-level directory (the entry itself counts for its own bucket). */
  byTop: Map<string, number>;
  visited: number;
  truncated: boolean;
  rulings: ScanRulings;
}

function sortedEntries(dir: string): Dirent[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries;
}

/** BFS queue item — carries the two ancestry flags a dir inherits from its parent. */
interface WalkItem {
  dir: string;
  depth: number;
  /** A "components"-named dir sits at or above this dir's parent. */
  hasComponentsAncestor: boolean;
  /** This dir's own name, or an ancestor's, is a TEST_DIR_NAMES entry. */
  inTestTree: boolean;
  /** The first-level directory this dir sits under (itself when first-level); null for the scan root. */
  top: string | null;
  /** A directory the owner left out that holds a kept root: only the way to that root is entered. */
  corridor?: boolean;
}

// BFS: a queue of WalkItem. Within each level, entries keep sortedEntries'
// alphabetical order (Art I — see header comment). Component-dir detection
// happens as each dir is dequeued — the same check that ran depth-first before.
// The entry cap (MAX_ENTRIES) sets `truncated`; the depth cap (MAX_DEPTH) only
// stops descending that one branch — see header comment for why they differ.
function walk(root: string, start: string, acc: WalkAccum): void {
  const startBase = basename(start).toLowerCase();
  const queue: WalkItem[] = [
    { dir: start, depth: 0, hasComponentsAncestor: false, inTestTree: TEST_DIR_NAMES.has(startBase), top: null },
  ];
  // Queues a child directory unless the walk never enters it or the owner's deepest ruling leaves it out.
  const enter = (e: Dirent, from: string, depth: number, inherit: Pick<WalkItem, "hasComponentsAncestor" | "inTestTree" | "top">): void => {
    const full = join(from, e.name);
    const verdict = isSkippedDir(e.name) ? "prune" : walkDecision(acc.rulings, relPath(root, full));
    if (verdict === "prune") return;
    queue.push({ dir: full, depth: depth + 1, ...inherit, inTestTree: inherit.inTestTree || TEST_DIR_NAMES.has(e.name.toLowerCase()), corridor: verdict === "corridor" });
  };
  while (queue.length > 0) {
    if (acc.visited >= MAX_ENTRIES) { acc.truncated = true; return; }
    const { dir, depth, hasComponentsAncestor, inTestTree, top, corridor } = queue.shift()!;
    if (depth > MAX_DEPTH) continue; // depth cap: skip this branch, map stays honest elsewhere
    const entries = sortedEntries(dir);
    if (corridor === true) {
      for (const e of entries) if (e.isDirectory() && onWayToKeptRoot(acc.rulings, relPath(root, join(dir, e.name)))) enter(e, dir, depth, { hasComponentsAncestor, inTestTree, top });
      continue;
    }

    // >=3 direct code-file children qualifies a dir if its own name is
    // components|ui|widgets, OR a "components" dir is one of its ancestors —
    // unless it sits inside a test tree (see TEST_DIR_NAMES above).
    const base = basename(dir).toLowerCase();
    if (!inTestTree && (COMPONENT_DIR_NAMES.has(base) || hasComponentsAncestor)) {
      const directCode = entries.filter(
        (e) => e.isFile() && CODE_EXT.has(extname(e.name).toLowerCase()),
      ).length;
      if (directCode >= 3) acc.componentDirs.push({ path: relPath(root, dir), files: directCode });
    }

    // A package.json below the scan root marks an app root candidate (FR-013); fixtures under a test tree are not apps.
    if (depth > 0 && !inTestTree && entries.some((e) => e.isFile() && e.name === "package.json")) {
      acc.appCandidates.push({ path: relPath(root, dir), deps: readDeps(dir) });
    }

    const childHasComponentsAncestor = hasComponentsAncestor || base === "components";

    for (const e of entries) {
      if (acc.visited >= MAX_ENTRIES) { acc.truncated = true; return; }
      acc.visited++;
      const bucket = top ?? (e.isDirectory() ? e.name : null);
      if (bucket !== null) acc.byTop.set(bucket, (acc.byTop.get(bucket) ?? 0) + 1);
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        enter(e, dir, depth, { hasComponentsAncestor: childHasComponentsAncestor, inTestTree, top: bucket });
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        if (TAILWIND_CONFIG_RE.test(lower)) acc.tailwindConfigs.push(relPath(root, full));
        const ext = extname(lower);
        if (ext === ".css") acc.css.push({ path: relPath(root, full), bytes: fileBytes(full) });
        else if (ext === ".scss") acc.scssPaths.push(relPath(root, full));
        else if (ext === ".html") acc.html.push({ path: relPath(root, full), bytes: fileBytes(full) });
      }
    }
  }
}

// ─── Design-system status ────────────────────────────────────────────────────────

function detectDsStatus(root: string): ScanResult["dsStatus"] {
  try {
    loadDesignSystem(pathsForDir(join(root, "design")));
    return "present";
  } catch (e) {
    if (e instanceof DSError && e.code === "DS_TAMPERED") return "tampered";
    return "none"; // DS_NOT_FOUND (and any other read failure) → nothing usable
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/**
 * Scan `root` for existing design signals. Read-only and deterministic — the
 * same tree always yields byte-identical output. Assumes `root` is a readable
 * directory (callers validate first and surface READ_ERROR otherwise).
 */
export function scanProject(root: string, rulings: ScanRulings = NO_SCAN_RULINGS): ScanResult {
  const deps = readDeps(root);

  const framework = frameworkOf(deps);

  const acc: WalkAccum = {
    css: [], html: [], scssPaths: [], tailwindConfigs: [], componentDirs: [],
    appCandidates: [], byTop: new Map(), visited: 0, truncated: false, rulings,
  };
  walk(root, root, acc);

  const tailwindConfig =
    acc.tailwindConfigs.length > 0 ? [...acc.tailwindConfigs].sort()[0]! : null;

  const styling = stylingOf(deps, {
    tailwindConfig: tailwindConfig !== null, css: acc.css.length, scss: acc.scssPaths.length,
  });

  const cssFiles = [...acc.css].sort(byBytesDescThenPath).slice(0, 5);
  const htmlFiles = [...acc.html].sort(byBytesDescThenPath).slice(0, 5);
  const componentDirs = [...acc.componentDirs].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  const apps = buildApps(root, acc.appCandidates, {
    cssPaths: acc.css.map((f) => f.path), scssPaths: acc.scssPaths,
    tailwindConfigs: acc.tailwindConfigs, componentDirs: acc.componentDirs,
  });
  const honoured = honouredOf(rulings, apps.map((a) => a.path), root);
  const rootCss = acc.css.map((f) => f.path).filter((p) => ownerOf(p, acc.appCandidates) === null);
  const budget = acc.truncated
    ? [...acc.byTop].map(([dir, visited]) => ({ dir, visited }))
        .sort((a, b) => b.visited - a.visited || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
        .slice(0, 5)
    : [];

  const designMd = existsSync(join(root, "DESIGN.md")) ? "./DESIGN.md" : null;
  const dsStatus = detectDsStatus(root);

  let verdict: ScanResult["verdict"];
  if (dsStatus !== "none") verdict = "ds-present";
  else if (componentDirs.length > 0 || framework !== null) verdict = "brownfield-code";
  else if (htmlFiles.length > 0 || cssFiles.length > 0) verdict = "brownfield-html";
  else verdict = "greenfield";

  return {
    framework, styling, tailwindConfig, cssFiles, htmlFiles,
    componentDirs, designMd, dsStatus, verdict,
    truncated: acc.truncated, visited: acc.visited,
    tailwindCss: findTailwindV4Css(root, deps, rootCss), apps, budget,
    ...(honoured === undefined ? {} : { honoured }),
  };
}
