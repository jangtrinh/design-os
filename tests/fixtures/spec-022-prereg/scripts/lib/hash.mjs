// scripts/lib/hash.mjs
//
// Single shared SHA-256 helper module. Encodes the P1 pinned rule from
// BUILD-CONTRACT once, so every script and check applies brief_hash identically:
//   brief_hash = SHA-256( UTF-8 bytes of JSON.stringify(briefObject) )
// where briefObject is the parsed brief entry with key order exactly as committed
// (JSON.parse preserves insertion/source order). No pretty-printing, no key sorting.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Hex(bufferOrString) {
  return createHash("sha256").update(bufferOrString).digest("hex");
}

export function sha256File(absPath) {
  return sha256Hex(readFileSync(absPath));
}

export function briefHash(briefObject) {
  return sha256Hex(Buffer.from(JSON.stringify(briefObject), "utf8"));
}

export const HASH_RE = /^[0-9a-f]{64}$/;
export const SHA1_RE = /^[0-9a-f]{40}$/;
