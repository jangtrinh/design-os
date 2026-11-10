/**
 * The ruling store: `onboard.rulings` in `design/design-dir.json`, schema version 2 (FR-006, CD-3).
 * Version 1 files are read as "no rulings". Writing a ruling re-serialises the file (2-space JSON, final newline)
 * and upgrades it to version 2; key order and the value of every key other than `version` and `onboard` are kept.
 * `actor` is always "owner". The manifest has one writer at a time: there is no lock.
 *
 * A ruling of a set-valued kind always carries `members`, a keep/drop map over exactly the members it covers, so no
 * reader ever interprets an option id; `outcomeOf` is the one reader of a ruling's answer.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../knowledge-promotion-ruling.js";
import { writeJsonAtomic } from "./atomic-write.js";
import { CLUSTER_KIND_TABLE, isClusterKind } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { FINGERPRINT } from "./fingerprint.js";

export const MANIFEST_REL = "design/design-dir.json";
export const KEEP = "keep";
export const DROP = "drop";

export interface Ruling {
  kind: ClusterKind;
  fingerprint: string;
  /** One option id; a list of option ids for a set-valued kind. */
  choice: string | string[];
  /** The member identities the answer covered. */
  covers: string[];
  /**
   * Set-valued kind: always present, member -> "keep" | "drop". Single-choice kind: present only after `review
   * individually`, member -> option id.
   */
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

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const sameKeys = (map: Record<string, unknown>, list: readonly string[]): boolean => {
  const keys = Object.keys(map);
  return keys.length === list.length && list.every((m) => Object.hasOwn(map, m));
};

/** Parses one ruling in full; the writer runs the same function over what it is about to write. */
export function parseRuling(raw: unknown, index: number): Ruling {
  const bad = (why: string): never => { throw new RulingStoreError(`${MANIFEST_REL}: onboard.rulings[${index}] ${why}`); };
  if (!isRecord(raw)) return bad("is not an object");
  const { kind, fingerprint, choice, covers, members, actor, at } = raw;
  if (!isClusterKind(kind)) return bad("has an unknown kind");
  if (typeof fingerprint !== "string" || !FINGERPRINT.test(fingerprint)) return bad("needs a fingerprint of 64 lowercase hex characters");
  if (!isStringList(covers) || covers.length === 0) return bad("needs covers (the member identities it ruled on)");
  if (actor !== "owner") return bad('must have actor "owner"');
  if (typeof at !== "string" || at === "") return bad("needs an ISO timestamp in at");
  if (members !== undefined && !(isRecord(members) && Object.values(members).every((v) => typeof v === "string"))) return bad("has malformed members");
  if (CLUSTER_KIND_TABLE[kind].setValued) {
    if (!isStringList(choice) || choice.length === 0) return bad("is set-valued: choice must be a non-empty list of option ids");
    if (members === undefined || !sameKeys(members, covers) || !Object.values(members).every((v) => v === KEEP || v === DROP)) {
      return bad('is set-valued: members must map exactly the covered members to "keep" or "drop"');
    }
    return { kind, fingerprint, choice, covers, members: members as Record<string, string>, actor, at };
  }
  if (typeof choice !== "string" || choice === "") return bad("is single-choice: choice must be one option id");
  if (members !== undefined && !sameKeys(members, covers)) return bad("members must map exactly the covered members");
  return { kind, fingerprint, choice, covers, ...(members === undefined ? {} : { members: members as Record<string, string> }), actor, at };
}

/** The outcome a ruling gives one member: "keep" or "drop" for a set-valued kind, else its option id. */
export function outcomeOf(ruling: Ruling, member: string): string {
  const own = ruling.members?.[member];
  if (CLUSTER_KIND_TABLE[ruling.kind].setValued) {
    if (own === undefined) throw new Error(`a set-valued ruling has no outcome for '${member}'`);
    return own;
  }
  return own ?? (ruling.choice as string);
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
  if (version === 1 || onboard === undefined) return { ...empty, version };
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
 * Appends rulings (a ruling with the same kind and fingerprint is replaced, latest wins) and upgrades the manifest to
 * version 2. Every ruling is first run through the reader's own parser: nothing is written that would not read back.
 */
export function appendRulings(projectDir: string, added: readonly Ruling[]): void {
  const checked = added.map((r, i) => parseRuling(JSON.parse(JSON.stringify(r)) as unknown, i));
  const doc = readManifestObject(projectDir) ?? { version: 1 };
  const onboard = isRecord(doc["onboard"]) ? doc["onboard"] : {};
  const kept = readRulingStore(projectDir).rulings.filter((r) => !checked.some((a) => a.kind === r.kind && a.fingerprint === r.fingerprint));
  writeJsonAtomic(join(projectDir, MANIFEST_REL), { ...doc, version: 2, onboard: { ...onboard, rulings: [...kept, ...checked] } });
}
