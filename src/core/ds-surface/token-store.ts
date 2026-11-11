/**
 * The token store `ui ds surface` resolves references against (spec 033 FR-019). A read (the report, `--register`
 * preview) never refuses a store whose files drifted from their sealed hashes: it reads the tokens as they are on disk
 * and says so (`status: "unverified"`, the drifted files named), because the report writes nothing and a project whose
 * store drifted is exactly one that needs to be read. A write (`--out`, `--apply`) keeps the strict rule of every
 * other writer: DS_TAMPERED, nothing written, the store is never built upon while it is broken. Only hash drift is
 * tolerated on a read; an unreadable file or a broken kit still fails.
 */
import { DSError, loadDesignSystem, pathsForDir } from "../design-system.js";
import type { DesignSystem } from "../design-system.js";

export interface TokenStoreRead {
  ds: DesignSystem | undefined;
  status: "sealed" | "unverified" | "none";
  /** The store files that no longer match their sealed hash (`unverified` only). */
  drifted: string[];
}

/** @throws DSError (DS_TAMPERED, BAD_MANIFEST, ...) when the store cannot be read under the rule above. */
export function readTokenStore(designDir: string, writes: boolean): TokenStoreRead {
  const paths = pathsForDir(designDir);
  try {
    const ds = loadDesignSystem(paths, writes ? {} : { allowUnsealed: true });
    return ds.unsealedDrift === undefined ? { ds, status: "sealed", drifted: [] } : { ds, status: "unverified", drifted: ds.unsealedDrift.map((d) => d.file).sort() };
  } catch (e) {
    if (e instanceof DSError && e.code === "DS_NOT_FOUND") return { ds: undefined, status: "none", drifted: [] };
    throw e;
  }
}
