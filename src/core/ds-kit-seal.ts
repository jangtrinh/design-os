/** Integrity boundary for adopted kits and sanctioned evolution. No source recapture. */
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalHash, type DSManifest } from "./ds-manifest.js";
import { readKitFile, verifyKitFiles, hashKitBytes, indexKitContent } from "./ds-kit-files.js";
import { parseKitSpec } from "./ds-kit-parse.js";
import { validateKitEvidence } from "./ds-kit-evidence.js";
import { validateKit } from "./ds-kit-validate.js";
import { emitKitTheme } from "./ds-kit-theme.js";
import type { KitFile, KitLock } from "./ds-kit-types.js";
import { validateSourceAuthoredComponentRecord, type Registry } from "./registry-store.js";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) throw new Error(`${label} has invalid keys`);
}
function hash(value: unknown): value is string { return typeof value === "string" && /^sha256-[A-Za-z0-9_-]{43}$/.test(value); }
function files(value: unknown, label: string): KitFile[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a nonempty file index`);
  const seen = new Set<string>();
  let previous = "";
  return value.map((item: unknown) => {
    const file = object(item, label);
    exact(file, ["path", "hash"], label);
    const path = file["path"];
    if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path) ||
        path.split("/").some((part) => !part || part === "." || part === "..") || path <= previous ||
        seen.has(path.toLowerCase()) || typeof file["hash"] !== "string" || !/^sha256:[a-f0-9]{64}$/.test(file["hash"])) {
      throw new Error(`${label} contains an unsafe, duplicate, unsorted or invalid file`);
    }
    previous = path; seen.add(path.toLowerCase());
    return { path, hash: file["hash"] };
  });
}

/** Strict lock version/shape validation before any indexed path is read. */
export function validateKitLock(value: unknown): KitLock {
  const lock = object(value, "kit lock");
  exact(lock, ["version", "status", "staleReasons", "contentHash", "content", "evidence", "registry", "tokensHash", "registryHash"], "kit lock");
  if (lock["version"] !== 1 || !["verified", "stale"].includes(String(lock["status"])) ||
      !Array.isArray(lock["staleReasons"]) || lock["staleReasons"].some((reason: unknown) => typeof reason !== "string" || !reason.trim()) ||
      (lock["status"] === "verified" ? lock["staleReasons"].length !== 0 : lock["staleReasons"].length === 0) ||
      !hash(lock["contentHash"]) || !hash(lock["tokensHash"]) || !hash(lock["registryHash"])) throw new Error("invalid kit lock version, status or hashes");
  const content = files(lock["content"], "content");
  const evidence = files(lock["evidence"], "evidence");
  const paths = new Set(content.map((file) => file.path.toLowerCase()));
  if (!paths.has("kit.json") || content.some((file) => /^(evidence|design|dist|node_modules)\//i.test(file.path) || file.path.toLowerCase() === "kit.lock.json") ||
      evidence.some((file) => paths.has(file.path.toLowerCase()) || !file.path.startsWith("evidence/"))) throw new Error("invalid kit index boundary");
  const registry = object(lock["registry"], "kit registry");
  exact(registry, ["version", "components"], "kit registry");
  if (registry["version"] !== "0.1.0" || !Array.isArray(registry["components"])) throw new Error("unsupported kit registry version");
  const names = new Set<string>();
  for (const record of registry["components"]) {
    const component = validateSourceAuthoredComponentRecord(record);
    if (component.figmaNode !== undefined) throw new Error("KIT_FIGMA_SIDECAR: projected figmaNode sidecars are unsupported in kit version 1");
    if (names.has(component.name)) throw new Error(`duplicate kit registry name '${component.name}'`);
    names.add(component.name);
  }
  if (canonicalHash(registry) !== lock["registryHash"] || canonicalHash({ content, tokensHash: lock["tokensHash"], registryHash: lock["registryHash"] }) !== lock["contentHash"]) throw new Error("kit lock projection/content hash mismatch");
  return value as KitLock;
}

/** Verify every bound byte and both current store projections, including intact stale kits. */
export function readBoundKit(root: string, descriptor: NonNullable<DSManifest["kit"]>, tokens: unknown, registry: unknown): KitLock {
  const lock = validateKitLock(JSON.parse(readKitFile(root, "kit.lock.json").toString("utf8")));
  if (canonicalHash(lock) !== descriptor.lockHash) throw new Error("kit lock does not match manifest descriptor");
  verifyKitFiles(root, lock.content); verifyKitFiles(root, lock.evidence);
  if (canonicalHash(tokens) !== lock.tokensHash || canonicalHash(registry) !== lock.registryHash || canonicalHash(registry) !== canonicalHash(lock.registry)) throw new Error("kit store projection mismatch");
  // The authored contract remains immutable even after current tokens/registry evolve.
  const spec = parseKitSpec(JSON.parse(readKitFile(root, "kit.json").toString("utf8")));
  if (!lock.content.some((file) => file.path === spec.theme) || !lock.content.some((file) => file.path === spec.tokens) ||
      !lock.evidence.some((file) => file.path === spec.evidence)) throw new Error("kit spec is not bound to its indices");
  const actualContent = indexKitContent(root, spec.artifacts);
  if (canonicalHash(actualContent) !== canonicalHash(lock.content)) throw new Error("kit content closure changed: undeclared or altered artifacts");
  const theme = readKitFile(root, spec["theme"]).toString("utf8");
  const aliases = object(spec["aliases"], "kit aliases");
  if (Object.values(aliases).some((alias) => typeof alias !== "string")) throw new Error("invalid kit aliases");
  if (theme !== emitKitTheme(tokens, aliases as Record<string, string>)) throw new Error("kit theme differs from current deterministic projection");
  const receipt = object(JSON.parse(readKitFile(root, spec.evidence).toString("utf8")), "kit receipt");
  if (!hash(receipt["contentHash"])) throw new Error("invalid kit receipt content hash");
  // Stale receipts retain their original subject. Validate obligations and exact evidence
  // index against that subject without pretending it proves the current projections.
  const actualEvidence = validateKitEvidence(root, { spec, capturedCount: spec.mappings.length, tokens, registry: lock.registry, content: lock.content,
    contentHash: receipt["contentHash"], tokensHash: lock.tokensHash, registryHash: lock.registryHash, findings: [], complete: true });
  if (canonicalHash(actualEvidence) !== canonicalHash(lock.evidence)) throw new Error("kit evidence closure changed");
  if (lock.status === "verified") {
    if (receipt["contentHash"] !== lock.contentHash) throw new Error("kit receipt is not bound to this revision");
    if (canonicalHash(validateKit(root)) !== canonicalHash(lock)) throw new Error("kit lock differs from validated authored contract/evidence");
  }
  return lock;
}

export interface KitEvolution { lock: KitLock; theme?: { path: string; content: string }; }
/** Caller must have independently verified prior store integrity immediately before this call. */
export function evolveKit(root: string, prior: KitLock, tokens: unknown, registry: Registry, tokenWrite: boolean, registryWrite: boolean): KitEvolution {
  const spec = parseKitSpec(JSON.parse(readKitFile(root, "kit.json").toString("utf8")));
  const content = prior.content.map((file) => ({ ...file }));
  let theme: KitEvolution["theme"];
  if (tokenWrite) {
    const path = spec["theme"];
    if (typeof path !== "string") throw new Error("kit theme path missing");
    const css = emitKitTheme(tokens, spec["aliases"] as Record<string, string>);
    const file = content.find((entry) => entry.path === path);
    if (!file) throw new Error("kit theme not indexed");
    file.hash = hashKitBytes(Buffer.from(css));
    theme = { path: join(root, path), content: css };
  }
  // Parsed tokens flatten owner groups. A registry-only write must keep the verified
  // physical token projection, since it never writes that normalized tree to disk.
  const tokensHash = tokenWrite ? canonicalHash(tokens) : prior.tokensHash;
  const registryHash = canonicalHash(registry);
  const lock: KitLock = { ...prior, content, tokensHash, registryHash, registry,
    contentHash: canonicalHash({ content, tokensHash, registryHash }), status: "stale",
    staleReasons: [...new Set([...prior.staleReasons, ...(tokenWrite ? ["tokens changed; kit evidence requires reverification"] : []),
      ...(registryWrite ? ["registry changed; kit coverage requires reverification"] : [])])] };
  validateKitLock(lock);
  return { lock, ...(theme && { theme }) };
}

/** Refuse destructive legacy birth operations even if the kit seal is already damaged. */
export function refuseKitDowngrade(designDir: string): void {
  const root = dirname(designDir);
  try { lstatSync(join(root, "kit.lock.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A descriptor without its lock also requires explicit recovery, never downgrade.
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(designDir, "ds.manifest.json"), "utf8")); }
    catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === "ENOENT" || failure instanceof SyntaxError) return;
      throw failure;
    }
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw) && "kit" in raw) {
      throw new Error("KIT_DOWNGRADE: bound kit cannot be replaced by ds init/import", { cause: error });
    }
    return;
  }
  throw new Error("KIT_DOWNGRADE: bound kit cannot be replaced by ds init/import; adopt a new candidate into a fresh project");
}
