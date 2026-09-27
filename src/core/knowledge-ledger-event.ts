/**
 * Learning-ledger event contract, mirroring schemas/learning-event.schema.json (hand-rolled — the
 * kernel takes no ajv; a test pins the enums below to the schema file). Pure and fs-free.
 */
import { isRecord } from "./knowledge-promotion-ruling.js";

export const LEARNING_EVENT_TYPES = ["gap", "insight", "retro", "correction", "ruling-candidate", "approval"] as const;
export const EVENT_SOURCES = ["observed", "synthetic", "assumed"] as const;
export const RULING_REF_RE = /^r-\S+$/;
const REQUIRED = ["id", "type", "t", "source", "refs", "text"] as const;
const FIELDS: readonly string[] = [...REQUIRED, "note"];
const NEEDS_RULING_REF: readonly string[] = ["correction", "approval"];
const TIME_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

export interface LedgerFinding {
  checkId: string;
  severity: "error";
  message: string;
  /** Event id when the event has one, else `event #n` (1-based position). */
  id: string;
}

export const eventLabel = (ev: unknown, index: number): string => (isRecord(ev) && typeof ev["id"] === "string" && ev["id"] !== "" ? ev["id"] : `event #${index + 1}`);
export const isLearningEvent = (v: unknown): v is Record<string, unknown> & { refs: string[] } =>
  isRecord(v) && (LEARNING_EVENT_TYPES as readonly unknown[]).includes(v["type"]) && Array.isArray(v["refs"]);
export const rulingRefs = (ev: unknown): string[] =>
  isRecord(ev) && Array.isArray(ev["refs"]) ? ev["refs"].filter((r): r is string => typeof r === "string" && RULING_REF_RE.test(r)) : [];

/** Every schema violation of one event (empty = clean). `index` only labels events that have no usable id. */
export function validateLearningEvent(ev: unknown, index: number): LedgerFinding[] {
  const id = eventLabel(ev, index);
  const out: LedgerFinding[] = [];
  const bad = (checkId: string, message: string): void => { out.push({ checkId, severity: "error", message, id }); };
  if (!isRecord(ev)) { bad("event-shape", "event must be a JSON object"); return out; }
  for (const key of REQUIRED) if (!(key in ev)) bad("event-shape", `missing required field '${key}'`);
  for (const key of Object.keys(ev)) if (!FIELDS.includes(key)) bad("event-field", `unknown field '${key}'`);
  if ("id" in ev && !(typeof ev["id"] === "string" && ev["id"] !== "")) bad("event-shape", "'id' must be a non-empty string");
  const type = ev["type"];
  if ("type" in ev && !(LEARNING_EVENT_TYPES as readonly unknown[]).includes(type)) {
    bad("event-type", `type ${JSON.stringify(type)} is not a learning event type (telemetry kinds are out of scope); allowed: ${LEARNING_EVENT_TYPES.join(", ")}`);
  }
  if ("t" in ev && !(typeof ev["t"] === "string" && TIME_RE.test(ev["t"]))) bad("event-time", "'t' must be an ISO date (YYYY-MM-DD) or date-time");
  if ("source" in ev && !(EVENT_SOURCES as readonly unknown[]).includes(ev["source"])) bad("event-source", `'source' must be one of ${EVENT_SOURCES.join(" | ")}`);
  if ("refs" in ev && !(Array.isArray(ev["refs"]) && ev["refs"].every((r) => typeof r === "string" && r !== ""))) bad("event-refs", "'refs' must be an array of non-empty strings");
  if ("text" in ev && !(typeof ev["text"] === "string" && ev["text"] !== "")) bad("event-text", "'text' must be a non-empty string");
  if (typeof type === "string" && NEEDS_RULING_REF.includes(type) && Array.isArray(ev["refs"]) && rulingRefs(ev).length === 0) {
    bad("ruling-ref-missing", `a ${type} event must name the ruling it produced or ratified in refs[] (an r-* id)`);
  }
  if ("note" in ev && typeof ev["note"] !== "string") bad("event-shape", "'note' must be a string");
  return out;
}

export interface LedgerLint {
  findings: LedgerFinding[];
  events: number;
  /** Events with no schema or duplicate-id error. */
  cleanEvents: number;
  /** Events that name no ruling id (r-*) — the field the recurrence path keys on. */
  withoutRulingRef: number;
  byType: Record<string, number>;
}

export function lintLedgerEvents(records: readonly unknown[]): LedgerLint {
  const findings: LedgerFinding[] = [];
  const dirty = new Set<number>();
  const seen = new Map<string, number>();
  const byType: Record<string, number> = {};
  records.forEach((ev, i) => {
    const own = validateLearningEvent(ev, i);
    if (isRecord(ev) && typeof ev["id"] === "string" && ev["id"] !== "") {
      const first = seen.get(ev["id"]);
      if (first === undefined) seen.set(ev["id"], i);
      else own.push({ checkId: "duplicate-id", severity: "error", message: `id '${ev["id"]}' already used by event #${first + 1}`, id: ev["id"] });
    }
    if (own.length > 0) dirty.add(i);
    findings.push(...own);
    const t = isRecord(ev) && typeof ev["type"] === "string" ? ev["type"] : "(none)";
    byType[t] = (byType[t] ?? 0) + 1;
  });
  return {
    findings, events: records.length, cleanEvents: records.length - dirty.size, byType,
    withoutRulingRef: records.filter((ev) => rulingRefs(ev).length === 0).length,
  };
}

/** The ledger line `draft-ruling` records for a fresh draft: deterministic id, so re-running the same draft records it once. */
export function rulingCandidateEvent(ruling: Record<string, unknown>, today: string): Record<string, unknown> {
  const rulingId = String(ruling["id"]);
  return {
    id: `ev-rc-${rulingId}`, type: "ruling-candidate", t: today, source: "observed", refs: [rulingId],
    text: `Draft ruling from an approver correction: ${String(ruling["text"])}`,
  };
}
