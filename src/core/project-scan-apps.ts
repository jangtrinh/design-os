/**
 * Nested app roots for `ui scan` (spec 033 FR-013) — split out of project-scan.ts.
 *
 * A directory below the scan root that holds a package.json is an app root
 * candidate. Everything the walk already collected (css, scss, tailwind
 * configs, component dirs) is attributed to its deepest owning app root after
 * the walk — no second traversal. The only extra reads are the first 4 KB of
 * the `.css` files that sit under an app whose package.json depends on
 * `tailwindcss`, to find the Tailwind v4 CSS-first entry.
 *
 * Pure except fs reads; deterministic (every list is sorted by path).
 */
import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

export interface AppRoot {
  /** Repo-relative POSIX path of the directory that holds the package.json. */
  path: string;
  /** First dependency match in FRAMEWORK_PRIORITY, or null. */
  framework: string | null;
  /** Subset of "tailwind","css","scss","css-in-js" in that fixed order. */
  styling: string[];
  /** Tailwind config owned by this app, or null (null for a v4 CSS-first app). */
  tailwindConfig: string | null;
  /** Tailwind v4 CSS entry (`@import "tailwindcss"` or `@theme`), or null. */
  tailwindCss: string | null;
  /** The component dirs under this app (a nested app owns its own). */
  componentDirs: Array<{ path: string; files: number }>;
}

/** A package.json found during the walk, before attribution. */
export interface AppCandidate {
  path: string;
  deps: Record<string, string>;
}

/** What the walk collected that an app can own. */
export interface WalkFindings {
  cssPaths: string[];
  scssPaths: string[];
  tailwindConfigs: string[];
  componentDirs: Array<{ path: string; files: number }>;
}

export const FRAMEWORK_PRIORITY = ["next", "react", "vue", "svelte", "astro", "vite"];
const CSS_HEAD_BYTES = 4096;
const TAILWIND_V4_RE = /@import\s+(?:url\()?["']tailwindcss(?:["']|\/)|@theme\b/;

export function frameworkOf(deps: Record<string, string>): string | null {
  return FRAMEWORK_PRIORITY.find((fw) => fw in deps) ?? null;
}

/** The one styling rule, shared by the scan root and every app root. */
export function stylingOf(
  deps: Record<string, string>, opts: { tailwindConfig: boolean; css: number; scss: number },
): string[] {
  const hasCssInJs = "styled-components" in deps || Object.keys(deps).some((k) => k.startsWith("@emotion"));
  const styling: string[] = [];
  if (opts.tailwindConfig || "tailwindcss" in deps) styling.push("tailwind");
  if (opts.css > 0) styling.push("css");
  if (opts.scss > 0) styling.push("scss");
  if (hasCssInJs) styling.push("css-in-js");
  return styling;
}

function readHead(path: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buf = Buffer.alloc(CSS_HEAD_BYTES);
    return buf.toString("utf8", 0, readSync(fd, buf, 0, CSS_HEAD_BYTES, 0));
  } catch {
    return "";
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** First (path order) css file whose head is a Tailwind v4 entry; null without the dependency. */
export function findTailwindV4Css(
  root: string, deps: Record<string, string>, cssPaths: readonly string[],
): string | null {
  if (!("tailwindcss" in deps)) return null;
  for (const p of [...cssPaths].sort()) {
    if (TAILWIND_V4_RE.test(readHead(join(root, p)))) return p;
  }
  return null;
}

/** The app root itself counts: a package directory named `ui` is both the app and its component directory. */
const under = (path: string, appPath: string): boolean => path === appPath || path.startsWith(appPath + "/");

/** The deepest app root that contains `path`, or null (the scan root owns it). */
export function ownerOf(path: string, apps: readonly AppCandidate[]): string | null {
  let best: string | null = null;
  for (const a of apps) {
    if (under(path, a.path) && (best === null || a.path.length > best.length)) best = a.path;
  }
  return best;
}

export function buildApps(
  root: string, candidates: readonly AppCandidate[], found: WalkFindings,
): AppRoot[] {
  const owned = <T>(items: readonly T[], pathOf: (t: T) => string, app: string): T[] =>
    items.filter((i) => ownerOf(pathOf(i), candidates) === app);
  return [...candidates].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((c) => {
    const css = owned(found.cssPaths, (p) => p, c.path);
    const configs = owned(found.tailwindConfigs, (p) => p, c.path).sort();
    return {
      path: c.path,
      framework: frameworkOf(c.deps),
      styling: stylingOf(c.deps, {
        tailwindConfig: configs.length > 0, css: css.length, scss: owned(found.scssPaths, (p) => p, c.path).length,
      }),
      tailwindConfig: configs[0] ?? null,
      tailwindCss: findTailwindV4Css(root, c.deps, css),
      componentDirs: owned(found.componentDirs, (d) => d.path, c.path)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    };
  });
}
