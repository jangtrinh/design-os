/**
 * negative-space-sources.ts - the files the negative-space harvest reads besides the UI-source walk:
 * token JSON files (`*token*.json`) and the Figma inventory. Both report what they did not read.
 */
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { DSError } from "./design-system.js";
import { INVENTORY_FILE_NAMES, InventoryJsonError, readInventoryEntries } from "./figma-inventory-entries.js";
import type { FigmaComponent } from "./negative-space-probes.js";
import { EXCLUDED_UI_DIRECTORIES, MAX_UI_FILE_BYTES } from "./polyglot-ui-walk.js";
import type { UiSkip } from "./polyglot-ui-walk.js";

/**
 * Token JSON files met outside excluded directories. A file that is not read is reported with its reason:
 * oversized, or a symbolic link (never followed, like every other symlink in the harvest).
 */
export function walkTokenJson(root: string, skipPrefixes: readonly string[]): { files: string[]; relative: string[]; skipped: UiSkip[] } {
  const out = { files: [] as string[], relative: [] as string[], skipped: [] as UiSkip[] };
  const isTokenJson = (name: string): boolean => /token.*\.json$/i.test(name);
  const visit = (abs: string, rel: string): void => {
    let names: string[];
    try { names = readdirSync(abs).sort(); } catch { return; } // the UI walk already reported this directory
    for (const name of names) {
      const childAbs = join(abs, name);
      const childRel = rel === "" ? name : `${rel}/${name}`;
      if (skipPrefixes.some((p) => childRel.startsWith(p))) continue;
      let st;
      try { st = lstatSync(childAbs); } catch { continue; }
      if (st.isSymbolicLink()) {
        if (isTokenJson(name)) out.skipped.push({ path: childRel, reason: "symlink not followed" });
        continue;
      }
      if (st.isDirectory()) { if (!EXCLUDED_UI_DIRECTORIES.includes(name)) visit(childAbs, childRel); continue; }
      if (!st.isFile() || !isTokenJson(name)) continue;
      if (st.size > MAX_UI_FILE_BYTES) out.skipped.push({ path: childRel, reason: `larger than ${MAX_UI_FILE_BYTES / (1024 * 1024)} MB (${st.size} bytes)` });
      else { out.files.push(childAbs); out.relative.push(childRel); }
    }
  };
  visit(root, "");
  return out;
}

export function readInventory(designDir: string): { files: string[]; components: (FigmaComponent & { file: string })[] } {
  const files: string[] = [];
  const components: (FigmaComponent & { file: string })[] = [];
  for (const name of INVENTORY_FILE_NAMES) {
    const path = join(designDir, name);
    let entries: Record<string, unknown>[] | undefined;
    try { entries = readInventoryEntries(path); }
    catch (e) {
      if (e instanceof InventoryJsonError) throw new DSError("BAD_JSON", `${e.message}. Fix the file or remove it.`);
      throw e;
    }
    if (entries === undefined) continue;
    const label = `design/${name}`;
    files.push(label);
    for (const c of entries) {
      if (typeof c["name"] !== "string") continue;
      const { name: componentName, w, h } = c as { name: string; w?: unknown; h?: unknown };
      components.push({ name: componentName, file: label, ...(typeof w === "number" && { w }), ...(typeof h === "number" && { h }) });
    }
  }
  return { files, components };
}
