/**
 * The registry leg of `ui ds import` (spec 033 FR-031, CD-11): `--registry <file>` points at the unsealed registry
 * `ui ingest-figma-ds` wrote, and `ui ds import` seals it with the tokens under one manifest. Every record passes the
 * registry store's validation before anything is written, so one bad record refuses the whole import. An existing
 * non-empty sealed registry is never replaced without `--reset-registry`; there is no merge.
 */
import { existsSync, readFileSync } from "node:fs";
import { loadRegistry, RegistryError, validateSourceAuthoredComponentRecord } from "../core/registry-store.js";
import type { Registry } from "../core/registry-store.js";
import { tokenExistsInTree } from "../core/registry-token-check.js";
import type { TokenTree } from "../core/token-model.js";

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

/**
 * How many records the sealed registry at `path` holds; 0 when there is no file. A file that cannot be read or is not a
 * registry is refused (BAD_SEALED_REGISTRY): it is not provably empty, so it is never counted as nothing to protect.
 */
export function sealedRegistryCount(path: string): number {
  if (!existsSync(path)) return 0;
  const refuse = (why: string): never => {
    throw new ImportRegistryError("BAD_SEALED_REGISTRY", `the sealed registry '${path}' cannot be read (${why}), so it is not known to be empty. Repair or remove it, or pass --reset-registry to replace it`);
  };
  let prior: { components?: unknown };
  try { prior = JSON.parse(readFileSync(path, "utf8")) as { components?: unknown }; }
  catch (e) { return refuse(e instanceof Error ? e.message : String(e)); }
  return Array.isArray(prior.components) ? prior.components.length : refuse("it has no components list");
}

/** A registry binding whose token was left out of the sealed store by an owner answer in this import. */
export interface LeftOutBinding { record: string; token: string }

/** Refuses a registry that binds a token the token file does not hold at all: they must come from the same ingest run. */
export function assertBindingsInFile(registry: Registry, filePaths: ReadonlySet<string>): void {
  for (const record of registry.components) {
    const missing = record.tokensUsed.find((t) => !filePaths.has(t));
    if (missing === undefined) continue;
    throw new ImportRegistryError("BAD_REGISTRY", `registry record '${record.name}' binds the token '${missing}', which is not in the token file. The tokens and the registry must come from the same ui ingest-figma-ds run. Nothing was written.`);
  }
}

/** Leaves out the bindings whose token is not in the tree that will be sealed, and names each one. */
export function dropBindingsOutsideTree(registry: Registry, tree: TokenTree): { registry: Registry; leftOut: LeftOutBinding[] } {
  const leftOut: LeftOutBinding[] = [];
  const components = registry.components.map((record) => {
    const kept = record.tokensUsed.filter((t) => tokenExistsInTree(tree, t));
    for (const t of record.tokensUsed) if (!kept.includes(t)) leftOut.push({ record: record.name, token: t });
    return kept.length === record.tokensUsed.length ? record : { ...record, tokensUsed: kept };
  });
  return { registry: { version: registry.version, components }, leftOut };
}
