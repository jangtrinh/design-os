/** Exclusive adoption: freeze validated bytes, reserve a fresh project, seal last. */
import { mkdirSync, writeFileSync, unlinkSync, openSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalHash, canonicalStringify, newManifest, validateManifestShape } from "./ds-manifest.js";
import { loadDesignSystem, pathsForDir, type DesignSystem } from "./design-system.js";
import { validateKit } from "./ds-kit-validate.js";
import { readKitFile, hashKitBytes } from "./ds-kit-files.js";
import { readBoundKit } from "./ds-kit-seal.js";

export class KitAdoptionError extends Error {
  readonly code: string;
  constructor(code: string, message: string, readonly reservation?: { path: string; incomplete: true; committed: true; complete: false; committedPaths: string[] }) {
    super(message); this.name = "KitAdoptionError"; this.code = code;
  }
}
export interface AdoptKitOptions { out: string; now?: string; }

export function adoptKit(candidate: string, options: AdoptKitOptions): DesignSystem {
  const root = resolve(candidate), target = resolve(options.out);
  const lock = validateKit(root);
  const bytes = new Map<string, Buffer>();
  for (const file of [...lock.content, ...lock.evidence]) {
    const buffer = readKitFile(root, file.path);
    if (hashKitBytes(buffer) !== file.hash) throw new KitAdoptionError("KIT_CHANGED", `candidate changed during adoption: '${file.path}'`);
    if (file.path === "kit.lock.json" || file.path.startsWith("design/")) throw new KitAdoptionError("BAD_KIT", `reserved adoption path '${file.path}'`);
    bytes.set(file.path, buffer);
  }
  const spec = JSON.parse(bytes.get("kit.json")!.toString("utf8")) as { name: string; intent: string; tokens: string };
  const tokenBytes = bytes.get(spec.tokens);
  if (!tokenBytes) throw new KitAdoptionError("BAD_KIT", "tokens are not bound to content index");
  const tokens: unknown = JSON.parse(tokenBytes.toString("utf8"));
  const manifest = newManifest({ name: spec.name, persona: { slug: "owner-kit", family: "owner-kit" }, intent: spec.intent,
    compiledHash: lock.tokensHash, registryHash: lock.registryHash });
  if (options.now !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(options.now) || !Number.isFinite(Date.parse(options.now)) || new Date(options.now).toISOString() !== options.now) {
      throw new KitAdoptionError("BAD_ARG", "--now must be a canonical UTC ISO clock (YYYY-MM-DDTHH:mm:ss.sssZ)");
    }
    manifest.createdAt = options.now;
  }
  manifest.changelog = manifest.changelog.map((entry) => ({ ...entry, ts: manifest.createdAt }));
  manifest.kit = { version: 1, lockHash: canonicalHash(lock) };
  validateManifestShape(manifest);
  // Exclusive mkdir rejects occupied empty directories and dangling links alike.
  try { mkdirSync(target); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code === "EEXIST" ? "KIT_TARGET_EXISTS" : "WRITE_ERROR";
    throw new KitAdoptionError(code, `cannot reserve '${target}': ${error instanceof Error ? error.message : String(error)}`);
  }
  const committed: string[] = [];
  let manifestWritten = false;
  const write = (path: string, content: Buffer | string): void => {
    const full = join(target, path);
    mkdirSync(dirname(full), { recursive: true });
    const fd = openSync(full, "wx");
    if (path === "design/ds.manifest.json") manifestWritten = true;
    try { writeFileSync(fd, content); }
    finally { closeSync(fd); }
    committed.push(path);
  };
  try {
    for (const [path, buffer] of bytes) write(path, buffer);
    write("kit.lock.json", canonicalStringify(lock));
    write("design/design.tokens.json", tokenBytes);
    write("design/component-registry.json", canonicalStringify(lock.registry));
    // Read destination bytes before publishing the sole seal. Never trust copy success.
    readBoundKit(target, manifest.kit, tokens, lock.registry);
    if (canonicalHash(JSON.parse(readKitFile(target, "design/design.tokens.json").toString("utf8"))) !== lock.tokensHash ||
        canonicalHash(JSON.parse(readKitFile(target, "design/component-registry.json").toString("utf8"))) !== lock.registryHash) throw new Error("adopted store projection changed before seal");
    write("design/ds.manifest.json", canonicalStringify(manifest));
    return loadDesignSystem(pathsForDir(join(target, "design")));
  } catch (error) {
    let cleanup = "";
    if (manifestWritten) {
      try { unlinkSync(join(target, "design/ds.manifest.json")); const index = committed.indexOf("design/ds.manifest.json"); if (index >= 0) committed.splice(index, 1); }
      catch (failure) { cleanup = `; failed to withdraw seal: ${failure instanceof Error ? failure.message : String(failure)}`; }
    }
    throw new KitAdoptionError("KIT_ADOPTION_INCOMPLETE",
      `incomplete reservation '${target}'; committed: ${committed.join(", ") || "nothing"}; ${error instanceof Error ? error.message : String(error)}${cleanup}. ` +
      "Inspect this reservation; retry only into a different absent destination. Adoption never overwrites a reservation.",
      { path: target, incomplete: true, committed: true, complete: false, committedPaths: [...committed] });
  }
}
