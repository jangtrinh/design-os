/**
 * The ruling store: `onboard.rulings` in `design/design-dir.json`, schema version 2 (FR-006, CD-3).
 * Version 1 files are read as "no rulings". Writing a ruling upgrades the file and leaves every other
 * key — `derived` above all — exactly as it was. `actor` is always "owner"; nothing else writes here.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isClusterKind } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";

export const MANIFEST_REL = "design/design-dir.json";

export interface Ruling {
  kind: ClusterKind;
  fingerprint: string;
  /** One option id, or a list of ids for a set-valued kind. */
  choice: string | string[];
  /** The member identities the answer covered; the subset rule of FR-006 reads it. */
  covers: string[];
  /** Per-member option ids; present only after `review individually`. */
  members?: Record<string, string>;
  actor: "owner";
  at: string;
}

export interface RulingStore {
  /** null when no manifest exists. */
  version: 1 | 2 | null;
  rulings: Ruling[];
  scan: { skip: string[]; roots: string[] };
}

export class RulingStoreError extends Error {
  readonly code = "BAD_MANIFEST";
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function parseRuling(raw: unknown, index: number): Ruling {
  const bad = (why: string): never => { throw new RulingStoreError(`${MANIFEST_REL}: onboard.rulings[${index}] ${why}`); };
  if (!isRecord(raw)) return bad("is not an object");
  const { kind, fingerprint, choice, covers, members, actor, at } = raw;
  if (!isClusterKind(kind)) return bad("has an unknown kind");
  if (typeof fingerprint !== "string" || fingerprint === "") return bad("needs a fingerprint");
  if (typeof choice !== "string" && !isStringList(choice)) return bad("needs a choice (an id or a list of ids)");
  if (!isStringList(covers)) return bad("needs covers (the member identities it ruled on)");
  if (actor !== "owner") return bad('must have actor "owner"');
  if (typeof at !== "string") return bad("needs an ISO timestamp in at");
  if (members !== undefined && !(isRecord(members) && Object.values(members).every((v) => typeof v === "string"))) return bad("has malformed members");
  return { kind, fingerprint, choice, covers, ...(members === undefined ? {} : { members: members as Record<string, string> }), actor, at };
}

/** Reads the raw manifest object, or null when there is no file. Throws RulingStoreError on unreadable JSON. */
function readManifestObject(projectDir: string): Record<string, unknown> | null {
  const path = join(projectDir, MANIFEST_REL);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new RulingStoreError(`${MANIFEST_REL} is not valid JSON`); }
  if (!isRecord(raw)) throw new RulingStoreError(`${MANIFEST_REL} is not a JSON object`);
  if (raw["version"] !== 1 && raw["version"] !== 2) throw new RulingStoreError(`${MANIFEST_REL}: version must be 1 or 2`);
  return raw;
}

export function readRulingStore(projectDir: string): RulingStore {
  const doc = readManifestObject(projectDir);
  const empty: RulingStore = { version: null, rulings: [], scan: { skip: [], roots: [] } };
  if (doc === null) return empty;
  const version = doc["version"] as 1 | 2;
  const onboard = doc["onboard"];
  if (version === 1) return { ...empty, version };
  if (onboard === undefined) return { ...empty, version };
  if (!isRecord(onboard)) throw new RulingStoreError(`${MANIFEST_REL}: onboard must be an object`);
  const list = onboard["rulings"] ?? [];
  if (!Array.isArray(list)) throw new RulingStoreError(`${MANIFEST_REL}: onboard.rulings must be an array`);
  const scan = isRecord(onboard["scan"]) ? onboard["scan"] : {};
  return {
    version,
    rulings: list.map(parseRuling),
    scan: { skip: isStringList(scan["skip"]) ? scan["skip"] : [], roots: isStringList(scan["roots"]) ? scan["roots"] : [] },
  };
}

/**
 * Appends rulings (a ruling with the same kind and fingerprint is replaced, latest wins) and upgrades the
 * manifest to version 2. Every key other than `version` and `onboard.rulings` keeps its value and position.
 */
export function appendRulings(projectDir: string, added: readonly Ruling[]): void {
  const doc = readManifestObject(projectDir) ?? { version: 1 };
  const onboard = isRecord(doc["onboard"]) ? doc["onboard"] : {};
  const kept = readRulingStore(projectDir).rulings.filter((r) => !added.some((a) => a.kind === r.kind && a.fingerprint === r.fingerprint));
  const next = { ...doc, version: 2, onboard: { ...onboard, rulings: [...kept, ...added] } };
  const path = join(projectDir, MANIFEST_REL);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, path);
}
