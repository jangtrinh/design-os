/**
 * Refusals for `ui ds reseal` that the normal load cannot make: situations where adopting the
 * on-disk hashes would not be "hash drift" at all.
 *
 *  - a registry FILE SWITCH: the sealed `component-registry.json` still exists and still matches
 *    the sealed hash, but the resolver now prefers `figma-component-registry.json`;
 *  - a registry component that is not an object with a non-empty string `name`
 *    (`loadRegistry` is deliberately lenient about records, so a `null` one loads and then
 *    crashes every reader);
 *  - a kit-bound store, whose lock pins the bytes of the store files.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { canonicalHash, loadManifest } from "../core/ds-manifest.js";
import type { DSManifest } from "../core/ds-manifest.js";
import type { DesignSystemPaths } from "../core/design-system.js";
import type { Registry } from "../core/registry-store.js";

export interface RegistryFileFacts { path: string; hash: string; components: number }
export interface RegistrySwitch { sealed: RegistryFileFacts; resolved: RegistryFileFacts }

const DEFAULT_REGISTRY = "component-registry.json";

function factsOf(path: string): RegistryFileFacts | undefined {
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { components?: unknown };
    return { path: basename(path), hash: canonicalHash(json), components: Array.isArray(json.components) ? json.components.length : 0 };
  } catch { return undefined; }
}

/**
 * Detects that the resolver moved to a different registry file than the one the manifest
 * sealed. Only a positive match is reported: the default file must exist and hash to the
 * sealed registry hash while a different file is the one in use.
 */
export function findRegistrySwitch(paths: DesignSystemPaths, manifest: DSManifest): RegistrySwitch | undefined {
  const sealedPath = resolve(paths.dir, DEFAULT_REGISTRY);
  if (paths.registry === sealedPath || !existsSync(sealedPath)) return undefined;
  const sealed = factsOf(sealedPath);
  const resolved = factsOf(paths.registry);
  if (sealed === undefined || resolved === undefined || sealed.hash !== manifest.registryHash) return undefined;
  return { sealed, resolved };
}

/** Message for a refused switch (names both files and both hashes). */
export function describeSwitch(s: RegistrySwitch): string {
  return `the sealed registry is ${s.sealed.path} (${s.sealed.hash}, ${s.sealed.components} components) and still matches the manifest, ` +
    `but the store now resolves ${s.resolved.path} (${s.resolved.hash}, ${s.resolved.components} components). ` +
    `That is a registry file switch, not hash drift. Remove or rename ${s.resolved.path}, or re-register through ui registry`;
}

/** Index of the first component that is not an object with a non-empty string name, or -1. */
export function firstMalformedComponent(registry: Registry): number {
  return (registry.components as unknown[]).findIndex((c) => {
    if (c === null || typeof c !== "object" || Array.isArray(c)) return true;
    const name = (c as { name?: unknown }).name;
    return typeof name !== "string" || name.length === 0;
  });
}

/** True when the manifest on disk names a kit (readable even when the store fails to load). */
export function manifestIsKitBound(paths: DesignSystemPaths): boolean {
  try { return loadManifest(paths.manifest).kit !== undefined; } catch { return false; }
}

export const KIT_BOUND_MESSAGE =
  "reseal refused — this store is bound to a kit: kit.lock.json pins the bytes of its token and registry files, " +
  "so their hashes cannot be re-adopted. Restore the files the kit lock expects, or re-adopt the kit (ui ds kit adopt)";
