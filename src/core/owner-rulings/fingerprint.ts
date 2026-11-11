/**
 * Cluster fingerprints: SHA-256 over the JSON array [kind, sorted unique members]. JSON string encoding leaves no
 * delimiter ambiguity (one member "a\nb" differs from the two members "a" and "b"), and every member is normalised
 * to Unicode NFC first, so the two spellings of an accented name are one member.
 */
import { createHash } from "node:crypto";
import type { ClusterKind } from "./cluster-kinds.js";

/** Stable member order: NFC, then plain code-unit comparison, so the order never depends on the locale. */
export function sortedUnique(members: readonly string[]): string[] {
  return [...new Set(members.map((m) => m.normalize("NFC")))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The member id of something identified by a key and the ids of the things on it: `<key>#<sorted ids>`. */
export function memberWithIds(key: string, ids: readonly string[]): string {
  return `${key}#${[...ids].sort().join(",")}`;
}

export function fingerprintOf(kind: ClusterKind, members: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([kind, sortedUnique(members)])).digest("hex");
}

export const FINGERPRINT = /^[0-9a-f]{64}$/;
