/**
 * Taste corpus store — types, jsonl IO, root resolution, and shape validators
 * for the taste-hub ledgers (items/votes/study). Mirrors memory-events.ts /
 * memory-store.ts: append-only JSONL is the only source of truth; every line
 * is validated on load AND on append so a corrupt ledger fails loud with its
 * line number instead of silently poisoning Elo replay.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ParsedArgs } from "./cli-args.js";

// ─── Types (v1, locked) ─────────────────────────────────────────────────────

export type TasteGenre = string;
export type Verdict = "LEARN" | "PARTIAL" | "SKIP";
export const VERDICTS: readonly Verdict[] = ["LEARN", "PARTIAL", "SKIP"];

export interface TasteItem {
  v: 1; id: string; sha256: string; dhash?: string;
  file: string; genre: TasteGenre; sourceUrl?: string; addedAt: string;
}

export type PairWinner = "a" | "b" | "tie" | "skip";
export const WINNERS: readonly PairWinner[] = ["a", "b", "tie", "skip"];

export interface PairVote {
  v: 1; ts: string; mode: "pair"; a: string; b: string;
  winner: PairWinner; reasons: string[]; note?: string;
  swapped: boolean; repeatOf?: string; ms?: number;
}

export interface StudyRecord {
  v: 1; ts: string; mode: "study"; item: string;
  blindVerdict?: Verdict; verdict: Verdict; note?: string; lessonRef?: string;
}

export function isPairWinner(w: string): w is PairWinner {
  return (WINNERS as readonly string[]).includes(w);
}
export function isVerdict(v: string): v is Verdict {
  return (VERDICTS as readonly string[]).includes(v);
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** A corrupt/malformed ledger line — always names the file and 1-based line number. */
export class TasteLedgerError extends Error {
  readonly file: string;
  readonly line: number;
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = "TasteLedgerError";
    this.file = file;
    this.line = line;
  }
}

// ─── Root resolution + paths ────────────────────────────────────────────────

export const ITEMS_FILE = "items.jsonl";
export const VOTES_FILE = "votes.jsonl";
export const STUDY_FILE = "study.jsonl";

/** Precedence: --root flag > DESIGN_OS_TASTE_ROOT env > <cwd>/taste. */
export function resolveTasteRoot(parsed: ParsedArgs): string | { err: string } {
  const flag = parsed.flags["root"];
  if (flag !== undefined) {
    if (typeof flag !== "string" || flag.trim() === "") return { err: "--root requires a path value" };
    return resolve(flag);
  }
  const env = process.env["DESIGN_OS_TASTE_ROOT"];
  if (env !== undefined && env.trim() !== "") return resolve(env);
  return resolve(process.cwd(), "taste");
}

export const itemsPath = (root: string): string => join(root, ITEMS_FILE);
export const votesPath = (root: string): string => join(root, VOTES_FILE);
export const studyPath = (root: string): string => join(root, STUDY_FILE);
export const inboxDir = (root: string, genre?: string): string =>
  genre !== undefined ? join(root, "inbox", genre) : join(root, "inbox");
export const corpusDir = (root: string, genre: string): string => join(root, "corpus", genre);

/** True when root already has a ledger — the "store exists" gate for non-ingest verbs. */
export function rootHasStore(root: string): boolean {
  return existsSync(itemsPath(root));
}

// ─── Line-level validators (shared by load + append) ────────────────────────

/** Grab an optional string field, or undefined (not an error — caller decides if required). */
function str(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}

function parseItem(o: unknown): TasteItem {
  if (typeof o !== "object" || o === null) throw new Error("not a JSON object");
  const r = o as Record<string, unknown>;
  const v = r["v"], id = r["id"], sha256 = r["sha256"], file = r["file"], genre = r["genre"], addedAt = r["addedAt"];
  if (v !== 1) throw new Error("item.v must be 1");
  if (typeof id !== "string") throw new Error("item missing 'id'");
  if (typeof sha256 !== "string") throw new Error("item missing 'sha256'");
  if (typeof file !== "string") throw new Error("item missing 'file'");
  if (typeof genre !== "string") throw new Error("item missing 'genre'");
  if (typeof addedAt !== "string") throw new Error("item missing 'addedAt'");
  const item: TasteItem = { v: 1, id, sha256, file, genre, addedAt };
  const dhash = str(r, "dhash"); if (dhash !== undefined) item.dhash = dhash;
  const sourceUrl = str(r, "sourceUrl"); if (sourceUrl !== undefined) item.sourceUrl = sourceUrl;
  return item;
}

function parseVote(o: unknown): PairVote {
  if (typeof o !== "object" || o === null) throw new Error("not a JSON object");
  const r = o as Record<string, unknown>;
  const v = r["v"], ts = r["ts"], mode = r["mode"], a = r["a"], b = r["b"], winner = r["winner"], swapped = r["swapped"];
  if (v !== 1) throw new Error("vote.v must be 1");
  if (mode !== "pair") throw new Error("vote.mode must be 'pair'");
  if (typeof ts !== "string") throw new Error("vote missing 'ts'");
  if (typeof a !== "string") throw new Error("vote missing 'a'");
  if (typeof b !== "string") throw new Error("vote missing 'b'");
  if (typeof winner !== "string" || !isPairWinner(winner)) {
    throw new Error(`vote.winner must be one of ${WINNERS.join("|")}`);
  }
  if (typeof swapped !== "boolean") throw new Error("vote missing boolean 'swapped'");
  const reasonsRaw = r["reasons"];
  const reasons = Array.isArray(reasonsRaw) ? reasonsRaw.filter((x): x is string => typeof x === "string") : [];
  const vote: PairVote = { v: 1, ts, mode: "pair", a, b, winner, reasons, swapped };
  const note = str(r, "note"); if (note !== undefined) vote.note = note;
  const repeatOf = str(r, "repeatOf"); if (repeatOf !== undefined) vote.repeatOf = repeatOf;
  const ms = r["ms"]; if (typeof ms === "number") vote.ms = ms;
  return vote;
}

function parseStudy(o: unknown): StudyRecord {
  if (typeof o !== "object" || o === null) throw new Error("not a JSON object");
  const r = o as Record<string, unknown>;
  const v = r["v"], ts = r["ts"], mode = r["mode"], item = r["item"], verdict = r["verdict"];
  if (v !== 1) throw new Error("study.v must be 1");
  if (mode !== "study") throw new Error("study.mode must be 'study'");
  if (typeof ts !== "string") throw new Error("study missing 'ts'");
  if (typeof item !== "string") throw new Error("study missing 'item'");
  if (typeof verdict !== "string" || !isVerdict(verdict)) {
    throw new Error(`study.verdict must be one of ${VERDICTS.join("|")}`);
  }
  const rec: StudyRecord = { v: 1, ts, mode: "study", item, verdict };
  const blind = r["blindVerdict"];
  if (blind !== undefined) {
    if (typeof blind !== "string" || !isVerdict(blind)) throw new Error(`study.blindVerdict must be one of ${VERDICTS.join("|")}`);
    rec.blindVerdict = blind;
  }
  const note = str(r, "note"); if (note !== undefined) rec.note = note;
  const lessonRef = str(r, "lessonRef"); if (lessonRef !== undefined) rec.lessonRef = lessonRef;
  return rec;
}

// ─── Ledger IO ────────────────────────────────────────────────────────────────

function loadLines<T>(path: string, file: string, parse: (o: unknown) => T): T[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n");
  const out: T[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (line === "") continue;
    let obj: unknown;
    try { obj = JSON.parse(line); } catch { throw new TasteLedgerError(file, i + 1, "not valid JSON"); }
    try { out.push(parse(obj)); } catch (e) {
      throw new TasteLedgerError(file, i + 1, e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}

export const loadItems = (root: string): TasteItem[] => loadLines(itemsPath(root), ITEMS_FILE, parseItem);
export const loadVotes = (root: string): PairVote[] => loadLines(votesPath(root), VOTES_FILE, parseVote);
export const loadStudies = (root: string): StudyRecord[] => loadLines(studyPath(root), STUDY_FILE, parseStudy);

function append<T>(root: string, path: string, x: T, parse: (o: unknown) => T): void {
  parse(x); // re-validate shape before writing (defensive: catches an internal bug, not user input)
  mkdirSync(root, { recursive: true });
  appendFileSync(path, JSON.stringify(x) + "\n", "utf8");
}

export const appendItem = (root: string, item: TasteItem): void => append(root, itemsPath(root), item, parseItem);
export const appendVote = (root: string, vote: PairVote): void => append(root, votesPath(root), vote, parseVote);
export const appendStudy = (root: string, study: StudyRecord): void => append(root, studyPath(root), study, parseStudy);
