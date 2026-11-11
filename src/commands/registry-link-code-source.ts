/**
 * The one narrow write that links a component found in code to a record that came from another door (spec 033 D16,
 * "they are the same components"). The record keeps every field it has, byte for byte, and gains `code` and the union of
 * the tokens. It is not `registerComponent`: it never takes `force`, never reaches the replace branch and never builds a
 * record from code. A record that already has a code source (a `code` provenance or a `code` reference) is refused, so a
 * link is never written twice and a code source is never swapped here (`ui registry register ... --force` does that).
 */
import { RegistryError, validateSourceAuthoredComponentRecord } from "../core/registry-store.js";
import type { CodeReference, Registry } from "../core/registry-store.js";

export interface CodeLink {
  /** The exact name of the existing record. */
  name: string;
  code: CodeReference;
  /** Token paths the code source references. */
  tokens: readonly string[];
}

/** The sorted, unique union of the tokens a record holds and the tokens read from code. */
export const unionTokens = (held: readonly string[], fromCode: readonly string[]): string[] =>
  [...new Set([...held, ...fromCode])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** True when the record already has a code source of its own. */
export const hasCodeSource = (record: { provenance?: { kind: string }; code?: unknown }): boolean =>
  record.provenance?.kind === "code" || record.code !== undefined;

export function linkCodeSource(registry: Registry, link: CodeLink): Registry {
  const index = registry.components.findIndex((c) => c.name === link.name);
  if (index < 0) throw new RegistryError("NAME_NOT_FOUND", `no record is named '${link.name}': a component is linked by its exact name only`);
  const held = registry.components[index]!;
  if (hasCodeSource(held)) {
    throw new RegistryError("CODE_SOURCE_EXISTS", `'${link.name}' already has a code source: it is not linked again and its code source is not replaced here`);
  }
  const linked = validateSourceAuthoredComponentRecord({ ...held, code: link.code, tokensUsed: unionTokens(held.tokensUsed, link.tokens) });
  const components = registry.components.slice();
  components[index] = linked;
  return { ...registry, components };
}
