/**
 * What a reader saw and did not use, counted per named reason. A source report carries `seen` (entries met) and
 * `leftOut` (reason -> count): nothing is skipped without a number and a reason, and a wrong-typed value never changes
 * meaning silently. Reasons are plain text; a reason about a reference field starts with the field (`scope: `, ...).
 */
export type LeftOut = Map<string, number>;

export const leave = (m: LeftOut, why: string, n = 1): void => { m.set(why, (m.get(why) ?? 0) + n); };

/** The counts as a record with sorted keys (the file is deterministic); undefined when nothing was left out. */
export function leftOutRecord(m: ReadonlyMap<string, number>): Record<string, number> | undefined {
  const rows = [...m].filter(([, n]) => n > 0).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rows.length === 0 ? undefined : Object.fromEntries(rows);
}

/** A key present with a value that is not a non-empty string: not understood (an absent key is simply absent). */
export const isBadString = (o: Record<string, unknown>, key: string): boolean => key in o && !(typeof o[key] === "string" && o[key] !== "");
