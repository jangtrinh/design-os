/**
 * CSS the project pulls in from INSTALLED PACKAGES, for origin attribution.
 *
 * Why: a Tailwind v4 + component-kit app writes `@import "shadcn/tailwind.css"` and
 * `@import "tw-animate-css"` in its own stylesheet. The variables and classes those
 * packages declare reach the served page, but appear in neither `--src` nor `--kit`,
 * so they were labelled authored — ~105 of 149 "authored" errors on one real view.
 *
 * The rule: follow the project's OWN imports. A bare specifier in a CSS `@import`,
 * or a JS side-effect / `.css` import, names a package; the package resolves the way
 * Node does (the nearest `node_modules/<name>` walking up from the importing file),
 * and every `.css` file inside it is that package's CSS. Imports inside those files
 * are followed too. Nothing is hand-listed, and an installed package the project
 * never imports contributes nothing.
 *
 * Deterministic: sorted directory walks, a visited set, and a size cap per package.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface PackageCss {
  /** The package name (`shadcn`, `@scope/name`). */
  name: string;
  /** The project file whose import brought it in. */
  importer: string;
  /** All `.css` text inside the package, comments stripped. */
  text: string;
}

const CSS_FILE = /\.(?:css|scss|sass|less)$/i;
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|mdx)$/i;
const SKIP_DIR = new Set(["node_modules", "dist", "build", ".git", ".next", ".turbo", "coverage"]);
/** A package bigger than this is read up to the cap: attribution needs names, not every byte. */
const MAX_PACKAGE_BYTES = 4 * 1024 * 1024;

const CSS_IMPORT = /@(?:import|reference)\s+(?:url\(\s*)?["']([^"']+)["']/g;
/** `import "pkg"` (side effect) and any import / require of a stylesheet path. */
const SCRIPT_SIDE_EFFECT_IMPORT = /(?:^|[;\n])\s*import\s+["']([^"']+)["']/g;
const SCRIPT_STYLESHEET_IMPORT = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+\.(?:css|scss|sass|less))["']/g;

/** The package a bare specifier names, or undefined for a relative / absolute / URL one. */
export function packageNameOf(specifier: string): string | undefined {
  const s = specifier.replace(/^~/, "");
  if (s === "" || /^(?:\.|\/|[a-z][a-z0-9+.-]*:|#)/i.test(s)) return undefined;
  const parts = s.split("/");
  if (s.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  return parts[0];
}

/** Bare specifiers a source file imports for their CSS. */
function importedSpecifiers(file: string, text: string): string[] {
  const out: string[] = [];
  if (CSS_FILE.test(file)) {
    for (const m of text.matchAll(CSS_IMPORT)) out.push(m[1] as string);
  } else if (SCRIPT_FILE.test(file)) {
    for (const m of text.matchAll(SCRIPT_SIDE_EFFECT_IMPORT)) out.push(m[1] as string);
    for (const m of text.matchAll(SCRIPT_STYLESHEET_IMPORT)) out.push(m[1] as string);
  }
  return out;
}

/** Node-style lookup: the nearest `node_modules/<name>` from `fromDir` upward. */
function resolvePackageDir(name: string, fromDir: string): string | undefined {
  let dir = resolve(fromDir);
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/** Every `.css` file inside a package directory, sorted, nested packages skipped. */
function packageCssFiles(pkgDir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(abs, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.css$/i.test(name)) out.push(p);
    }
  };
  walk(pkgDir);
  return out;
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Project source files under `paths` (files or folders), sorted; node_modules only when named directly. */
function projectFiles(paths: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs).sort()) if (!SKIP_DIR.has(name)) walk(join(abs, name));
    } else if (CSS_FILE.test(abs) || SCRIPT_FILE.test(abs)) {
      out.push(abs);
    }
  };
  for (const p of paths) walk(resolve(p));
  return out;
}

/** The CSS of every package the project's files under `paths` import, transitively. */
export function importedPackageCss(paths: readonly string[]): PackageCss[] {
  const seen = new Set<string>();
  const packages: PackageCss[] = [];
  const queue: Array<{ file: string; text: string; importer: string }> = projectFiles(paths)
    .map((file) => ({ file, text: readFileSync(file, "utf8"), importer: file }));

  while (queue.length > 0) {
    const { file, text, importer } = queue.shift()!;
    for (const spec of importedSpecifiers(file, text)) {
      const name = packageNameOf(spec);
      if (name === undefined) continue;
      const pkgDir = resolvePackageDir(name, dirname(file));
      if (pkgDir === undefined || seen.has(pkgDir)) continue;
      seen.add(pkgDir);
      const parts: string[] = [];
      let bytes = 0;
      for (const cssFile of packageCssFiles(pkgDir)) {
        if (bytes >= MAX_PACKAGE_BYTES) break;
        const css = readFileSync(cssFile, "utf8");
        bytes += css.length;
        parts.push(stripCssComments(css));
        queue.push({ file: cssFile, text: css, importer }); // a package's own @imports are followed
      }
      if (parts.length > 0) packages.push({ name, importer, text: parts.join("\n") });
    }
  }
  return packages;
}
