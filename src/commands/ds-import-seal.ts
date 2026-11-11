/**
 * The writing half of `ui ds import` (spec 033): seal the tokens, the registry and a fresh manifest, then apply the
 * roles the owner gave. Everything that can be refused is checked before the first byte is written: the roles are
 * validated against the tree that will be sealed, so the store is never left sealed with only some of them.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { DesignSystemPaths } from "../core/design-system.js";
import { canonicalHash, canonicalStringify, newManifest } from "../core/ds-manifest.js";
import { registryDir } from "../core/registry-shards.js";
import { saveRegistry } from "../core/registry-store.js";
import type { Registry } from "../core/registry-store.js";
import type { TokenTree } from "../core/token-model.js";
import type { RoleOutcome } from "./ds-import-summary.js";
import { SetRoleError, applyRoleToStore, checkRoleApplicable } from "./ds-set-role-impl.js";

export interface SealArgs {
  paths: DesignSystemPaths;
  designDir: string;
  name: string;
  src: string;
  tree: TokenTree;
  registry: Registry;
  /** True when the registry came from `--registry`; it then goes through the registry store (shards + canonical file). */
  imported: boolean;
  /** `--reset-registry`: the registry this import replaces is removed whole, shards and index included. */
  reset: boolean;
}

/** Throws SetRoleError for the first role that cannot be applied to `tree`; nothing is written either way. */
export function validateRoles(tree: TokenTree, roles: readonly { path: string; role: string }[]): void {
  for (const r of roles) checkRoleApplicable(tree, r.path, r.role);
}

export function sealImportStore(a: SealArgs): void {
  mkdirSync(a.designDir, { recursive: true });
  // canonicalStringify already appends a trailing "\n" (ds-manifest.ts) — do not double it.
  writeFileSync(a.paths.tokens, canonicalStringify(a.tree));
  if (a.reset) rmSync(registryDir(a.designDir), { recursive: true, force: true });
  if (a.imported) saveRegistry(a.paths.registry, a.registry);
  else writeFileSync(a.paths.registry, canonicalStringify(a.registry));
  // The hash covers the bytes written.
  const registryHash = canonicalHash(JSON.parse(readFileSync(a.paths.registry, "utf8")));
  const manifest = newManifest({
    name: a.name,
    persona: { slug: "imported", family: "imported" },
    intent: `imported from ${a.src}`,
    compiledHash: canonicalHash(a.tree),
    registryHash,
  });
  writeFileSync(a.paths.manifest, canonicalStringify(manifest));
}

/** The roles go through the same path as `ui ds set-role`, one reseal each, after the store is sealed and every role was validated. */
export function applyRoles(paths: DesignSystemPaths, roles: readonly { path: string; role: string }[]): RoleOutcome[] {
  const applied: RoleOutcome[] = [];
  for (const r of roles) {
    try { applied.push({ ...r, changed: applyRoleToStore(paths, r.path, r.role).changed }); }
    catch (e) {
      if (e instanceof SetRoleError) throw new SetRoleError(e.code, `the store is sealed, but the role ${r.role} could not be applied to ${r.path}: ${e.message}. Run: ui ds set-role ${r.path} ${r.role}`);
      throw e;
    }
  }
  return applied;
}
