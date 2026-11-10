/**
 * figma-inventory-entries.ts - the one reader of a Figma inventory file's component entries.
 *
 * `design/ds.json` and `design/canvas-inventory.json` list `components` and `componentSets`. Callers (the
 * registry provenance check, the negative-space harvest) share the file names and this reader and keep their
 * own error code and message: a file that is not JSON throws `InventoryJsonError`, an absent file is `undefined`.
 */
import { existsSync, readFileSync } from "node:fs";

/** The inventory files a design directory may hold, in lookup order. */
export const INVENTORY_FILE_NAMES = ["ds.json", "canvas-inventory.json"] as const;

export class InventoryJsonError extends Error {
  constructor(readonly file: string, readonly detail: string) {
    super(`Figma inventory '${file}' is not readable JSON (${detail})`);
  }
}

/** The `components` then `componentSets` entries (objects only) of one inventory file; undefined when the file is absent. */
export function readInventoryEntries(file: string): Record<string, unknown>[] | undefined {
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
  catch (e) { throw new InventoryJsonError(file, e instanceof Error ? e.message : String(e)); }
  const o = (parsed !== null && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object") : []);
  return [...list(o["components"]), ...list(o["componentSets"])];
}
