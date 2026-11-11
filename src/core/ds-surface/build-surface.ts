/**
 * `ui ds surface` (spec 033 FR-019): the exported components of one app's component directories with the tokens their
 * source references, the screens and stories that import them, and what could not be read. Pure over the files it is
 * given by `readAppFiles`; deterministic (every list is sorted, nothing reads a clock) and read-only.
 *
 * A component directory is one the scan found (`componentDirs`); a file belongs to the deepest component directory
 * that holds it. Story, test and fixture files are not components. A page file is one under a directory named
 * `pages`, `routes`, `views` or `screens`, or named `page` / `+page`.
 */
import { posix } from "node:path";
import { buildImportGraph } from "./import-graph.js";
import { readComponentExports } from "./source-export-reader.js";
import { readStyleReferences } from "./style-references.js";
import type { TokenLookup } from "./style-references.js";
import { readVariants } from "./variants-reader.js";
import { SURFACE_SCHEMA, byText, idOf } from "./surface-types.js";
import type { ComponentDetail, SurfaceCollision, SurfaceLink, SurfaceModel, SurfaceUnread } from "./surface-types.js";
import type { AppFiles } from "./app-source-files.js";

export interface BuildSurfaceInput {
  app: string;
  componentDirs: readonly string[];
  tailwindCss: string | null;
  files: AppFiles;
  lookup: TokenLookup;
  scan: SurfaceUnread["scan"];
}

const COMPONENT_EXT = /\.(?:tsx|jsx|js|vue|svelte)$/i;
const NON_COMPONENT_FILE = /\.(?:stories|story|test|spec)\.[A-Za-z]+$/i;
const NON_COMPONENT_DIR = new Set(["__tests__", "__mocks__", "test", "tests", "spec", "stories"]);
const STORY_FILE = /\.(?:stories|story)\.(?:tsx|ts|jsx|js|vue|svelte)$/i;
const PAGE_DIRS = new Set(["pages", "routes", "views", "screens"]);
const PAGE_FILE = /^(?:page|\+page)\.(?:tsx|jsx|vue|svelte)$/i;

const dirOf = (file: string): string => posix.dirname(file);
const underDir = (file: string, dir: string): boolean => file.startsWith(`${dir}/`);

/** The deepest component directory that holds `file`, or null. */
function componentDirOf(file: string, dirs: readonly string[]): string | null {
  return dirs.filter((d) => underDir(file, d)).sort((a, b) => b.length - a.length)[0] ?? null;
}

export function isPageFile(file: string): boolean {
  if (!COMPONENT_EXT.test(file) || NON_COMPONENT_FILE.test(file)) return false;
  return PAGE_FILE.test(posix.basename(file)) || dirOf(file).split("/").some((s) => PAGE_DIRS.has(s));
}

export function findCollisions(details: readonly { name: string; file: string }[]): SurfaceCollision[] {
  const byName = new Map<string, Set<string>>();
  for (const c of details) byName.set(c.name, (byName.get(c.name) ?? new Set<string>()).add(c.file));
  return [...byName].filter(([, files]) => files.size > 1)
    .map(([name, files]) => ({ name, files: [...files].sort(byText) })).sort((a, b) => byText(a.name, b.name));
}

export function buildSurface(input: BuildSurfaceInput): SurfaceModel {
  const { sources } = input.files;
  const exportUnread: SurfaceModel["output"]["unread"]["exports"] = [];
  const declared: { name: string; file: string; isDefault: boolean }[] = [];
  const details: ComponentDetail[] = [];
  const components: SurfaceModel["output"]["components"] = [];

  for (const [file, source] of [...sources].sort((a, b) => byText(a[0], b[0]))) {
    if (!COMPONENT_EXT.test(file) || NON_COMPONENT_FILE.test(file)) continue;
    const inComponentDir = componentDirOf(file, input.componentDirs) !== null;
    const segments = dirOf(file).split("/");
    const read = readComponentExports(file, source);
    // Page files are read for their imports; their own exports are screens, not components.
    if (!inComponentDir || segments.some((s) => NON_COMPONENT_DIR.has(s.toLowerCase())) || isPageFile(file)) {
      for (const c of read.components) declared.push({ name: c.name, file, isDefault: c.isDefault });
      continue;
    }
    for (const u of read.unread) exportUnread.push({ file, ...u });
    const lines = source.split("\n");
    for (const c of read.components) {
      const slice = lines.slice(c.startLine - 1, c.endLine).join("\n");
      const refs = readStyleReferences(file, slice, input.lookup);
      declared.push({ name: c.name, file, isDefault: c.isDefault });
      components.push({ name: c.name, file, dir: dirOf(file), tokens: refs.tokens, unresolvedStyles: refs.unresolvedStyles, unresolved: refs.unresolved, utilitiesNamingNoToken: refs.utilitiesNamingNoToken });
      details.push({ name: c.name, file, dir: dirOf(file), startLine: c.startLine, endLine: c.endLine, source: slice, variants: readVariants(c.name, source) });
    }
  }
  const surfaceIds = new Set(components.map(idOf));
  const graph = buildImportGraph(sources, input.app === "." ? "" : input.app, declared);

  let unresolvedImports = 0;
  const link = (file: string): { link: SurfaceLink; ids: Set<string> } => {
    const { ids, unresolved } = graph.importsOf(file);
    unresolvedImports += unresolved;
    const used = [...ids].filter((id) => surfaceIds.has(id));
    const names = [...new Set(used.map((id) => id.slice(id.lastIndexOf("#") + 1)))].sort(byText);
    return { link: { file, components: names }, ids: new Set(used) };
  };
  const screens: SurfaceLink[] = [];
  const stories: SurfaceLink[] = [];
  const storied = new Set<string>();
  for (const file of [...sources.keys()].sort(byText)) {
    if (STORY_FILE.test(file)) {
      const r = link(file);
      stories.push(r.link);
      for (const id of r.ids) storied.add(id);
    } else if (isPageFile(file)) screens.push(link(file).link);
  }

  components.sort((a, b) => byText(a.name, b.name) || byText(a.file, b.file));
  details.sort((a, b) => byText(a.name, b.name) || byText(a.file, b.file));
  return {
    details,
    output: {
      schema: SURFACE_SCHEMA,
      app: input.app,
      components,
      collisions: findCollisions(components),
      shadowed: [],
      screens,
      stories,
      unstoried: [...new Set(components.filter((c) => !storied.has(idOf(c))).map((c) => c.name))].sort(byText),
      ...(input.tailwindCss === null ? {} : { tailwindCss: input.tailwindCss }),
      tokenStore: { status: "none" },
      unread: { files: input.files.unread, exports: exportUnread.sort((a, b) => byText(a.file, b.file) || a.line - b.line), unresolvedImports, scan: input.scan },
    },
  };
}
