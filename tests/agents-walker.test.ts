/**
 * The walker over the twelve states of agents-walker-states: every command `ui agents check`, `ui agents init` (with and
 * without --force), every refusal and every area block prints is followed, and the four invariants of the engine hold.
 */
import { afterAll, describe, expect, it } from "vitest";
import { pinStudioHome } from "./agents-runtimes-helpers.js";
import { AXES, ROWS, buildState, dropBases, rowLabel } from "./agents-walker-states.js";
import { walk } from "./agents-walker-engine.js";

pinStudioHome();
afterAll(dropBases);

describe("the rows are a pairwise cover", () => {
  it("every value of every axis meets every value of every other axis in at least one row", () => {
    const axes = Object.keys(AXES) as (keyof typeof AXES)[];
    for (const a of axes) for (const b of axes) {
      if (a >= b) continue;
      for (const x of AXES[a]) for (const y of AXES[b]) {
        expect(ROWS.some((r) => r[a] === x && r[b] === y), `${a}=${x} with ${b}=${y}`).toBe(true);
      }
    }
  });
});

describe("every printed command is followed from every state", () => {
  for (const row of ROWS) {
    it(rowLabel(row), () => {
      const result = walk(rowLabel(row), buildState(row));
      expect(result.violations).toEqual([]);
      expect(result.followed).toBeGreaterThan(0);
    });
  }
});
