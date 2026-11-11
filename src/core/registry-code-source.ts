/**
 * Small facts about the code source of a registry record (spec 033 D16), next to the registry store they read: whether a
 * record already has a code source of its own, and the sorted unique union of two token lists.
 */

/** True when the record already has a code source of its own: a `code` provenance or a `code` reference. */
export const hasCodeSource = (record: { provenance?: { kind: string }; code?: unknown }): boolean =>
  record.provenance?.kind === "code" || record.code !== undefined;

/** The sorted, unique union of the tokens a record holds and the tokens read from code. */
export const unionTokens = (held: readonly string[], fromCode: readonly string[]): string[] =>
  [...new Set([...held, ...fromCode])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** A name as the kernel compares labels: NFKC, trimmed, spaces collapsed, lower case. `Card`, `card` and ` CARD ` are one. */
export const normalizedName = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
