/**
 * The registry leg of `ui ds import` (spec 033 FR-031, CD-11): `--registry <file>` points at the unsealed registry
 * `ui ingest-figma-ds` wrote, and `ui ds import` seals it with the tokens under one manifest. Every record passes the
 * registry store's validation before anything is written, so one bad record refuses the whole import. An existing
 * non-empty sealed registry is never replaced without `--reset-registry`; there is no merge.
 */
import { existsSync, readFileSync } from "node:fs";
import { loadRegistry, RegistryError, validateSourceAuthoredComponentRecord } from "../core/registry-store.js";
import type { Registry } from "../core/registry-store.js";

export class ImportRegistryError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/**
 * Loads and validates the registry file. The records are validated the way scanned inventory is (source-authored
 * display names stay as the owner wrote them; every other field is strict), and a repeated name is refused.
 */
export function loadImportRegistry(file: string): Registry {
  let registry: Registry;
  try { registry = loadRegistry(file); }
  catch (e) {
    if (e instanceof RegistryError) throw new ImportRegistryError(e.code === "REGISTRY_NOT_FOUND" ? "FILE_NOT_FOUND" : "BAD_REGISTRY", e.message);
    throw e;
  }
  const seen = new Set<string>();
  const components = registry.components.map((record, i) => {
    try {
      const valid = validateSourceAuthoredComponentRecord(record);
      if (seen.has(valid.name)) throw new RegistryError("NAME_EXISTS", `name '${valid.name}' appears twice`);
      seen.add(valid.name);
      return valid;
    } catch (e) {
      const name = typeof (record as { name?: unknown }).name === "string" ? ` ('${(record as { name: string }).name}')` : "";
      throw new ImportRegistryError("BAD_REGISTRY", `registry record #${i}${name} in '${file}' fails validation: ${e instanceof Error ? e.message : String(e)}. Nothing was written.`);
    }
  });
  return { version: registry.version, components };
}

/** How many records the sealed registry at `path` holds; 0 when it is missing or unreadable (nothing provably there to protect). */
export function sealedRegistryCount(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const prior = JSON.parse(readFileSync(path, "utf8")) as { components?: unknown[] };
    return Array.isArray(prior.components) ? prior.components.length : 0;
  } catch {
    return 0;
  }
}
