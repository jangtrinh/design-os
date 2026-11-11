/**
 * `scan-budget` (FR-014): the walk of `ui scan` hit its entry cap, so the map is missing entries. The question names
 * the first-level directories that spent the budget (the scan's own `budget[]`) and asks which the walk should not
 * enter. The member is the directory, project-relative; the outcome is `skip` or `keep`, so the answer survives a
 * reorder and a rename of a directory is a new member. Single-choice, assigned: each option gives every directory its
 * own outcome. "Keep" is a real answer: the owner accepts an incomplete map, and `ui scan` keeps saying it is one.
 *
 * `sense` runs the walk (the only part that touches the disk) with the owner's earlier skips honoured, so a skip that
 * brought the walk under the cap dissolves the question; `detect` is pure over what it returned.
 */
import { MAX_ENTRIES, isSkippedDir, scanProject } from "../project-scan.js";
import { NO_SCAN_RULINGS, scanRulingsOf } from "../project-scan-rulings.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { ClusterOption, MemberChoice } from "./cluster.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface ScanBudgetInput {
  truncated: boolean;
  /** The entry cap of the walk. */
  limit: number;
  /** Top first-level directories by entries visited, most first (the scan's `budget[]`). */
  budget: { dir: string; visited: number }[];
  /** Directories the owner already told the walk to skip: members that exist, so their ruling is not stale. */
  skipped: string[];
}

export const SKIP = "skip";
export const KEEP_WALKING = "keep";
export const KEEP_ALL = "keep-all";
export const SKIP_ALL = "skip-all";

const CHOICES: MemberChoice[] = [{ id: SKIP, label: "Do not walk it" }, { id: KEEP_WALKING, label: "Keep walking it" }];

function detect(raw: unknown): KindDetection | null {
  const input = raw as ScanBudgetInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.budget)) return null;
  const dirs = input.budget.map((b) => b.dir);
  const visited = new Map(input.budget.map((b) => [b.dir, b.visited]));
  return {
    kind: "scan-budget",
    members: input.truncated ? dirs : [],
    domain: [...new Set([...dirs, ...input.skipped])],
    ask(members) {
      // Largest first, ties in the order the scan listed them.
      const ordered = [...members].sort((a, b) => (visited.get(b) ?? 0) - (visited.get(a) ?? 0));
      const spent = (group: readonly string[]): number => group.reduce((n, m) => n + (visited.get(m) ?? 0), 0);
      const outcomes = (skip: ReadonlySet<string>): Record<string, string> => Object.fromEntries(ordered.map((m) => [m, skip.has(m) ? SKIP : KEEP_WALKING]));
      const largest = ordered[0] as string;
      const options: ClusterOption[] = [{
        id: `skip:${largest}`, label: ordered.length === 1 ? `Do not walk ${largest}` : `Do not walk ${largest}, the largest`,
        consequence: `${spent([largest])} of the ${input.limit} entries are no longer spent in ${largest}; ${ordered.length === 1 ? "nothing else changes" : `the other ${ordered.length - 1} stay walked`}`,
        assigns: outcomes(new Set([largest])),
      }];
      if (ordered.length > 1) {
        options.push({
          id: SKIP_ALL, label: `Do not walk any of the ${ordered.length}`,
          consequence: `${spent(ordered)} of the ${input.limit} entries are no longer spent in these ${ordered.length} directories`,
          assigns: outcomes(new Set(ordered)),
        });
      }
      options.push({
        id: KEEP_ALL, label: "Keep walking them all and accept an incomplete map",
        consequence: `the walk stays capped at ${input.limit} entries; ui scan keeps reporting that the map is incomplete`,
        assigns: outcomes(new Set()),
      });
      options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${ordered.length} director${ordered.length === 1 ? "y" : "ies"}; you choose per directory` });
      const list = ordered.map((m) => `${m} (${visited.get(m) ?? 0} entries)`).join(", ");
      return {
        question: `The scan stopped at ${input.limit} entries, so its map is incomplete. These directories spent the budget: ${list}. Which should the walk not enter?`,
        options,
        memberChoices: Object.fromEntries(ordered.map((m) => [m, CHOICES])),
        labels: Object.fromEntries(ordered.map((m) => [m, `${visited.get(m) ?? 0} entries`])),
      };
    },
  };
}

/**
 * Gathers what the walk reports, with the owner's skips honoured and no app root pruned. A directory the walk never
 * enters (a dot-directory such as this tool's own `.design-os`, a skipped build directory, a directory the owner
 * already skipped) costs one entry and is not a consumer of the budget, so it is never a member.
 */
function sense(projectDir: string): ScanBudgetInput {
  const rulings = scanRulingsOf(projectDir);
  const r = scanProject(projectDir, { ...NO_SCAN_RULINGS, skip: rulings.skip });
  const budget = r.budget.filter((b) => !isSkippedDir(b.dir) && !rulings.skip.includes(b.dir));
  return { truncated: r.truncated, limit: MAX_ENTRIES, budget, skipped: [...rulings.skip] };
}

export const scanBudgetEmitter: KindEmitter = { kind: "scan-budget", sense, detect };
