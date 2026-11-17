/**
 * Multi-framework stylesheet & token source discovery for `ui designmd extract-tokens --project`.
 */
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SourceFile } from "./designmd-token-extractor.js";

export interface DiscoveredTokenProject {
  framework: string | null;
  discoveredFiles: string[];
  sources: SourceFile[];
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

const CANDIDATE_FILES: readonly string[] = [
  "src/app/globals.css", "app/globals.css", "src/styles/globals.css", "styles/globals.css",
  "src/index.css", "src/global.css", "index.css",
  "tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs",
  "src/styles.scss", "src/styles.css", "src/theme.scss", "src/assets/tailwind.css", "src/app/app.component.scss",
  "assets/css/main.css", "src/assets/main.css", "src/assets/base.css", "src/style.css", "app.vue", "src/App.vue",
  "src/app.css", "src/app.postcss", "src/routes/+layout.svelte",
  "style.css", "styles.css", "main.css", "app.css", "_variables.scss", "_tokens.scss", "src/styles/_variables.scss",
  "index.html", "src/index.html",
];

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function readContainedText(absPath: string, realRoot: string): string | undefined {
  let fd: number | undefined;
  try {
    const realTarget = realpathSync(absPath);
    const relReal = relative(realRoot, realTarget);
    if (relReal.startsWith("..") || isAbsolute(relReal)) return undefined;
    fd = openSync(realTarget, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = fstatSync(fd);
    return st.isFile() && st.size <= MAX_FILE_BYTES ? readFileSync(fd, "utf8") : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

function readJsonSafe(filePath: string, realRoot: string): Record<string, unknown> | undefined {
  const raw = readContainedText(filePath, realRoot);
  if (raw === undefined) return undefined;
  try { return asRecord(JSON.parse(raw)); } catch { return undefined; }
}

function detectFramework(root: string, realRoot: string): string | null {
  const pkg = readJsonSafe(join(root, "package.json"), realRoot);
  if (pkg) {
    const deps = { ...asRecord(pkg["dependencies"]), ...asRecord(pkg["devDependencies"]) };
    if ("next" in deps) return "next";
    if ("@angular/core" in deps) return "angular";
    if ("nuxt" in deps) return "nuxt";
    if ("vue" in deps) return "vue";
    if ("@sveltejs/kit" in deps || "svelte" in deps) return "svelte";
    if ("react" in deps) return "react";
    if ("astro" in deps) return "astro";
    if ("vite" in deps) return "vite";
  }
  if (existsSync(join(root, "angular.json"))) return "angular";
  if (["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"].some(f => existsSync(join(root, f)))) return "nuxt";
  if (existsSync(join(root, "svelte.config.js")) || existsSync(join(root, "svelte.config.ts"))) return "svelte";
  return null;
}

function harvestShadcnPaths(root: string, realRoot: string): string[] {
  const tailwind = asRecord(readJsonSafe(join(root, "components.json"), realRoot)?.["tailwind"]);
  const css = tailwind?.["css"];
  return typeof css === "string" && css.trim().length > 0 ? [css.trim()] : [];
}

function harvestAngularPaths(root: string, realRoot: string): string[] {
  const projects = asRecord(readJsonSafe(join(root, "angular.json"), realRoot)?.["projects"]);
  if (!projects) return [];
  const out: string[] = [];
  for (const projName of Object.keys(projects).sort()) {
    const arch = asRecord(asRecord(projects[projName])?.["architect"]);
    const styles = asRecord(asRecord(arch?.["build"])?.["options"])?.["styles"];
    if (!Array.isArray(styles)) continue;
    for (const entry of styles) {
      const s = typeof entry === "string" ? entry : asRecord(entry)?.["input"];
      if (typeof s === "string" && s.trim().length > 0) out.push(s.trim());
    }
  }
  return out;
}

function harvestNuxtPaths(root: string, realRoot: string): string[] {
  const out: string[] = [];
  for (const cfgName of ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"]) {
    const raw = readContainedText(join(root, cfgName), realRoot);
    const cssMatch = raw?.match(/\bcss\s*:\s*\[([\s\S]*?)\]/);
    if (!cssMatch) continue;
    for (const m of cssMatch[1]!.matchAll(/["']([^"']+)["']/g)) {
      const cleaned = m[1]!.trim().replace(/^(?:~\/|@\/)/, "");
      if (cleaned.length > 0) out.push(cleaned);
    }
  }
  return out;
}

function harvestHtmlLinkedCss(htmlRaw: string, htmlRelPath: string): string[] {
  const out: string[] = [];
  const htmlDir = dirname(htmlRelPath);
  for (const tag of htmlRaw.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag[0])) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1]?.trim();
    if (!href || /^(?:\/\/|https?:|data:)/i.test(href)) continue;
    const cleanHref = href.split(/[?#]/)[0] ?? "";
    if (cleanHref.length === 0) continue;
    out.push(cleanHref.startsWith("/") ? cleanHref.slice(1) : join(htmlDir, cleanHref));
  }
  return out;
}

function extractSfcStyleBlocks(raw: string): string {
  STYLE_BLOCK_RE.lastIndex = 0;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = STYLE_BLOCK_RE.exec(raw)) !== null) {
    if (m[1]) chunks.push(m[1]);
  }
  return chunks.join("\n");
}

export function discoverProjectTokenSources(projectDir: string): DiscoveredTokenProject {
  const root = resolve(projectDir);
  let realRoot: string;
  try { realRoot = realpathSync(root); } catch { return { framework: null, discoveredFiles: [], sources: [] }; }

  const framework = detectFramework(root, realRoot);
  const queue = [
    ...harvestShadcnPaths(root, realRoot),
    ...harvestAngularPaths(root, realRoot),
    ...harvestNuxtPaths(root, realRoot),
    ...CANDIDATE_FILES,
  ];

  const seenRel = new Set<string>();
  const discoveredFiles: string[] = [];
  const sources: SourceFile[] = [];

  for (let i = 0; i < queue.length; i++) {
    const trimmed = (queue[i] ?? "").trim().replace(/^\.\//, "");
    if (trimmed.length === 0 || isAbsolute(trimmed)) continue;
    const abs = resolve(root, trimmed);
    const rel = relative(root, abs);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) continue;
    const posixRel = rel.split(sep).join("/");
    if (seenRel.has(posixRel)) continue;

    const raw = readContainedText(abs, realRoot);
    if (raw === undefined) continue;
    seenRel.add(posixRel);
    discoveredFiles.push(posixRel);

    if (posixRel.endsWith(".html")) queue.push(...harvestHtmlLinkedCss(raw, posixRel));
    const isSfc = posixRel.endsWith(".vue") || posixRel.endsWith(".svelte");
    sources.push({ name: posixRel, body: isSfc ? extractSfcStyleBlocks(raw) : raw });
  }

  return { framework, discoveredFiles, sources };
}
