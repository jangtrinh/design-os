/**
 * `taste-rank` — pure Elo replay + deterministic pairing/study-pick/consistency.
 * No fs, no CLI; fixtures are built in-memory.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { computeElo, pickPair, pickStudy, selfConsistency } from "../src/core/taste-rank.js";
import type { TasteItem, PairVote, StudyRecord, PairWinner } from "../src/core/taste-store.js";

function item(id: string, genre = "g"): TasteItem {
  return { v: 1, id, sha256: id.padEnd(64, "0"), file: `corpus/${genre}/${id}.png`, genre, addedAt: "2026-01-01T00:00:00.000Z" };
}

function vote(a: string, b: string, winner: PairWinner, ts: string, extra: Partial<PairVote> = {}): PairVote {
  return { v: 1, ts, mode: "pair", a, b, winner, reasons: [], swapped: false, ...extra };
}

describe("computeElo", () => {
  it("elo K=32 single win", () => {
    const items = [item("a"), item("b")];
    const stats = computeElo(items, [vote("a", "b", "a", "2026-01-01T00:00:01.000Z")]);
    expect(stats.get("a")).toEqual({ elo: 1016, votes: 1, wins: 1, losses: 0, ties: 0 });
    expect(stats.get("b")).toEqual({ elo: 984, votes: 1, wins: 0, losses: 1, ties: 0 });
  });

  it("tie 0.5", () => {
    const items = [item("a"), item("b")];
    const stats = computeElo(items, [vote("a", "b", "tie", "2026-01-01T00:00:01.000Z")]);
    expect(stats.get("a")).toEqual({ elo: 1000, votes: 1, wins: 0, losses: 0, ties: 1 });
    expect(stats.get("b")).toEqual({ elo: 1000, votes: 1, wins: 0, losses: 0, ties: 1 });
  });

  it("skip excluded", () => {
    const items = [item("a"), item("b")];
    const stats = computeElo(items, [vote("a", "b", "skip", "2026-01-01T00:00:01.000Z")]);
    expect(stats.get("a")).toEqual({ elo: 1000, votes: 0, wins: 0, losses: 0, ties: 0 });
    expect(stats.get("b")).toEqual({ elo: 1000, votes: 0, wins: 0, losses: 0, ties: 0 });
  });

  it("replay order deterministic", () => {
    const items = [item("a"), item("b"), item("c")];
    // b's two matches have OPPOSITE outcomes (loses to a, beats c) so the two
    // replay orders genuinely diverge — not just floating-point noise.
    const v1 = vote("a", "b", "a", "2026-01-01T00:00:01.000Z"); // a beats b
    const v2 = vote("b", "c", "a", "2026-01-01T00:00:02.000Z"); // b beats c

    const forward = computeElo(items, [v1, v2]);
    const forwardAgain = computeElo(items, [v1, v2]);
    expect(forward.get("b")).toEqual(forwardAgain.get("b")); // same order twice => identical (pure/deterministic)

    const reversed = computeElo(items, [v2, v1]);
    expect(forward.get("b")?.elo).not.toBeCloseTo(reversed.get("b")?.elo ?? NaN, 1); // array order drives replay
  });
});

describe("pickPair", () => {
  it("pickPair least-voted A", () => {
    const items = [item("A"), item("B"), item("C")];
    const votes = [
      vote("B", "C", "a", "2026-01-01T00:00:01.000Z"),
      vote("B", "C", "b", "2026-01-01T00:00:02.000Z"),
    ]; // B and C each have 2 votes; A has 0 and must be chosen as the logical "least-voted A"
    const pair = pickPair(items, votes, "g");
    expect(pair).not.toBeNull();
    const chosenA = pair?.swapped ? pair.b : pair?.a;
    expect(chosenA).toBe("A");
  });

  it("pickPair same-genre only", () => {
    const items = [item("A", "g1"), item("B", "g1"), item("C", "g2"), item("D", "g2")];
    const pair = pickPair(items, [], "g1");
    expect(pair).not.toBeNull();
    expect(pair?.genre).toBe("g1");
    expect([pair?.a, pair?.b].every((id) => id === "A" || id === "B")).toBe(true);
  });

  it("pickPair elo-adjacent B", () => {
    const items = [item("A"), item("B1"), item("B2"), item("B3")];
    const votes = [
      vote("B1", "B2", "a", "2026-01-01T00:00:01.000Z"), // B1=1016, B2=984
      vote("B2", "B3", "a", "2026-01-01T00:00:02.000Z"), // B2 ~1000.7, B3 ~983.3
    ];
    // A stays at 1000 (0 votes, uniquely least-voted). None of B1/B2/B3 have faced A yet.
    // Distances from 1000: B1≈16, B2≈0.7, B3≈16.7 — B2 is the closest Elo match.
    const pair = pickPair(items, votes, "g");
    expect(pair).not.toBeNull();
    const chosenA = pair?.swapped ? pair.b : pair?.a;
    const chosenB = pair?.swapped ? pair.a : pair?.b;
    expect(chosenA).toBe("A");
    expect(chosenB).toBe("B2");
  });

  it("pickPair repeat on 10th with swap", () => {
    const items = [item("A"), item("B")];
    const votes: PairVote[] = [];
    for (let i = 0; i < 9; i++) {
      votes.push(vote("A", "B", i % 2 === 0 ? "a" : "b", `2026-01-01T00:00:${String(i + 1).padStart(2, "0")}.000Z`));
    }
    expect(votes.length).toBe(9); // (9+1) % 10 === 0 → REPEAT fires
    const pair = pickPair(items, votes, "g");
    expect(pair).toEqual({ a: "B", b: "A", genre: "g", swapped: true, repeatOf: votes[0]?.ts });
  });

  it("pickPair swap parity deterministic", () => {
    const items = [item("A"), item("B")];
    const pair1 = pickPair(items, [], "g");
    const pair2 = pickPair(items, [], "g");
    expect(pair1).toEqual(pair2); // repeated calls on identical ledger state agree

    // Independently recompute the documented formula: first byte of sha256("A:B:0") % 2 === 1.
    // A is the canonical least-voted "a" (tie-broken id asc over B), B the only candidate.
    const expectedByte = createHash("sha256").update("A:B:0").digest()[0] ?? 0;
    expect(pair1?.swapped).toBe(expectedByte % 2 === 1);
  });
});

describe("pickStudy", () => {
  it("pickStudy skips studied", () => {
    const items = [item("A"), item("B"), item("C")];
    const studies: StudyRecord[] = [
      { v: 1, ts: "2026-01-01T00:00:01.000Z", mode: "study", item: "A", verdict: "LEARN" },
    ];
    const picked = pickStudy(items, [], studies);
    expect(picked).not.toBe("A");
    expect(picked).toBe("B"); // B/C tie on votes(0)/elo(1000) => id asc
  });
});

describe("selfConsistency", () => {
  it("selfConsistency swap-compensated", () => {
    const votes: PairVote[] = [
      vote("X", "Y", "a", "2026-01-01T00:00:01.000Z"), // original: X won
      vote("Y", "X", "b", "2026-01-01T00:00:02.000Z", { swapped: true, repeatOf: "2026-01-01T00:00:01.000Z" }), // repeat: b=X won too => AGREE
      vote("X", "Z", "tie", "2026-01-01T00:00:03.000Z"), // original: tie
      vote("Z", "X", "a", "2026-01-01T00:00:04.000Z", { swapped: true, repeatOf: "2026-01-01T00:00:03.000Z" }), // repeat: a=Z won => DISAGREE (tie expected)
    ];
    expect(selfConsistency(votes)).toEqual({ repeats: 2, agree: 1, rate: 0.5 });
  });

  it("no repeats yields a null rate", () => {
    expect(selfConsistency([vote("X", "Y", "a", "2026-01-01T00:00:01.000Z")])).toEqual({ repeats: 0, agree: 0, rate: null });
  });
});
