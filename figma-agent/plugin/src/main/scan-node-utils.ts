// Small readers shared by every reverse-walker module (scan-node*.ts).
// Pure, sync, never throwing — the walker runs in the Figma plugin sandbox and a
// single missing/mixed field must never abort a scan.

/** Round to 2 decimals (Figma reports sub-pixel sizes; the spec stores stable ones). */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Read a possibly-mixed / throwing field; returns undefined on symbol/throw. */
export function safe<T>(read: () => T): T | undefined {
  try {
    const v = read();
    if (typeof v === 'symbol') return undefined; // figma.mixed
    return v;
  } catch {
    return undefined;
  }
}

/** Read a variable-alias id off a boundVariables entry (array field or scalar field). */
export function aliasId(val: unknown): string | undefined {
  const alias = Array.isArray(val) ? val[0] : val;
  return (alias as { id?: string } | undefined)?.id;
}
