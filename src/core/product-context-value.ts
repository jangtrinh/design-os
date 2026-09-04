import { createHash } from "node:crypto";
import { canonicalStringify } from "./ds-manifest.js";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Obj = { [key: string]: Json };

export const FIELDS = [
  "flow.entryPoints",
  "flow.screens",
  "flow.transitions",
  "productTruth.audienceSituation",
  "productTruth.availableProof",
  "productTruth.contentInventory",
  "productTruth.desiredChange",
  "productTruth.primaryAction",
  "productTruth.primaryOutcome",
  "productTruth.prohibitedClaims",
] as const;
export const CAPTURES = ["captured", "capped", "skipped", "blocked", "failed"] as const;
export const DISPOSITIONS = ["present", "missing", "empty", "stale", "rejected", "malformed", "partial", "not-evaluated"] as const;
export const CANDIDATE_STATUSES = ["selected", "coalesced", "superseded", "excluded", "conflicted"] as const;
export const RESOLUTIONS = ["resolved", "missing", "unresolved", "conflicting"] as const;

const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export class ProductContextError extends Error {
  constructor(message = "invalid product context") {
    super(message);
    this.name = "ProductContextError";
  }
}

export function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalDigest(value: unknown): string {
  return sha256(Buffer.from(canonicalStringify(value), "utf8"));
}

export function badProductContext(): never {
  throw new ProductContextError();
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    badProductContext();
  }
  return value as Record<string, unknown>;
}

export function requireExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) {
    badProductContext();
  }
}

export function isKnownValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function requireScalar(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    badProductContext();
  }
  const length = [...value].length;
  if (length < min || length > max) badProductContext();
  return value;
}

export function requireIdentifier(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) badProductContext();
  return value;
}

export function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

export function requireDigest(value: unknown): string {
  if (!isDigest(value)) badProductContext();
  return value;
}

export function requireReasonCode(value: unknown): string {
  if (typeof value !== "string" || !CODE.test(value)) badProductContext();
  return value;
}

export function requireSortedStrings(
  value: unknown,
  validator: (item: unknown) => string,
  max: number,
): string[] {
  if (!Array.isArray(value) || value.length > max) badProductContext();
  const values = value.map(validator);
  if (new Set(values).size !== values.length || values.some((item, index) => index > 0 && ascii(values[index - 1] ?? "", item) >= 0)) {
    badProductContext();
  }
  return values;
}

export function requireStringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 256) badProductContext();
  return value.map((item) => requireScalar(item, 1, 2000));
}

export function isRfc3339(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|[+-]\d\d:\d\d)$/i.exec(value);
  if (match === null) return false;
  const [, year, month, day, hour, minute, second, zone = ""] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const min = Number(minute);
  const sec = Number(second);
  const days = m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
  if (m < 1 || m > 12 || d < 1 || d > days || h > 23 || min > 59 || sec > 60 || (sec === 60 && (h !== 23 || min !== 59))) return false;
  if (zone.toUpperCase() !== "Z") {
    const [zoneHours, zoneMinutes] = zone.slice(1).split(":").map(Number);
    if (zoneHours === undefined || zoneMinutes === undefined || zoneHours > 23 || zoneMinutes > 59) return false;
  }
  return true;
}

export function normalizeCounter(value: unknown, keys: readonly string[]): Obj {
  const counter = asObject(value);
  requireExactKeys(counter, keys);
  for (const key of keys) {
    if (typeof counter[key] !== "number" || !Number.isSafeInteger(counter[key]) || counter[key] < 0) {
      badProductContext();
    }
  }
  return counter as Obj;
}

export function zeroCounts(keys: readonly string[]): Obj {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Obj;
}

export function incrementCount(counts: Obj, key: string): void {
  counts[key] = Number(counts[key]) + 1;
}

export function finding(checkId: string, severity: "error" | "warning", message: string): Obj {
  return { checkId, severity, message };
}

export function finalizeProductContextFindings(input: Obj[]): { findings: Obj[]; errorCount: number; warningCount: number } {
  const seen = new Set<string>();
  const findings = input
    .filter((item) => typeof item.checkId === "string" && (item.severity === "error" || item.severity === "warning") && typeof item.message === "string")
    .filter((item) => {
      const key = JSON.stringify([item.severity, item.checkId, item.message]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => ascii(String(left.severity), String(right.severity)) || ascii(String(left.checkId), String(right.checkId)) || ascii(String(left.message), String(right.message)));
  return {
    findings,
    errorCount: findings.filter((item) => item.severity === "error").length,
    warningCount: findings.filter((item) => item.severity === "warning").length,
  };
}
