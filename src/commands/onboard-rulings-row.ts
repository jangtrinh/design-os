/**
 * The `owner rulings` row of `ui onboard`: read-only, in memory. A store that cannot be read becomes a row that quotes
 * the reader's reason and the fix, so `ui onboard` still exits 0.
 */
import { failedEmitterKind } from "../core/owner-rulings/emitter-failure.js";
import type { KindEmitter } from "../core/owner-rulings/kind-emitter.js";
import { PendingStoreError } from "../core/owner-rulings/pending-store.js";
import { computeRulingState } from "../core/owner-rulings/ruling-state.js";
import { RulingStoreError } from "../core/owner-rulings/ruling-store.js";

export interface RulingsRow {
  state: "done" | "pending" | "warn";
  label: string;
  hint: string;
  pending: number;
  recorded: number;
  stale: number;
  /** Set only when a store could not be read: the reader's reason and the fix, for `--json`. */
  unreadable?: string;
}

const QUESTIONS_HINT = "run `ui onboard questions` to see what the owner has to rule on";
const STALE_HINT = "a stale ruling no longer matches anything in the project; it is kept until the owner removes it from design/design-dir.json";

export function rulingsRow(projectDir: string, emitters?: readonly KindEmitter[]): RulingsRow {
  const none = { pending: 0, recorded: 0, stale: 0 };
  try {
    const s = computeRulingState(projectDir, emitters === undefined ? {} : { emitters });
    const pending = s.pending.length;
    const recorded = s.recorded;
    const stale = s.stale.length;
    const base = { pending, recorded, stale };
    if (pending > 0) {
      const tail = recorded > 0 ? `; ${recorded} recorded, ${stale} stale` : "";
      return { ...base, state: "pending", label: `owner rulings: ${pending} pending (run: ui onboard questions)${tail}`, hint: QUESTIONS_HINT };
    }
    if (recorded > 0) {
      return { ...base, state: stale > 0 ? "warn" : "done", label: `owner rulings: ${recorded} recorded, ${stale} stale`, hint: STALE_HINT };
    }
    return { ...base, state: "done", label: "owner rulings: none needed", hint: "" };
  } catch (e) {
    // The stores' own messages already name the file, the reason and the fix; anything else is not ours to disguise.
    if (e instanceof PendingStoreError) return { ...none, state: "pending", label: "owner rulings: unreadable pending file", hint: e.message, unreadable: e.message };
    if (!(e instanceof RulingStoreError)) {
      // A detector that throws is state this read-only status reports; anything that is not an emitter's own failure is a bug here.
      const kind = failedEmitterKind(e);
      if (kind === undefined) throw e;
      const why = `the ${kind} detector failed: ${e instanceof Error ? e.message : String(e)}`;
      const hint = `${why}; ui onboard cannot tell what the owner still has to rule on until that detector is fixed`;
      return { ...none, state: "pending", label: `owner rulings: ${why}`, hint, unreadable: hint };
    }
    const hint = `${e.message}; repair that file by hand or restore it from version control, then run \`ui onboard\` again`;
    return { ...none, state: "warn", label: "owner rulings: unreadable", hint, unreadable: hint };
  }
}
