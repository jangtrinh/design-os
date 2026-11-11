/**
 * The one narrow write that refreshes the code source of a record from the source as it is now (spec 033 D18, "refresh"),
 * the sibling of `linkCodeSource`. It is not `registerComponent`: it never takes `force`, never reaches the replace branch
 * and never builds a record from nothing. The record must already have a code source, and everything it rewrites is named:
 *  - a record with a `code` provenance: the provenance (reference and hash), the markup (the source slice), `tokensUsed`
 *    and the variants are rewritten from the current source;
 *  - a record linked to a record of another door (a `code` reference): only the `code` reference is rewritten and
 *    `tokensUsed` becomes its old value plus the tokens read from code now. The record does not say which door a token came
 *    from, so a token the code no longer references is kept.
 * Every other field is kept byte for byte, and the result is validated like any record.
 */
import { hasCodeSource, unionTokens } from "../core/registry-code-source.js";
import { RegistryError, validateSourceAuthoredComponentRecord } from "../core/registry-store.js";
import type { CodeReference, ComponentRecord, Registry } from "../core/registry-store.js";

export interface CodeRefresh {
  /** The exact name of the record. */
  name: string;
  code: CodeReference;
  /** The source slice the code reference points at: the new markup of a record with a `code` provenance. */
  markup: string;
  /** Token paths the code source references now. */
  tokens: readonly string[];
  /** Variants the code source states exactly now; empty when no extractor read them. */
  variants: readonly string[];
}

export function refreshCodeSource(registry: Registry, refresh: CodeRefresh): Registry {
  const index = registry.components.findIndex((c) => c.name === refresh.name);
  if (index < 0) throw new RegistryError("NAME_NOT_FOUND", `no record is named '${refresh.name}': a record is refreshed by its exact name only`);
  const held = registry.components[index]!;
  if (!hasCodeSource(held)) {
    throw new RegistryError("CODE_SOURCE_MISSING", `'${refresh.name}' has no code source: only a record registered from code, or linked to code, is refreshed`);
  }
  let next: ComponentRecord;
  if (held.provenance?.kind === "code") {
    const { variants: _held, ...rest } = held; // eslint-disable-line @typescript-eslint/no-unused-vars
    next = { ...rest, provenance: { ...held.provenance, sourceRef: refresh.code.sourceRef, sha256: refresh.code.sha256 }, markup: refresh.markup, tokensUsed: [...refresh.tokens], ...(refresh.variants.length > 0 && { variants: [...refresh.variants] }) };
  } else {
    next = { ...held, code: refresh.code, tokensUsed: unionTokens(held.tokensUsed, refresh.tokens) };
  }
  const components = registry.components.slice();
  components[index] = validateSourceAuthoredComponentRecord(next);
  return { ...registry, components };
}
