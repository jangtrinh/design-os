/**
 * Parse a learning ledger into event records. Two shapes exist in real projects:
 * JSON Lines (one event per line) and a JSON document holding an array of entries.
 * Lines / documents that cannot be read are counted, never dropped silently.
 */
import { isRecord } from "./knowledge-promotion-ruling.js";

export interface LedgerParse {
  records: unknown[];
  /** Non-empty JSONL lines that were not valid JSON. */
  skippedLines: number;
}

const ARRAY_KEYS = ["entries", "events", "items", "records"] as const;

export function parseLedger(raw: string): LedgerParse | null {
  const trimmed = raw.trim();
  if (trimmed === "") return { records: [], skippedLines: 0 };
  if (trimmed.startsWith("[") || (trimmed.startsWith("{") && !trimmed.includes("\n{"))) {
    const whole = tryParse(trimmed);
    if (Array.isArray(whole)) return { records: whole, skippedLines: 0 };
    if (isRecord(whole)) {
      for (const key of ARRAY_KEYS) {
        const arr = whole[key];
        if (Array.isArray(arr)) return { records: arr, skippedLines: 0 };
      }
      return { records: [whole], skippedLines: 0 };
    }
  }
  const records: unknown[] = [];
  let skippedLines = 0;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = tryParse(line);
    if (parsed === undefined) skippedLines += 1; else records.push(parsed);
  }
  if (records.length === 0 && skippedLines > 0) return null;
  return { records, skippedLines };
}

function tryParse(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
}
