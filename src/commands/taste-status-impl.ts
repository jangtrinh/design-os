/**
 * `ui taste status` — ledger counts, top-Elo per genre, self-consistency. Read-only.
 */
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  resolveTasteRoot, loadItems, loadVotes, loadStudies, rootHasStore, TasteLedgerError,
} from "../core/taste-store.js";
import type { TasteItem, PairVote } from "../core/taste-store.js";
import { computeElo, pickStudy, selfConsistency } from "../core/taste-rank.js";

const CMD = "taste status";

function votesInGenre(votes: readonly PairVote[], ids: Set<string>): number {
  return votes.filter((v) => ids.has(v.a) && ids.has(v.b)).length;
}

export function runTasteStatus(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const root = resolveTasteRoot(parsed);
  if (typeof root !== "string") return err("E_TASTE_BAD_FLAGS", root.err);
  if (!rootHasStore(root)) return err("E_TASTE_ROOT", `no taste store at '${root}' — run 'ui taste ingest' first`);

  let items, votes, studies;
  try {
    items = loadItems(root);
    votes = loadVotes(root);
    studies = loadStudies(root);
  } catch (e) {
    if (e instanceof TasteLedgerError) return err("E_TASTE_LEDGER", e.message);
    throw e;
  }

  const genreFilter = typeof parsed.flags["genre"] === "string" ? parsed.flags["genre"] : undefined;
  const scopedItems: TasteItem[] = genreFilter !== undefined ? items.filter((it) => it.genre === genreFilter) : items;
  const scopedIds = new Set(scopedItems.map((it) => it.id));
  const scopedVotes = votes.filter((v) => scopedIds.has(v.a) && scopedIds.has(v.b));
  const scopedStudies = studies.filter((s) => scopedIds.has(s.item));

  const byGenre = new Map<string, TasteItem[]>();
  for (const it of scopedItems) {
    const arr = byGenre.get(it.genre);
    if (arr) arr.push(it); else byGenre.set(it.genre, [it]);
  }
  const genres = [...byGenre.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([genre, arr]) => ({
    genre, items: arr.length, votes: votesInGenre(votes, new Set(arr.map((it) => it.id))),
  }));

  const stats = computeElo(items, votes);
  const topElo = [...scopedItems]
    .sort((x, y) => {
      const ex = stats.get(x.id)?.elo ?? 1000, ey = stats.get(y.id)?.elo ?? 1000;
      return ex !== ey ? ey - ex : x.id.localeCompare(y.id);
    })
    .slice(0, 5)
    .map((it) => ({ id: it.id, genre: it.genre, elo: stats.get(it.id)?.elo ?? 1000, votes: stats.get(it.id)?.votes ?? 0 }));

  const unstudiedTop = pickStudy(scopedItems, votes, studies);
  const consistency = selfConsistency(scopedVotes);

  const data = {
    items: scopedItems.length, votes: scopedVotes.length, studies: scopedStudies.length,
    genres, topElo, consistency, unstudiedTop,
  };
  if (useJson) return okJson(CMD, data);
  const genreLines = genres.map((g) => `  ${g.genre}: ${g.items} items, ${g.votes} votes`).join("\n");
  return ok(
    `taste: ${data.items} item(s), ${data.votes} vote(s), ${data.studies} study(ies)\n` +
    (genreLines.length > 0 ? `${genreLines}\n` : "") +
    `consistency: ${consistency.rate !== null ? `${(consistency.rate * 100).toFixed(0)}% (${consistency.agree}/${consistency.repeats})` : "n/a (no repeats yet)"}\n`,
  );
}
