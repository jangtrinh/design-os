/**
 * What `ui registry register` and the batch path of `ui ds surface --register` both check about one record before it is
 * registered (spec 033 FR-027, review fix round, section G): the record validation, the provenance rule of a sealed
 * store (the source reference is verified and hashed, the markup is linted against the design system), and, on a
 * kit-bound store, the clash of the owner's name with a registered label. One function, so the two paths cannot drift.
 * The token-existence check (`assertTokensExist`) and `registerComponent` stay with the callers, in their own order.
 *
 * `sourceAuthored` is the name rule: a code name is what the module exports, so it is validated as scanned inventory
 * is (the display name stays as written, every other field strict); `ui registry register` uses the strict
 * `Category/Variant` rule on a store that is not kit-bound.
 */
import type { DesignSystemPaths } from "../core/design-system.js";
import { RegistryError, validateComponentRecord, validateSourceAuthoredComponentRecord } from "../core/registry-store.js";
import type { ComponentRecord, Registry } from "../core/registry-store.js";
import { resolveRegisterProvenance } from "./registry-provenance.js";
import type { ProvenanceFlags } from "./registry-provenance.js";

export interface RecordCheckInput {
  raw: unknown;
  sourceAuthored: boolean;
  markup: string;
  provenanceFlags: ProvenanceFlags;
  /** The `--markup` file when the markup came from a file; absent for stdin and for the batch. */
  markupFile?: string;
  dsPaths: DesignSystemPaths;
  /** True when the store is bound to a kit. */
  kit: boolean;
  registry: Registry;
}

const normalized = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** The validated record with its provenance, and the notes to print. @throws RegistryError */
export function checkRecordForRegistry(input: RecordCheckInput): { record: ComponentRecord; warnings: string[] } {
  let record = input.sourceAuthored ? validateSourceAuthoredComponentRecord(input.raw) : validateComponentRecord(input.raw);
  const { provenance, warnings } = resolveRegisterProvenance(input.provenanceFlags, input.markup, input.dsPaths, input.markupFile);
  if (provenance !== undefined) record = { ...record, provenance };
  if (input.kit) {
    const clash = input.registry.components.find((c) => c.name !== record.name && normalized(c.name) === normalized(record.name));
    if (clash !== undefined) throw new RegistryError("BAD_NAME", `owner name '${record.name}' collides with exact registered label '${clash.name}'`);
  }
  return { record, warnings };
}
