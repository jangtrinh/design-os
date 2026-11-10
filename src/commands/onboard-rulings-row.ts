/**
 * The `owner rulings` row of `ui onboard` (FR-007): read-only, in memory. It never throws — `ui onboard` always
 * exits 0 — so an unreadable ruling store becomes a warning row that names the file.
 */
import { computeRulingState } from "../core/owner-rulings/ruling-state.js";
import { RulingStoreError } from "../core/owner-rulings/ruling-store.js";

export interface RulingsRow {
  state: "done" | "pending" | "warn";
  label: string;
  hint: string;
  pending: number;
  recorded: number;
  stale: number;
}

const QUESTIONS_HINT = "run `ui onboard questions` to see what the owner has to rule on";

export function rulingsRow(projectDir: string): RulingsRow {
  try {
    const s = computeRulingState(projectDir);
    const pending = s.pending.length;
    const recorded = s.recorded;
    const stale = s.stale.length;
    const base = { pending, recorded, stale };
    if (pending > 0) {
      const tail = recorded > 0 ? `; ${recorded} recorded, ${stale} stale` : "";
      return { ...base, state: "pending", label: `owner rulings: ${pending} pending (run: ui onboard questions)${tail}`, hint: QUESTIONS_HINT };
    }
    if (recorded > 0) {
      return { ...base, state: stale > 0 ? "warn" : "done", label: `owner rulings: ${recorded} recorded, ${stale} stale`, hint: "a stale ruling no longer matches anything in the project; it is kept until the owner removes it from design/design-dir.json" };
    }
    return { ...base, state: "done", label: "owner rulings: none needed", hint: "" };
  } catch (e) {
    const why = e instanceof RulingStoreError ? e.message : "the ruling store could not be read";
    return { state: "warn", label: "owner rulings: unreadable", hint: `${why}; fix the file, then run \`ui design lint\``, pending: 0, recorded: 0, stale: 0 };
  }
}
