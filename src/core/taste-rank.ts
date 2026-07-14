/**
 * Deterministic ranking + pairing over the taste ledgers. Pure functions only
 * (no fs, no clock, no Math.random) — Elo state is never persisted; every
 * command recomputes it by replaying votes.jsonl in file order. Swap parity
 * and REPEAT-vote selection are seeded from ledger content (sha256 of the
 * candidate pair + running vote count), so two runs against the same ledger
 * always propose the same next pair.
 */
import { createHash } from "node:crypto";
import type { TasteItem, PairVote, StudyRecord, TasteGenre } from "./taste-store.js";

export interface EloStat { elo: number; votes: number; wins: number; losses: number; ties: number }

const INITIAL_ELO = 1000;
const K = 32;

/** Replay votes.jsonl (in file order) into per-item Elo + record counts. */
export function computeElo(items: readonly TasteItem[], votes: readonly PairVote[]): Map<string, EloStat> {
  const stats = new Map<string, EloStat>();
  for (const it of items) stats.set(it.id, { elo: INITIAL_ELO, votes: 0, wins: 0, losses: 0, ties: 0 });

  for (const v of votes) {
    if (v.winner === "skip") continue;
    const sa = stats.get(v.a), sb = stats.get(v.b);
    if (sa === undefined || sb === undefined) continue; // defensive: vote references a pruned item
    const ea = 1 / (1 + 10 ** ((sb.elo - sa.elo) / 400));
    const scoreA = v.winner === "a" ? 1 : v.winner === "b" ? 0 : 0.5;
    const delta = K * (scoreA - ea);
    sa.elo += delta;
    sb.elo -= delta;
    sa.votes++; sb.votes++;
    if (v.winner === "a") { sa.wins++; sb.losses++; }
    else if (v.winner === "b") { sb.wins++; sa.losses++; }
    else { sa.ties++; sb.ties++; }
  }
  return stats;
}

// ─── pickPair ─────────────────────────────────────────────────────────────────

export interface PickPairResult { a: string; b: string; genre: TasteGenre; swapped: boolean; repeatOf?: string }

/** Deterministic first byte of sha256(seed), 0–255 — swap parity, never Math.random. */
function firstHashByte(seed: string): number {
  return createHash("sha256").update(seed).digest()[0] ?? 0;
}

/** How many times x and y have been shown together (any winner, including skip). */
function facedCount(votes: readonly PairVote[], x: string, y: string): number {
  let n = 0;
  for (const v of votes) if ((v.a === x && v.b === y) || (v.a === y && v.b === x)) n++;
  return n;
}

export function pickPair(
  items: readonly TasteItem[],
  votes: readonly PairVote[],
  genre?: TasteGenre,
): PickPairResult | null {
  const stats = computeElo(items, votes);
  const byGenre = new Map<TasteGenre, TasteItem[]>();
  for (const it of items) {
    const arr = byGenre.get(it.genre);
    if (arr) arr.push(it); else byGenre.set(it.genre, [it]);
  }

  // 1. Resolve the target genre: explicit, or the one with >=2 items and the
  //    lowest avg votes/item (tie: genre asc).
  let targetGenre = genre;
  if (targetGenre === undefined) {
    let best: { genre: string; avg: number } | undefined;
    for (const [g, arr] of [...byGenre.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
      if (arr.length < 2) continue;
      const totalVotes = arr.reduce((s, it) => s + (stats.get(it.id)?.votes ?? 0), 0);
      const avg = totalVotes / arr.length;
      if (best === undefined || avg < best.avg) best = { genre: g, avg };
    }
    if (best === undefined) return null;
    targetGenre = best.genre;
  }
  const pool = byGenre.get(targetGenre) ?? [];
  if (pool.length < 2) return null;

  // 2. REPEAT: every 10th recorded vote re-shows the oldest unrepeated earlier
  //    pair from this pool, with a/b swapped.
  if ((votes.length + 1) % 10 === 0) {
    const poolIds = new Set(pool.map((it) => it.id));
    const alreadyRepeated = new Set(votes.map((v) => v.repeatOf).filter((r): r is string => r !== undefined));
    const original = votes.find(
      (v) => v.winner !== "skip" && poolIds.has(v.a) && poolIds.has(v.b) && !alreadyRepeated.has(v.ts),
    );
    if (original !== undefined) {
      return { a: original.b, b: original.a, genre: targetGenre, swapped: !original.swapped, repeatOf: original.ts };
    }
  }

  // 3. A = least-voted in pool (tie: id asc). B = never-faced-A preferred,
  //    closest Elo (tie: id asc); if all have faced A, fewest times faced,
  //    then closest Elo, then id asc.
  const sorted = [...pool].sort((x, y) => {
    const dv = (stats.get(x.id)?.votes ?? 0) - (stats.get(y.id)?.votes ?? 0);
    return dv !== 0 ? dv : x.id.localeCompare(y.id);
  });
  const a = sorted[0];
  if (a === undefined) return null; // unreachable (pool.length >= 2 above)
  const eloA = stats.get(a.id)?.elo ?? INITIAL_ELO;

  const candidates = pool.filter((it) => it.id !== a.id);
  const unfaced = candidates.filter((it) => facedCount(votes, a.id, it.id) === 0);
  const pickFrom = unfaced.length > 0 ? unfaced : candidates;
  const ranked = [...pickFrom].sort((x, y) => {
    if (unfaced.length === 0) {
      const fx = facedCount(votes, a.id, x.id), fy = facedCount(votes, a.id, y.id);
      if (fx !== fy) return fx - fy;
    }
    const ex = Math.abs((stats.get(x.id)?.elo ?? INITIAL_ELO) - eloA);
    const ey = Math.abs((stats.get(y.id)?.elo ?? INITIAL_ELO) - eloA);
    return ex !== ey ? ex - ey : x.id.localeCompare(y.id);
  });
  const b = ranked[0];
  if (b === undefined) return null; // unreachable (candidates non-empty when pool.length >= 2)

  // 4. Swap parity: deterministic from sha256(a:b:voteCount), never Math.random.
  const swapped = firstHashByte(`${a.id}:${b.id}:${votes.length}`) % 2 === 1;
  return swapped
    ? { a: b.id, b: a.id, genre: targetGenre, swapped: true }
    : { a: a.id, b: b.id, genre: targetGenre, swapped: false };
}

// ─── pickStudy ─────────────────────────────────────────────────────────────────

/** Items with no StudyRecord, sorted votes desc → elo desc → id asc; first, or null. */
export function pickStudy(
  items: readonly TasteItem[],
  votes: readonly PairVote[],
  studies: readonly StudyRecord[],
): string | null {
  const studied = new Set(studies.map((s) => s.item));
  const stats = computeElo(items, votes);
  const candidates = items.filter((it) => !studied.has(it.id));
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((x, y) => {
    const sx = stats.get(x.id), sy = stats.get(y.id);
    const vx = sx?.votes ?? 0, vy = sy?.votes ?? 0;
    if (vx !== vy) return vy - vx; // votes desc
    const ex = sx?.elo ?? INITIAL_ELO, ey = sy?.elo ?? INITIAL_ELO;
    if (ex !== ey) return ey - ex; // elo desc
    return x.id.localeCompare(y.id); // id asc
  });
  return sorted[0]?.id ?? null;
}

// ─── selfConsistency ─────────────────────────────────────────────────────────

export interface ConsistencyResult { repeats: number; agree: number; rate: number | null }

/** Translate a repeat vote's winner into the ORIGINAL vote's a/b frame (a/b swap). */
function translateWinner(w: PairVote["winner"]): PairVote["winner"] {
  return w === "a" ? "b" : w === "b" ? "a" : w;
}

/** Agreement rate between each repeat vote and the original it repeats. */
export function selfConsistency(votes: readonly PairVote[]): ConsistencyResult {
  const byTs = new Map(votes.map((v) => [v.ts, v]));
  let repeats = 0, agree = 0;
  for (const v of votes) {
    if (v.repeatOf === undefined) continue;
    const original = byTs.get(v.repeatOf);
    if (original === undefined) continue;
    repeats++;
    if (translateWinner(v.winner) === original.winner) agree++;
  }
  return { repeats, agree, rate: repeats > 0 ? agree / repeats : null };
}
