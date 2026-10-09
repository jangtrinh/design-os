/** A disposable graph with malformed consumed fields must be rebuilt, not trusted. */
import type { MemoryGraph } from "./memory-graph.js";

type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const string = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(string);
const optionalString = (v: unknown): boolean => v === undefined || string(v);
const oneOf = (v: unknown, values: string[]): boolean => string(v) && values.includes(v);
const list = (v: unknown, check: (x: Row) => boolean): boolean => Array.isArray(v) && v.every((x) => row(x) && check(x));
const map = (v: unknown, check: (x: Row) => boolean): boolean => row(v) && Object.values(v).every((x) => row(x) && check(x));

export function validGraphCache(value: unknown): value is MemoryGraph {
  if (!row(value) || value["v"] !== 2 || !string(value["sourceHash"]) || !string(value["compiledAt"])
    || !Number.isFinite(Date.parse(value["compiledAt"])) || !number(value["eventCount"])
    || !Number.isInteger(value["eventCount"]) || value["eventCount"] < 0
    || !number(value["halfLifeDays"]) || value["halfLifeDays"] <= 0) return false;
  return map(value["personas"], (x) => number(x["generated"]) && number(x["pickWeight"]) && number(x["rawPicks"]) && string(x["lastAt"]))
    && map(value["axes"], (x) => number(x["failWeight"]) && strings(x["fixes"]))
    && map(value["tokens"], (x) => number(x["changes"]) && optionalString(x["lastReason"]))
    && map(value["designs"], (x) => strings(x["medium"]) && typeof x["picked"] === "boolean" && optionalString(x["lastFingerprint"]))
    && list(value["vibes"], (x) => string(x["word"]) && number(x["weight"]) && number(x["count"]) && string(x["axis"]))
    && list(value["insights"], (x) => string(x["id"]) && string(x["t"]) && string(x["text"]) && strings(x["refs"])
      && number(x["seen"]) && number(x["upvotes"]) && number(x["downvotes"]) && string(x["lastSeenAt"]))
    && list(value["lessons"], (x) => string(x["id"]) && string(x["t"]) && string(x["text"]) && string(x["dsRevision"])
      && strings(x["refs"]) && row(x["scope"]) && oneOf(x["scope"]["kind"], ["project", "component", "pattern"])
      && optionalString(x["scope"]["target"]) && oneOf(x["status"], ["pending", "accepted", "rejected", "revoked"])
      && list(x["reviews"], (r) => string(r["id"]) && string(r["t"]) && string(r["actor"]) && string(r["reason"])
        && string(r["decision"]) && ["accept", "reject", "revoke"].includes(r["decision"])
        && string(r["approvalRef"]) && string(r["approvalFingerprint"])));
}
