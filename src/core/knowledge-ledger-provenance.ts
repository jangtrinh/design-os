/**
 * Provenance helpers shared by every knowledge ledger pair (Canvas UI's
 * effect catalog, ShaderGradient's gradient catalog, and any later one).
 *
 * Extracted from knowledge-effect-catalog-parse.ts when the second ledger
 * arrived: both need to read a pinned-revision token out of a direction file
 * and to age a `YYYYMM` capture stamp, and duplicating either would mean a
 * fix to one ledger's staleness rule silently missing the other — the exact
 * shape of the shared-layer rule in CLAUDE.md. knowledge-effect-catalog-parse.ts
 * re-exports both so its own public surface is unchanged.
 *
 * FS-FREE: pure string/number transforms, no clock (Art I.2 — `asOf` is always
 * caller-supplied, never `Date.now()`).
 */

/** The first 40-hex-char git SHA found in a knowledge file's prose, or null. */
export function extractRevisionToken(content: string): string | null {
  const m = /\b[0-9a-f]{40}\b/.exec(content);
  return m === null ? null : m[0];
}

/** Months from a `YYYYMM` string to the asOf month; null when either is malformed. */
export function monthsBetween(fileYm: string, asOf: string): number | null {
  const parse = (s: string): number | null => {
    const m = /^(\d{4})(\d{2})$/.exec(s);
    if (m === null) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return y * 12 + (mo - 1);
  };
  const a = parse(fileYm);
  const b = parse(asOf);
  if (a === null || b === null) return null;
  return b - a;
}
