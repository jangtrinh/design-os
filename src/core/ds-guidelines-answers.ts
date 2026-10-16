/**
 * DS Guidelines Pack — the answers store (pure, no fs).
 *
 * A host's answers used to live only inside generated files that `build` overwrites, so every guard
 * around them (slot ids, which files were harvested, write order) left another way to lose one. The
 * store `guidelines.answers.json` is the durable home: build harvests every answer it can find, merges
 * them by slot id, writes the store FIRST, and only then rewrites the files from it.
 *
 *   { "version": 1, "answers": { "<slot id>": { "lines": ["**Do:** …", …], "file": "<pack path last seen>" } } }
 *
 * Who wins for one slot id (a different text that loses is parked in the orphans file, once):
 *   1. the answer written in the file this build puts the slot in;
 *   2. else the previous store's answer (so an answer deleted from a file comes back — to discard one on
 *      purpose, delete it from the store too);
 *   3. else an answer in any other pack file or in the orphans file, in code-unit order of the path.
 * The previous store's text, when the file's answer replaced it, is an earlier revision of the same answer
 * (the person edited it in place), not a competing one, so it is not parked.
 */
import { canonicalStringify } from "./ds-manifest.js";
import { GuidelinesInputError, compareText } from "./ds-guidelines-model.js";
import { collectAnswers, parseOrphanEntries } from "./ds-guidelines-slots.js";
import type { ExistingAnswer } from "./ds-guidelines-slots.js";

export const ANSWERS_FILE = "guidelines.answers.json";
/** Slot prompt written for a parked answer whose original prompt is unknown (it came from the store). */
export const NOT_RECORDED = "(not recorded)";

export interface StoredAnswer {
  lines: string[];
  /** Pack path where the answer was last seen. */
  file: string;
}

export interface AnswersStore {
  version: 1;
  answers: Record<string, StoredAnswer>;
}

const bad = (why: string): GuidelinesInputError =>
  new GuidelinesInputError("BAD_ANSWERS_STORE", `${ANSWERS_FILE} is not a valid answers store: ${why} — repair it, or delete it to rebuild the store from the pack's markdown files`);

/** Parse and validate a store; throws BAD_ANSWERS_STORE with the reason. */
export function parseAnswersStore(text: string): AnswersStore {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw bad(`invalid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObject(raw)) throw bad("the top level must be an object");
  if (raw["version"] !== 1) throw bad(`version must be 1, got ${JSON.stringify(raw["version"])}`);
  const answers = raw["answers"];
  if (!isObject(answers)) throw bad("'answers' must be an object");
  const entries = Object.entries(answers).map(([id, v]): [string, StoredAnswer] => {
    const ok = isObject(v) && Array.isArray(v["lines"]) && v["lines"].length > 0 && v["lines"].every((l) => typeof l === "string") && typeof v["file"] === "string";
    if (!ok) throw bad(`the entry for '${id}' must be { "lines": [<text>, …], "file": <path> }`);
    return [id, { lines: [...(v["lines"] as string[])], file: v["file"] as string }];
  });
  // fromEntries defines own properties, so an id like "__proto__" cannot reach the prototype.
  return { version: 1, answers: Object.fromEntries(entries) };
}

/** Canonical, deterministic text of a store (sorted keys, trailing newline). */
export const renderAnswersStore = (answers: ReadonlyMap<string, StoredAnswer>): string =>
  canonicalStringify({ version: 1, answers: Object.fromEntries([...answers].sort(([a], [b]) => compareText(a, b))) });

interface Candidate extends ExistingAnswer {
  /** 0 = the file this build assigns the slot to, 1 = the previous store, 2 = any other file. */
  rank: 0 | 1 | 2;
  seq: number;
}

const textOf = (lines: readonly string[]): string => lines.join("\n").trim();

export interface MergedAnswers {
  /** The winning answer for every id seen anywhere; `file` is where it now lives (or last was). */
  answers: Map<string, StoredAnswer>;
  /** Answers to park in the orphans file: losers, plus every winner whose slot this build does not produce. */
  parked: ExistingAnswer[];
}

export function mergeAnswers(opts: {
  store: AnswersStore | undefined;
  files: readonly { path: string; text: string }[];
  orphansText: string | undefined;
  /** Slot id → pack file the new build puts it in. */
  assigned: ReadonlyMap<string, string>;
}): MergedAnswers {
  const byId = new Map<string, Candidate[]>();
  let seq = 0;
  const add = (c: ExistingAnswer, rank: 0 | 1 | 2): void => {
    const list = byId.get(c.id) ?? [];
    list.push({ ...c, rank, seq: seq++ });
    byId.set(c.id, list);
  };
  for (const [id, s] of Object.entries(opts.store?.answers ?? {})) add({ id, file: s.file, prompt: NOT_RECORDED, lines: s.lines }, 1);
  for (const a of collectAnswers(opts.files)) add(a, opts.assigned.get(a.id) === a.file ? 0 : 2);
  for (const a of parseOrphanEntries(opts.orphansText)) add(a, 2);

  const answers = new Map<string, StoredAnswer>();
  const parked: ExistingAnswer[] = [];
  for (const id of [...byId.keys()].sort(compareText)) {
    const ranked = (byId.get(id) ?? []).sort((a, b) =>
      a.rank - b.rank || (a.rank === 2 ? compareText(a.file, b.file) : 0) || a.seq - b.seq);
    const winner = ranked[0];
    if (winner === undefined) continue;
    const slotFile = opts.assigned.get(id);
    answers.set(id, { lines: winner.lines, file: slotFile ?? winner.file });
    const seen = new Set<string>([textOf(winner.lines)]);
    for (const c of ranked.slice(1)) {
      const key = textOf(c.lines);
      if (seen.has(key)) continue;
      seen.add(key);
      if (c.rank === 1 && winner.rank === 0) continue; // an earlier revision of the answer the person just edited
      parked.push(c);
    }
    if (slotFile === undefined) parked.push(winner); // no slot for it now: it must stay visible in the orphans file
  }
  return { answers, parked: parked.map(({ id, file, line, prompt, lines }) => ({ id, file, ...(line !== undefined ? { line } : {}), prompt, lines })) };
}
