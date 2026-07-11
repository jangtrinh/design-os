/**
 * Evidence store IO (DESIGN-OS T6). The store is a self-contained, git-committable
 * directory: `<dir>/research.events.jsonl` (append-only ledger) + `<dir>/research-sources/`
 * (verbatim source texts). Keeping sources in-tree makes `ui evidence verify` and the
 * T0 coverage resolver re-checkable by anyone who clones the repo. Deterministic IO only.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { EvidenceError, parseEvidence, serializeEvidence, quoteMatches } from "./evidence-model.js";
import type { EvidenceRecord } from "./evidence-model.js";

export const EVENTS_FILE = "research.events.jsonl";
export const SOURCES_DIR = "research-sources";

export const eventsPath = (dir: string): string => join(dir, EVENTS_FILE);
export const sourcesPath = (dir: string): string => join(dir, SOURCES_DIR);
export const sourceFile = (dir: string, ref: string): string => join(sourcesPath(dir), ref);

/** Load every ledger record. Missing file → empty (a fresh store). Throws on a malformed line. */
export function loadEvidence(dir: string): EvidenceRecord[] {
  const path = eventsPath(dir);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const out: EvidenceRecord[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (line === undefined || line === "") continue;
    let obj: unknown;
    try { obj = JSON.parse(line); }
    catch { throw new EvidenceError("BAD_EVIDENCE", `${EVENTS_FILE}:${i + 1}: not valid JSON`); }
    out.push(parseEvidence(obj, `${EVENTS_FILE}:${i + 1}`));
  }
  return out;
}

/** Read a stored source text by ref. Throws SOURCE_MISSING when absent. */
export function readSource(dir: string, ref: string): string {
  const path = sourceFile(dir, ref);
  if (!existsSync(path)) throw new EvidenceError("SOURCE_MISSING", `source '${ref}' not found under ${SOURCES_DIR}/`);
  return readFileSync(path, "utf8");
}

/**
 * Copy an external source file into the store's sources dir, keyed by basename.
 * Idempotent when the content is identical; a name collision with different bytes is a hard error
 * (two different sources cannot share a ref). Returns the ref actually stored.
 */
export function ingestSource(dir: string, srcPath: string): string {
  let text: string;
  try { text = readFileSync(srcPath, "utf8"); }
  catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new EvidenceError(notFound ? "FILE_NOT_FOUND" : "READ_ERROR", notFound ? `source file not found: '${srcPath}'` : `cannot read '${srcPath}'`);
  }
  const ref = basename(srcPath);
  const dest = sourceFile(dir, ref);
  mkdirSync(sourcesPath(dir), { recursive: true });
  if (existsSync(dest)) {
    if (readFileSync(dest, "utf8") !== text) throw new EvidenceError("SOURCE_COLLISION", `a different source named '${ref}' already exists in the store`);
  } else {
    writeFileSync(dest, text);
  }
  return ref;
}

/** Append a record to the ledger, creating the store dir if needed. */
export function appendEvidence(dir: string, rec: EvidenceRecord): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(eventsPath(dir), serializeEvidence(rec) + "\n");
}

export interface VerifyResult {
  id: string;
  ok: boolean;
  reason?: string;
}

/** Re-verify one record's anti-fabrication contract against its stored source. */
export function verifyRecord(dir: string, rec: EvidenceRecord): VerifyResult {
  if (rec.kind !== "quote") return { id: rec.id, ok: true };
  if (rec.quote === undefined || rec.source === undefined) return { id: rec.id, ok: false, reason: "quote record missing quote/source" };
  let text: string;
  try { text = readSource(dir, rec.source.ref); }
  catch (e) { return { id: rec.id, ok: false, reason: e instanceof Error ? e.message : String(e) }; }
  return quoteMatches(rec.quote, text)
    ? { id: rec.id, ok: true }
    : { id: rec.id, ok: false, reason: `quote is not a verbatim substring of '${rec.source.ref}'` };
}

/** Verify every quote record in the store. */
export function verifyAll(dir: string): VerifyResult[] {
  return loadEvidence(dir).map((r) => verifyRecord(dir, r));
}

/** List source basenames present in the store (for reporting). */
export function listSources(dir: string): string[] {
  const p = sourcesPath(dir);
  return existsSync(p) ? readdirSync(p).sort() : [];
}
