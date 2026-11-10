/**
 * polyglot-ui-walk.ts — deterministic discovery of UI source files under a directory.
 *
 * Default sweeps exclude node_modules/, dist/, build/, .git/ and test fixtures, and print
 * scanned/total file counts and every skip reason (a gate sees only its selector).
 *
 *   - Entries are visited in sorted order (`Array.prototype.sort()` default: UTF-16 code units, not locale), so two runs over
 *     the same tree list the same files in the same order on every machine.
 *   - `total` counts every UI-source file the walk met outside an excluded directory; a file that is
 *     met but not read (a symlink, an oversized bundle) is counted in `total` and listed in `skipped`
 *     with its reason, so `scanned` never silently exceeds what was actually read.
 *   - An excluded directory is listed once, by name, and never entered: its contents are not counted.
 *   - A symlinked directory is never followed (a link such as `loop -> ..` would walk forever, and one to
 *     another tree would judge files the sweep does not own). Each is listed once, so the report cannot
 *     read as a full sweep when a linked tree was left out. Its files are not counted: they are unseen.
 *   - A directory that cannot be listed, or an entry that cannot be inspected, is listed with the system's
 *     reason; the rest of the sweep is still read.
 *   - A caller may widen the sweep with `extraExtensions` (read and counted like a UI source) and ask for
 *     `unreadExtensions` (files of those types are counted per extension in `unread`, never read). With neither
 *     option the walk is exactly the UI-source walk the `ds-usage` lint and gate rely on.
 *   - The ROOT the caller names is always entered, even when its own name is on the exclusion list
 *     (`ui ds-usage-lint tests/fixtures/x` is an explicit request, not a default sweep).
 */
import { lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { uiSourceExtension } from "./polyglot-ui-extractor.js";

/** Directory names never entered by a default sweep. */
export const EXCLUDED_UI_DIRECTORIES: readonly string[] = ["node_modules", "dist", "build", ".git", "fixtures", "__fixtures__"];
/** A file larger than this is skipped with a reason, not read (generated bundles, vendored blobs). */
export const MAX_UI_FILE_BYTES = 2 * 1024 * 1024;

export interface UiSkip {
  /** Path relative to the walked root, `/`-separated. */
  path: string;
  reason: string;
}
export interface UiWalk {
  /** Absolute paths of the files to read, in walk order. */
  files: string[];
  /** Relative path of each file in `files`, same order. */
  relative: string[];
  skipped: UiSkip[];
  /** UI-source files met outside excluded directories (`files.length` plus the skipped files). */
  total: number;
  /** Files met per extension from `unreadExtensions` (present only when that option was given). */
  unread?: Record<string, number>;
}
export interface UiWalkOptions {
  /** Extra file extensions (lower-case, with the dot) read like UI sources, e.g. `.css`. */
  extraExtensions?: readonly string[];
  /** Extensions to count per type without reading them. */
  unreadExtensions?: readonly string[];
}

const extensionOf = (name: string): string | undefined => /\.[A-Za-z0-9]+$/.exec(name)?.[0].toLowerCase();

export function walkUiSources(root: string, options: UiWalkOptions = {}): UiWalk {
  const walk: UiWalk = { files: [], relative: [], skipped: [], total: 0, ...(options.unreadExtensions !== undefined && { unread: {} }) };
  const extra = new Set(options.extraExtensions ?? []);
  const isSource = (name: string): boolean => uiSourceExtension(name) !== undefined || (extra.size > 0 && extra.has(extensionOf(name) ?? ""));
  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  const visit = (abs: string, rel: string): void => {
    let names: string[];
    try { names = readdirSync(abs).sort(); }
    catch (e) { walk.skipped.push({ path: rel === "" ? "./" : `${rel}/`, reason: `cannot read directory: ${why(e)}` }); return; }
    for (const name of names) {
      const childAbs = join(abs, name);
      const childRel = rel === "" ? name : `${rel}/${name}`;
      let st;
      try { st = lstatSync(childAbs); }
      catch (e) { walk.skipped.push({ path: childRel, reason: `cannot inspect: ${why(e)}` }); continue; }
      if (st.isSymbolicLink()) {
        let linksToDirectory = false;
        try { linksToDirectory = statSync(childAbs).isDirectory(); } catch { /* dangling: not a directory */ }
        if (linksToDirectory) {
          walk.skipped.push({ path: `${childRel}/`, reason: "symlinked directory not followed" });
        } else if (isSource(name)) {
          walk.total++;
          walk.skipped.push({ path: childRel, reason: "symlink not followed" });
        }
      } else if (st.isDirectory()) {
        if (EXCLUDED_UI_DIRECTORIES.includes(name)) walk.skipped.push({ path: `${childRel}/`, reason: `excluded directory '${name}' (default sweep)` });
        else visit(childAbs, childRel);
      } else if (st.isFile() && isSource(name)) {
        walk.total++;
        if (st.size > MAX_UI_FILE_BYTES) walk.skipped.push({ path: childRel, reason: `larger than ${MAX_UI_FILE_BYTES / (1024 * 1024)} MB (${st.size} bytes)` });
        else { walk.files.push(childAbs); walk.relative.push(childRel); }
      } else if (st.isFile() && walk.unread !== undefined) {
        const ext = extensionOf(name);
        if (ext !== undefined && options.unreadExtensions?.includes(ext) === true) walk.unread[ext] = (walk.unread[ext] ?? 0) + 1;
      }
    }
  };
  visit(root, "");
  return walk;
}
