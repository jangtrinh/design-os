/**
 * negative-space-sources.ts - the files the negative-space harvest reads besides the UI-source walk:
 * token JSON files (`*token*.json`) and the Figma inventory. Both report what they did not read.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DSError } from "./design-system.js";
import type { FigmaComponent } from "./negative-space-probes.js";
import { EXCLUDED_UI_DIRECTORIES, MAX_UI_FILE_BYTES } from "./polyglot-ui-walk.js";
import type { UiSkip } from "./polyglot-ui-walk.js";

const INVENTORY_FILES = ["ds.json", "canvas-inventory.json"] as const;

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
