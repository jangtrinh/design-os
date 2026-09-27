/** Append-only writer for a learning ledger (JSON Lines). Never rewrites an existing byte. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { validateLearningEvent } from "./knowledge-ledger-event.js";
import { parseLedger } from "./knowledge-promotion-ledger.js";
import { isRecord } from "./knowledge-promotion-ruling.js";

export type AppendResult =
  | { ok: true; file: string; id: string; created: boolean }
  | { ok: false; code: "BAD_EVENT" | "DUPLICATE_ID" | "LEDGER_NOT_JSONL" | "READ_ERROR" | "WRITE_ERROR"; message: string };

/** True for a whole-document ledger (`[…]` or `{"entries":[…]}`): appending a line would corrupt it. A single-line event is JSONL. */
function isDocument(raw: string): boolean {
  let whole: unknown;
  try { whole = JSON.parse(raw.trim()); } catch { return false; }
  return Array.isArray(whole) || (isRecord(whole) && ["entries", "events", "items", "records"].some((k) => Array.isArray(whole[k])));
}

export function appendLedgerEvent(path: string, event: unknown): AppendResult {
  const file = resolve(path);
  const problems = validateLearningEvent(event, 0);
  if (problems.length > 0) return { ok: false, code: "BAD_EVENT", message: problems.map((p) => `[${p.checkId}] ${p.message}`).join("; ") };
  const id = String((event as Record<string, unknown>)["id"]);
  let raw = "";
  const existed = existsSync(file);
  if (existed) {
    try { raw = readFileSync(file, "utf8"); } catch (e) { return { ok: false, code: "READ_ERROR", message: `cannot read '${path}': ${e instanceof Error ? e.message : String(e)}` }; }
    if (isDocument(raw)) return { ok: false, code: "LEDGER_NOT_JSONL", message: `'${path}' is a JSON document, not JSON Lines — refusing to rewrite it` };
    const parsed = parseLedger(raw);
    if (parsed === null) return { ok: false, code: "LEDGER_NOT_JSONL", message: `'${path}' is not JSON Lines` };
    if (parsed.records.some((r) => isRecord(r) && r["id"] === id)) return { ok: false, code: "DUPLICATE_ID", message: `id '${id}' is already in '${path}'` };
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${raw !== "" && !raw.endsWith("\n") ? "\n" : ""}${JSON.stringify(event)}\n`, "utf8");
  } catch (e) {
    return { ok: false, code: "WRITE_ERROR", message: `cannot write ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, file, id, created: !existed };
}
