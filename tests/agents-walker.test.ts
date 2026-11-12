/**
 * The walker over the twelve pairwise states of agents-walker-states and the extra states of agents-walker-extra-states:
 * every command `ui agents check`, `ui agents init` (with and without --force), every refusal and every area block prints
 * is followed, and the four invariants of the engine hold. `WALK_REPORT` names a file that receives one line per state.
 */
import { appendFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { pinStudioHome } from "./agents-runtimes-helpers.js";
import { AXES, ROWS, buildState, dropBases, rowLabel } from "./agents-walker-states.js";
import { EXTRA_STATES } from "./agents-walker-extra-states.js";
import { walk } from "./agents-walker-engine.js";

pinStudioHome();
afterAll(dropBases);
const report = (label: string, r: ReturnType<typeof walk>): void => {
  const file = process.env["WALK_REPORT"];
  if (file !== undefined) appendFileSync(file, `${label}: followed ${r.followed}, ends ${r.ends}, violations ${r.violations.length}\n${r.violations.map((v) => `  ${v}`).join("\n")}${r.violations.length > 0 ? "\n" : ""}`);
};

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

describe("every printed command is followed from every pairwise state", () => {
  for (const row of ROWS) {
    it(rowLabel(row), () => {
      const result = walk(rowLabel(row), buildState(row));
      report(rowLabel(row), result);
      expect(result.violations).toEqual([]);
      expect(result.followed).toBeGreaterThan(0);
    });
  }
});

describe("every printed command is followed from the extra states", () => {
  for (const state of EXTRA_STATES) {
    it(`${state.name} (${state.why})`, () => {
      const result = walk(state.name, state.build());
      report(state.name, result);
      expect(result.violations).toEqual([]);
      expect(result.followed).toBeGreaterThan(0);
    });
  }
});
