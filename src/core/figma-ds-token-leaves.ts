/**
 * The per-variable half of the token build: which DTCG type a variable has, why it has none, and whether every value
 * it carries (the base mode and each other mode) can be written. An alias is only ever written against a variable that
 * is itself written; `figma-ds-tokens.ts` runs `failureOf` to a fixed point so that rule holds for chains.
 */
import { colorToHex, inferDtcgType, isAliasValue, literalValue, pickBaseMode, sanitizeSeg } from "./figma-ds-token-values.js";
import type { DsVariable, DtcgLeaf, DtcgType } from "./figma-ds-token-values.js";

/** Why a variable is left out of the tree (a collision is its own thing: see `collisions`). */
export const SKIP_REASONS = ["unmappable-type", "null-leaf", "dangling-alias", "alias-cycle", "bad-colour"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** The reasons that name an alias: the owner can only exclude such a variable (there is no value to keep). */
export const ALIAS_REASONS: readonly SkipReason[] = ["dangling-alias", "alias-cycle"];

/** What the ingest knows about a variable that is not written as a typed token. */
export interface SkipDetail {
  reason: SkipReason;
  /** The mode whose value failed, when it was not the base mode. */
  mode?: string;
  /** True when the owner may keep it as a raw string token: a value reason, and a base value that is not an alias. */
  keepable: boolean;
}

/** The value used for tier/type detection: the base mode's value, else the flat `value`. */
export function firstValue(v: DsVariable): unknown {
  if (v.valuesByMode !== undefined) {
    const base = pickBaseMode(Object.keys(v.valuesByMode));
    if (base !== undefined) return v.valuesByMode[base];
  }
  return v.value;
}

/** Resolve a variable's DTCG $type, following alias chains to the target's type. */
export function resolveType(v: DsVariable, byId: Map<string, DsVariable>, memo: Map<string, DtcgType | null>, seen: Set<string>): DtcgType | null {
  if (memo.has(v.id)) return memo.get(v.id) ?? null;
  const direct = firstValue(v);
  if (isAliasValue(direct)) {
    if (seen.has(v.id)) return null; // cycle
    seen.add(v.id);
    const target = byId.get(direct.id);
    const t = target !== undefined ? resolveType(target, byId, memo, seen) : null;
    memo.set(v.id, t);
    return t;
  }
  const t = inferDtcgType(v.name, v.type);
  memo.set(v.id, t);
  return t;
}

/**
 * Why a variable has no DTCG type. A variable whose own value is a literal is "unmappable-type". A variable that
 * aliases follows its chain: back to its start is a real cycle; any other end (a variable that is not in the scan, or
 * one that has no type) leaves the alias pointing at something that cannot be written.
 */
export function typeSkipReason(v: DsVariable, byId: Map<string, DsVariable>): SkipReason {
  if (!isAliasValue(firstValue(v))) return "unmappable-type";
  const seen = new Set<string>();
  let cur = v;
  for (;;) {
    const val = firstValue(cur);
    if (!isAliasValue(val)) return "dangling-alias";
    // A cycle is a walk that returns to where it started; a walk that runs into a cycle ends at an unwritable target.
    if (seen.has(cur.id)) return cur.id === v.id ? "alias-cycle" : "dangling-alias";
    seen.add(cur.id);
    const next = byId.get(val.id);
    if (next === undefined) return "dangling-alias";
    cur = next;
  }
}

const isPrimitive = (x: unknown): x is string | number | boolean => typeof x === "string" || typeof x === "number" || typeof x === "boolean";

/** Every mode of a variable with its value; a flat `value` is one unnamed mode. */
function modeValues(v: DsVariable): Array<[string, unknown]> {
  return v.valuesByMode !== undefined ? Object.entries(v.valuesByMode) : [["", v.value]];
}

/**
 * The owner may keep a variable as a raw string token only when every mode value is a primitive and no failure is tied
 * to one mode: a raw token carries each mode as a string, and an object, an alias or a null has no string to carry.
 */
export const isKeepable = (reason: SkipReason, v: DsVariable, mode?: string): boolean =>
  mode === undefined && !ALIAS_REASONS.includes(reason) && modeValues(v).every(([, raw]) => isPrimitive(raw));

type Failure = { reason: SkipReason; mode?: string };

/** The mode entries of a variable and its base mode; a flat `value` is one unnamed mode. */
function modesOf(v: DsVariable): { entries: Array<[string, unknown]>; base: string } {
  const entries: Array<[string, unknown]> = v.valuesByMode !== undefined ? Object.entries(v.valuesByMode) : [["", v.value]];
  return { entries, base: pickBaseMode(entries.map(([m]) => m)) ?? "" };
}

function valueFailure(type: DtcgType, raw: unknown, written: ReadonlySet<string>): SkipReason | null {
  if (isAliasValue(raw)) return written.has(raw.id) ? null : "dangling-alias";
  if (literalValue(type, raw) !== null) return null;
  return type === "color" && raw !== null && raw !== undefined && colorToHex(raw) === null ? "bad-colour" : "null-leaf";
}

/** The first value of the variable that cannot be written given which variables are written, base mode first. */
export function failureOf(v: DsVariable, type: DtcgType, written: ReadonlySet<string>): Failure | null {
  const { entries, base } = modesOf(v);
  const baseEntry = entries.find(([m]) => m === base);
  const own = valueFailure(type, baseEntry?.[1], written);
  if (own !== null) return { reason: own };
  for (const [mode, raw] of entries) {
    if (mode === base || mode === "") continue;
    const reason = valueFailure(type, raw, written);
    if (reason !== null) return { reason, mode };
  }
  return null;
}

/** The DTCG leaf for a variable that `failureOf` accepted; aliases resolve against the paths of written variables. */
export function buildLeaf(v: DsVariable, type: DtcgType, dottedOf: (id: string) => string | undefined): DtcgLeaf {
  const toValue = (raw: unknown): string | number => {
    if (isAliasValue(raw)) return `{${dottedOf(raw.id) ?? ""}}`;
    return literalValue(type, raw) as string | number;
  };
  const { entries, base } = modesOf(v);
  const leaf: DtcgLeaf = { $value: toValue(entries.find(([m]) => m === base)?.[1]), $type: type };
  const extensions: Record<string, unknown> = {};
  for (const [mode, raw] of entries) {
    if (mode !== base && mode !== "") extensions[`mode.${sanitizeSeg(mode)}`] = { $value: toValue(raw) };
  }
  if (Object.keys(extensions).length > 0) leaf.$extensions = extensions;
  return leaf;
}

/**
 * A raw string token for a variable the owner chose to keep although it cannot be typed. Only a keepable variable
 * (see `isKeepable`) reaches here: the base mode is `$value` and every other mode sits in the per-mode shape typed
 * tokens use, each as a string. No object is ever serialised into a value.
 */
export function rawLeaf(v: DsVariable): DtcgLeaf {
  const entries = modeValues(v);
  const base = pickBaseMode(entries.map(([m]) => m)) ?? "";
  const leaf: DtcgLeaf = { $value: String(entries.find(([m]) => m === base)?.[1]), $type: "string", $description: `kept raw from Figma ${v.type}` };
  const extensions: Record<string, unknown> = {};
  for (const [mode, raw] of entries) if (mode !== base && mode !== "") extensions[`mode.${sanitizeSeg(mode)}`] = { $value: String(raw) };
  if (Object.keys(extensions).length > 0) leaf.$extensions = extensions;
  return leaf;
}

/** A short display of a variable's base value for a question, or "" when nothing short fits. */
export function shortValue(v: DsVariable): string {
  const raw = firstValue(v);
  if (isAliasValue(raw)) return "";
  const text = colorToHex(raw) ?? (typeof raw === "string" || typeof raw === "number" ? String(raw) : "");
  return text.length <= 24 ? text : "";
}
