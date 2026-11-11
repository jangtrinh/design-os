/**
 * From the imports of a page or story file to the surface components it uses (spec 033 FR-019). A named import, a
 * default import and `import * as NS` followed by `NS.Name` all resolve through the module graph of the walk, and a
 * barrel file (`export { X } from "./x"`, `export * from "./x"`) is followed up to a fixed depth. A component is named
 * by the file that declares it, so two components with one name in two directories are told apart.
 */
import { readComponentExports } from "./source-export-reader.js";
import type { SourceExports } from "./source-export-reader.js";
import { namespaceMembers, readImports, resolveSpecifier } from "./source-import-reader.js";
import { idOf } from "./surface-types.js";

const MAX_BARREL_DEPTH = 6;

export interface ImportGraph {
  /** The component ids (`file#name`) a file imports, and the number of project-file imports that resolved to nothing. */
  importsOf(file: string): { ids: Set<string>; unresolved: number };
}

export function buildImportGraph(sources: ReadonlyMap<string, string>, appRoot: string, components: readonly { name: string; file: string; isDefault: boolean }[]): ImportGraph {
  const files = new Set(sources.keys());
  const defs = new Map<string, { name: string; isDefault: boolean }[]>();
  for (const c of components) defs.set(c.file, [...(defs.get(c.file) ?? []), c]);
  const exportsCache = new Map<string, SourceExports>();
  const exportsOf = (file: string): SourceExports => {
    let hit = exportsCache.get(file);
    if (hit === undefined) { hit = readComponentExports(file, sources.get(file) ?? ""); exportsCache.set(file, hit); }
    return hit;
  };

  /** The id of the component that `file` exports under `name` (`"default"` for the default export), following barrels. */
  function resolveExport(file: string, name: string, depth: number): string | null {
    const own = (defs.get(file) ?? []).find((c) => (name === "default" ? c.isDefault : c.name === name));
    if (own !== undefined) return idOf({ name: own.name, file });
    if (depth >= MAX_BARREL_DEPTH) return null;
    for (const re of exportsOf(file).reExports) {
      const wanted = re.star ? (name === "default" ? null : name) : (re.names.find((n) => n.exported === name)?.local ?? null);
      if (wanted === null) continue;
      const target = resolveSpecifier(file, re.spec, files, appRoot);
      if (target.kind !== "file") continue;
      const hit = resolveExport(target.file, wanted, depth + 1);
      if (hit !== null) return hit;
    }
    return null;
  }

  return {
    importsOf(file) {
      const source = sources.get(file) ?? "";
      const ids = new Set<string>();
      let unresolved = 0;
      for (const imp of readImports(source)) {
        const target = resolveSpecifier(file, imp.spec, files, appRoot);
        if (target.kind === "unresolved") { unresolved++; continue; }
        if (target.kind === "external") continue;
        const wanted = [
          ...(imp.defaultName === undefined ? [] : ["default"]),
          ...imp.named.map((n) => n.imported),
          ...(imp.namespace === undefined ? [] : namespaceMembers(source, imp.namespace)),
        ];
        for (const name of wanted) {
          const id = resolveExport(target.file, name, 0);
          if (id !== null) ids.add(id);
        }
      }
      return { ids, unresolved };
    },
  };
}
