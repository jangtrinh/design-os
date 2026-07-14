/**
 * `ui taste next` — propose the next thing to vote on. Read-only, no mutation.
 */
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  resolveTasteRoot, loadItems, loadVotes, loadStudies, rootHasStore, TasteLedgerError,
} from "../core/taste-store.js";
import { computeElo, pickPair, pickStudy } from "../core/taste-rank.js";

const CMD = "taste next";

export function runTasteNext(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const mode = parsed.flags["mode"];
  if (mode !== "pair" && mode !== "study") return err("E_TASTE_BAD_FLAGS", "--mode pair|study is required");

  const root = resolveTasteRoot(parsed);
  if (typeof root !== "string") return err("E_TASTE_BAD_FLAGS", root.err);
  if (!rootHasStore(root)) return err("E_TASTE_ROOT", `no taste store at '${root}' — run 'ui taste ingest' first`);

  const genre = typeof parsed.flags["genre"] === "string" ? parsed.flags["genre"] : undefined;

  let items, votes, studies;
  try {
    items = loadItems(root);
    votes = loadVotes(root);
    studies = mode === "study" ? loadStudies(root) : [];
  } catch (e) {
    if (e instanceof TasteLedgerError) return err("E_TASTE_LEDGER", e.message);
    throw e;
  }

  if (mode === "pair") {
    const pair = pickPair(items, votes, genre);
    if (pair === null) return err("E_TASTE_NO_ITEMS", "no pair available (need >=2 items in a genre)");
    const stats = computeElo(items, votes);
    const byId = new Map(items.map((it) => [it.id, it]));
    const describe = (id: string) => {
      const s = stats.get(id);
      return { id, file: byId.get(id)?.file ?? "", elo: s?.elo ?? 1000, votes: s?.votes ?? 0 };
    };
    const data: Record<string, unknown> = {
      mode, genre: pair.genre, a: describe(pair.a), b: describe(pair.b), swapped: pair.swapped,
    };
    if (pair.repeatOf !== undefined) data["repeatOf"] = pair.repeatOf;
    if (useJson) return okJson(CMD, data);
    return ok(`${pair.genre}: ${pair.a} vs ${pair.b}${pair.swapped ? " (swapped)" : ""}\n`);
  }

  // mode === "study": --genre (if given) restricts the candidate pool only.
  const pool = genre !== undefined ? items.filter((it) => it.genre === genre) : items;
  const pickedId = pickStudy(pool, votes, studies);
  if (pickedId === null) return err("E_TASTE_NO_ITEMS", "no unstudied item available");
  const stats = computeElo(items, votes);
  const it = pool.find((x) => x.id === pickedId);
  const s = stats.get(pickedId);
  const data = { mode, item: { id: pickedId, file: it?.file ?? "", genre: it?.genre ?? "", elo: s?.elo ?? 1000, votes: s?.votes ?? 0 } };
  if (useJson) return okJson(CMD, data);
  return ok(`${data.item.genre}: ${data.item.id} (${data.item.file})\n`);
}
