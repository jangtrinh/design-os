/**
 * `app-roots` (FR-013): the scan found more than one nested app root (a `package.json` below the scan root). A
 * multi-select question: which are this project's apps. The member is the app root, project-relative; the answer is
 * recorded per root (`keep` / `drop`), so a stored ruling does not depend on how the options were grouped. A root
 * ruled `drop` is not walked by `ui scan` from then on; a root no ruling covers is walked.
 *
 * The recommended set is the roots that name a framework, when that is a proper part of the roots (an entry without a
 * framework is a shared package or a fixture directory, never an app by default). When every root names one, or none
 * does, nothing separates them and there is no recommendation: the options are largest first by component directories
 * (owner decision D15), ties in scan order.
 */
import { scanProject } from "../project-scan.js";
import { NO_SCAN_RULINGS, scanRulingsOf } from "../project-scan-rulings.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import { setValuedOptions } from "./set-valued-options.js";

export interface AppRootsInput {
  /** In scan order (sorted by path). `componentDirs` is how many component directories the root owns. */
  apps: { path: string; framework: string | null; styling: string[]; componentDirs: number }[];
  /** True when the walk stopped at the entry cap: the counts then cover only the part that was walked. */
  truncated?: boolean;
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as AppRootsInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.apps)) return null;
  const by = new Map(input.apps.map((a) => [a.path, a]));
  const paths = input.apps.map((a) => a.path);
  const named = paths.filter((p) => by.get(p)?.framework != null);
  const recommended = named.length > 0 && named.length < paths.length ? named : [];
  const frameworkOf = (m: string): string => by.get(m)?.framework ?? "no framework";
  const dirsOf = (m: string): number => by.get(m)?.componentDirs ?? 0;
  return {
    kind: "app-roots",
    members: paths.length > 1 ? paths : [],
    domain: paths,
    ask(members) {
      const dirs = (group: readonly string[]): number => group.reduce((n, m) => n + dirsOf(m), 0);
      const list = members.map((m) => `${m} (${frameworkOf(m)}, ${dirsOf(m)} component dir(s))`).join(", ");
      return {
        question: `${members.length} nested app roots were found: ${list}. Which are this project's apps? The ones left out are not walked by ui scan.${input.truncated === true ? " The scan stopped at its entry cap, so these counts cover only the part that was walked; answer the scan-budget question to see the rest." : ""}`,
        options: setValuedOptions({
          members, recommended, weight: dirsOf,
          describe(group, role) {
            const rest = members.filter((m) => !group.includes(m));
            const label = role === "recommended" ? `Keep the ${group.length} app root(s) that name a framework` : role === "single" ? `Keep ${group[0] ?? ""}` : `Keep the other ${group.length} app roots`;
            return { label, consequence: `${group.length} app root(s) walked with ${dirs(group)} component dir(s); ${rest.length} left out with ${dirs(rest)} component dir(s) that leave the map` };
          },
        }),
        labels: Object.fromEntries(members.map((m) => [m, `${frameworkOf(m)}, ${dirsOf(m)} component dir(s)`])),
      };
    },
  };
}

/** Gathers the nested app roots of the walk, with the owner's skips honoured and no app root pruned (a pruned root could not be asked about). */
function sense(projectDir: string): AppRootsInput {
  const r = scanProject(projectDir, { ...NO_SCAN_RULINGS, skip: scanRulingsOf(projectDir).skip });
  return { truncated: r.truncated, apps: r.apps.map((a) => ({ path: a.path, framework: a.framework, styling: a.styling, componentDirs: a.componentDirs.length })) };
}

export const appRootsEmitter: KindEmitter = { kind: "app-roots", sense, detect };
