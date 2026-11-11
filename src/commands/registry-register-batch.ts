/**
 * The registration path for many records at once (spec 033 FR-027), shared by `ui ds surface --register --apply`.
 * It applies to every record what `ui registry register` applies to one: the record validation, the provenance rule of
 * a sealed store (`resolveRegisterProvenance`: the source reference is verified, hashed and recorded, and the markup is
 * linted against the design system), the existence check of every `tokensUsed` path, `NAME_EXISTS` for a name that is
 * already taken (this path never forces and never replaces), and one reseal for the whole batch on a sealed store.
 * Every record is checked first: when any refuses, nothing is written and every refusal is returned.
 *
 * The batch also carries the links of a component found in code to a record that came from another door (D16, "same
 * component"): each goes through `linkCodeSource`, the one narrow write that keeps the record and adds the code
 * reference and the tokens. New records, `<name> · code` records and links are checked together and written together:
 * one reseal, one entry whose note carries the three counts. A batch with nothing to write does not reseal.
 *
 * Code names are source-authored (the name a module exports), so the records are validated the way scanned inventory
 * is: the display name stays as written, every other field is strict.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathsForDir } from "../core/design-system.js";
import { loadDesignSystemForReseal, reseal } from "../core/ds-reseal.js";
import { assertTokensExist } from "../core/registry-token-check.js";
import { linkCodeSource } from "./registry-link-code-source.js";
import { verifySourceRef } from "./registry-provenance-refs.js";
import { RegistryError, createEmptyRegistry, loadRegistry, registerComponent, saveRegistry, validateSourceAuthoredComponentRecord } from "../core/registry-store.js";
import type { ComponentRecord, Registry } from "../core/registry-store.js";
import { resolveRegisterProvenance } from "./registry-provenance.js";

export interface BatchRecord {
  name: string;
  category: string;
  markup: string;
  tokensUsed: string[];
  variants: string[];
  /** `path:start-end`, relative to the project root. */
  sourceRef: string;
  /** True for a `<name> · code` record: a component the owner ruled is not the one that holds its name. */
  separate?: boolean;
}
/** An existing record that gains the code source of a component the owner ruled is the same component. */
export interface BatchLink {
  /** The exact name of the existing record. */
  name: string;
  /** `path:start-end`, relative to the project root. */
  sourceRef: string;
  /** Token paths the code source references. */
  tokens: string[];
}
export interface BatchRefusal { name: string; code: string; message: string }
export interface BatchResult {
  file: string;
  /** New records, the `<name> · code` ones not included. */
  registered: number;
  linked: number;
  separate: number;
  sealed: boolean;
  generation?: number;
  warnings: string[];
}

/** A refusal that carries every record that failed, or a store failure under its own code. */
export class BatchRegisterError extends Error {
  constructor(readonly code: string, message: string, readonly refusals: BatchRefusal[] = []) { super(message); }
}

/**
 * The registry a project already holds, for the preview: the sealed one (or the unsealed file in use), null when there is
 * none yet. A registry that cannot be read is refused, never counted as empty.
 */
export function readExistingRegistry(projectDir: string): Registry | null {
  const dsPaths = pathsForDir(join(projectDir, "design"));
  try { return loadDesignSystemForReseal(dsPaths)?.registry ?? loadRegistry(dsPaths.registry); }
  catch (e) {
    if (e instanceof RegistryError && e.code === "REGISTRY_NOT_FOUND") return null;
    throw new BatchRegisterError(codeOf(e, "READ_ERROR"), messageOf(e));
  }
}

const codeOf = (e: unknown, fallback: string): string => (e !== null && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : fallback);
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function registerRecordsOnce(projectDir: string, records: readonly BatchRecord[], links: readonly BatchLink[], nowIso: string, by: string): BatchResult {
  const dsPaths = pathsForDir(join(projectDir, "design"));
  let ds: ReturnType<typeof loadDesignSystemForReseal>;
  try { ds = loadDesignSystemForReseal(dsPaths); }
  catch (e) { throw new BatchRegisterError(codeOf(e, "READ_ERROR"), messageOf(e)); }

  let registry: Registry;
  try { registry = ds?.registry ?? loadRegistry(dsPaths.registry); }
  catch (e) {
    if (e instanceof RegistryError && e.code === "REGISTRY_NOT_FOUND") registry = createEmptyRegistry();
    else throw new BatchRegisterError(codeOf(e, "READ_ERROR"), messageOf(e));
  }

  const refusals: BatchRefusal[] = [];
  const warnings: string[] = [];
  const accepted: ComponentRecord[] = [];
  const normalized = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  for (const rec of records) {
    try {
      let record = validateSourceAuthoredComponentRecord({
        name: rec.name, category: rec.category, markup: rec.markup, tokensUsed: rec.tokensUsed,
        ...(rec.variants.length > 0 && { variants: rec.variants }),
      });
      const { provenance, warnings: notes } = resolveRegisterProvenance({ sourceRef: rec.sourceRef, syntheticApproved: false }, rec.markup, dsPaths);
      if (provenance !== undefined) record = { ...record, provenance };
      assertTokensExist(record.tokensUsed, ds?.tokens);
      if (ds?.kit) {
        const clash = registry.components.find((c) => c.name !== record.name && normalized(c.name) === normalized(record.name));
        if (clash !== undefined) throw new RegistryError("BAD_NAME", `owner name '${record.name}' collides with exact registered label '${clash.name}'`);
      }
      registry = registerComponent(registry, record, false).registry;
      accepted.push(record);
      warnings.push(...notes.map((n) => `${rec.name}: ${n}`));
    } catch (e) {
      if (!(e instanceof RegistryError)) throw e;
      refusals.push({ name: rec.name, code: e.code, message: e.message });
    }
  }
  for (const link of links) {
    try {
      const code = verifySourceRef(link.sourceRef, { storeDir: dsPaths.dir });
      assertTokensExist(link.tokens, ds?.tokens);
      registry = linkCodeSource(registry, { name: link.name, code: { sourceRef: code.sourceRef, sha256: code.sha256 }, tokens: link.tokens });
    } catch (e) {
      if (!(e instanceof RegistryError)) throw e;
      refusals.push({ name: link.name, code: e.code, message: e.message });
    }
  }
  if (refusals.length > 0) {
    throw new BatchRegisterError("BATCH_REFUSED", `${refusals.length} of ${records.length + links.length} record(s) were refused and nothing was written`, refusals);
  }

  const separate = records.filter((r) => r.separate === true).length;
  const counts = { registered: accepted.length - separate, linked: links.length, separate };
  try {
    if (accepted.length === 0 && links.length === 0) {
      return { file: dsPaths.registry, ...counts, sealed: ds !== undefined, ...(ds === undefined ? {} : { generation: ds.manifest.generation }), warnings };
    }
    if (ds !== undefined) {
      const note = `${counts.registered} new, ${counts.linked} linked, ${counts.separate} separate`;
      const done = reseal({ ds, paths: dsPaths, registry, nowIso, entry: { kind: "register", by, note } });
      return { file: dsPaths.registry, ...counts, sealed: true, generation: done.generation, warnings };
    }
    mkdirSync(dirname(dsPaths.registry), { recursive: true });
    saveRegistry(dsPaths.registry, registry);
    return { file: dsPaths.registry, ...counts, sealed: false, warnings };
  } catch (e) {
    throw new BatchRegisterError(codeOf(e, "WRITE_ERROR"), messageOf(e));
  }
}
