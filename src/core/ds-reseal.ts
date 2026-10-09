/**
 * reseal — the shared Art IV/D1 ceremony (spec 009 P1): atomically rewrite whichever
 * sealed artifact(s) changed (tokens and/or registry) plus the manifest, bumping
 * generation and appending the caller's changelog entry.
 *
 * Extracted from ds-change-token-impl.ts's inline A-F sequence — the ONLY writer that
 * resealed correctly before this phase. Two other writers (registry.ts, figma-reconcile-
 * run.ts) wrote a sealed artifact without ever touching the manifest — see
 * studio repo: specs/009-code-road/reports/art-iv-seal-audit.md. Every command that writes
 * design.tokens.json or component-registry.json inside a DS-managed project MUST route
 * through here; enforced statically by tests/seal-invariant.test.ts (mirrors
 * tests/autorecord-wiring.test.ts, spec 006 P2's meta-linter precedent).
 *
 * The three birth sites (ds-init-impl.ts, ds-import-impl.ts, ingest-figma-ds.ts) are
 * exempt — they compile a manifest from scratch rather than reseal an existing one, and
 * are allowlisted in the linter.
 */
import { renameSync, writeFileSync, openSync, closeSync, unlinkSync } from "node:fs";

import { dirname, join } from "node:path";
import { evolveKit } from "./ds-kit-seal.js";

import { canonicalStringify, canonicalHash, appendChangelog, DSManifestError } from "./ds-manifest.js";
import type { DSChangelogEntry } from "./ds-manifest.js";
import { loadDesignSystem, DSError } from "./design-system.js";
import type { DesignSystem, DesignSystemPaths } from "./design-system.js";
import type { TokenTree } from "./token-model.js";
import type { Registry } from "./registry-store.js";

/**
 * Load the design system anchored at `paths`, for a *possible* reseal. Returns
 * `undefined` when no manifest is present — nothing to reseal, the caller's write is
 * unsealed (e.g. a standalone `--file` registry with no `ds init`'d project). Any other
 * load failure (DS_TAMPERED, BAD_MANIFEST, …) re-throws as-is: this phase heals no
 * store (D4), so a caller must refuse rather than write on top of one already broken.
 *
 * Shared by every writer that might land on a sealed DS (registry.ts, figma-reconcile-
 * run.ts) so the "is there a DS here?" probe lives in one place, not duplicated per call
 * site.
 */
export function loadDesignSystemForReseal(paths: DesignSystemPaths): DesignSystem | undefined {
  try {
    return loadDesignSystem(paths);
  } catch (e) {
    if (e instanceof DSError && e.code === "DS_NOT_FOUND") return undefined;
    throw e;
  }
}

/** The caller-owned half of a changelog entry — reseal supplies `ts` from `nowIso`. */
export type ChangelogEntry = Omit<DSChangelogEntry, "ts">;

export interface ResealInput {
  /** The design system as loaded BEFORE this write — its manifest is the reseal base. */
  ds: DesignSystem;
  paths: DesignSystemPaths;
  /** Present → recompute compiledHash and rewrite design.tokens.json. */
  tokens?: TokenTree;
  /** Present → recompute registryHash and rewrite component-registry.json. */
  registry?: Registry;
  /** kind + by + data; caller owns the semantics (see ds-manifest.ts CHANGELOG_KINDS). */
  entry: ChangelogEntry;
  /** ISO-8601 clock for the changelog entry's `ts` — caller-supplied for determinism. */
  nowIso: string;
}

export interface ResealResult {
  generation: number;
  compiledHash: string;
  registryHash: string;
}

interface PendingWrite {
  tmpPath: string;
  finalPath: string;
  content: string;
}

/** Sort a registry's components by name — the same order saveRegistry commits. */
function sortedRegistry(registry: Registry): Registry {
  return {
    version: registry.version,
    components: [...registry.components].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Atomically rewrite the given artifact(s) + the manifest: bump generation, rehash
 * only what changed, append the caller's changelog entry.
 *
 * Write order: content artifact(s) first, manifest LAST — mirrors the original A-F
 * sequence, so a half-commit always leaves the manifest pointing at hashes the live
 * files no longer match (DS_TAMPERED on next load, loud) rather than a manifest that
 * claims a hash for content it never committed.
 *
 * Throws DSManifestError("WRITE_ERROR") on a half-commit, with a recover-or-explain
 * message.
 */
export function reseal(input: ResealInput): ResealResult {
  const { ds, paths, tokens, registry, entry, nowIso } = input;

  // Re-read immediately before authorizing writes: a previously loaded object is not proof
  // that bound TSX, theme, evidence or the store remained untouched.
  const current = ds.manifest.kit ? loadDesignSystem(paths) : ds;
  if (current.manifest.kit && canonicalHash(current.manifest) !== canonicalHash(ds.manifest)) {
    throw new DSError("DS_TAMPERED", "kit changed after it was loaded; reload before resealing");
  }
  const nextRegistry = registry !== undefined ? sortedRegistry(registry) : ds.registry;
  const evolution = current.kit ? evolveKit(dirname(paths.dir), current.kit, tokens ?? ds.tokens,
    nextRegistry, tokens !== undefined, registry !== undefined) : undefined;

  const compiledHash = tokens !== undefined ? canonicalHash(tokens) : ds.manifest.compiledHash;
  const registryHash =
    registry !== undefined ? canonicalHash(sortedRegistry(registry)) : ds.manifest.registryHash;

  const nextManifest = appendChangelog(
    { ...ds.manifest, generation: ds.manifest.generation + 1, compiledHash, registryHash,
      ...(evolution && { kit: { version: 1 as const, lockHash: canonicalHash(evolution.lock) } }) },
    { ...entry, ts: nowIso },
  );

  const writes: PendingWrite[] = [];
  if (tokens !== undefined) {
    writes.push({ tmpPath: `${paths.tokens}.tmp`, finalPath: paths.tokens, content: canonicalStringify(tokens) });
  }
  if (registry !== undefined) {
    writes.push({
      tmpPath: `${paths.registry}.tmp`,
      finalPath: paths.registry,
      content: canonicalStringify(sortedRegistry(registry)),
    });
  }
  if (evolution) {
    if (evolution.theme) writes.push({ tmpPath: `${evolution.theme.path}.tmp`, finalPath: evolution.theme.path, content: evolution.theme.content });
    const lockPath = join(dirname(paths.dir), "kit.lock.json");
    writes.push({ tmpPath: `${lockPath}.tmp`, finalPath: lockPath, content: canonicalStringify(evolution.lock) });
  }
  writes.push({ tmpPath: `${paths.manifest}.tmp`, finalPath: paths.manifest, content: canonicalStringify(nextManifest) });

  // Kit stages are exclusively created; only files owned by this attempt are cleaned.
  const ownedStages: string[] = [];
  for (const w of writes) {
    try {
      if (evolution) {
        const fd = openSync(w.tmpPath, "wx"); ownedStages.push(w.tmpPath);
        try { writeFileSync(fd, w.content, "utf8"); } finally { closeSync(fd); }
      } else writeFileSync(w.tmpPath, w.content, "utf8");
    } catch (e) {
      const cleanupFailures: string[] = [];
      for (const stage of ownedStages) {
        try { unlinkSync(stage); }
        catch (failure) { cleanupFailures.push(`${stage}: ${failure instanceof Error ? failure.message : String(failure)}`); }
      }
      throw new DSManifestError(
        "WRITE_ERROR",
        (cleanupFailures.length ? `owned staging cleanup failed (${cleanupFailures.join(", ")}); ` : "") +
        `failed to write temporary file '${w.tmpPath}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Commit: rename each tmp into place, in the same order.
  for (let i = 0; i < writes.length; i++) {
    const w = writes[i]!;
    try {
      renameSync(w.tmpPath, w.finalPath);
    } catch (e) {
      const committed = writes.slice(0, i).map((x) => x.finalPath).join(", ") || "nothing";
      throw new DSManifestError(
        "WRITE_ERROR",
        `reseal partially committed (${committed}) but failed to commit '${w.finalPath}': ` +
          `${e instanceof Error ? e.message : String(e)}. The design system is in a partially-updated ` +
          `state — hashes will not match on next load. Recover: restore '${w.finalPath}' from '${w.tmpPath}' ` +
          "if present. Bound kits require explicit recovery or adoption into a fresh project.",
      );
    }
  }

  return { generation: nextManifest.generation, compiledHash, registryHash };
}
