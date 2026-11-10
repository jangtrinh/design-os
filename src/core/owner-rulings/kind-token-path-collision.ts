/**
 * `token-path-collision` (FR-008): two variables inside the collections the owner kept map to one token path. The
 * member is the token path. Collisions are grouped by the set of collections they run between, one question per group,
 * because "keep the one from collection X" only means something for paths that run between the same collections.
 * `collisionDetections` is the ingest's entry point; the registry's `detect` returns the first group.
 */
import type { ClusterOption } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface CollisionInput {
  /** Every colliding path with the variables on it, in scan order. */
  collisions: { path: string; variables: { id: string; collection: string }[] }[];
}

/** Options name at most three collections; a fourth would not fit beside `review individually`. */
const MAX_COLLECTION_OPTIONS = 3;

const groupKey = (collections: readonly string[]): string => JSON.stringify(collections);

/** The id of the variable that keeps a colliding path under the option the owner chose; "" keeps none. */
export function collisionWinner(variables: { id: string; collection: string }[], outcome: string): string {
  if (outcome.startsWith("keep-from:")) return variables.find((v) => v.collection === outcome.slice("keep-from:".length))?.id ?? "";
  if (outcome === "keep-first") return variables[0]?.id ?? "";
  return "";
}

function optionsFor(collections: readonly string[], paths: number): ClusterOption[] {
  const review: ClusterOption = { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${paths} token path(s); you choose per path` };
  if (collections.length === 1) {
    return [
      { id: "keep-first", label: "Keep the first variable of each path", consequence: `${paths} path(s): the first variable in the scan stays, the others are excluded and counted` },
      { id: "keep-none", label: "Exclude all of them", consequence: `${paths} path(s) left out, every variable counted and named` },
      review,
    ];
  }
  const named = collections.slice(0, MAX_COLLECTION_OPTIONS).map((c): ClusterOption => ({
    id: `keep-from:${c}`, label: `Keep the one from ${c}`, consequence: `${paths} path(s): the variable from ${c} stays, the others are excluded and counted`,
  }));
  return [...named, review];
}

/** One detection per set of collections that collide with each other. */
export function collisionDetections(input: CollisionInput): KindDetection[] {
  const groups = new Map<string, { collections: string[]; paths: string[] }>();
  for (const c of input.collisions) {
    const collections = [...new Set(c.variables.map((v) => v.collection))].sort();
    const g = groups.get(groupKey(collections)) ?? { collections, paths: [] };
    g.paths.push(c.path);
    groups.set(groupKey(collections), g);
  }
  return [...groups.values()].map((g) => ({
    kind: "token-path-collision" as const,
    members: g.paths,
    domain: g.paths,
    ask(members: readonly string[]) {
      const where = g.collections.length === 1 ? `inside ${g.collections[0]}` : `between ${g.collections.join(" and ")}`;
      const extra = g.collections.length > MAX_COLLECTION_OPTIONS ? ` Only ${MAX_COLLECTION_OPTIONS} of the ${g.collections.length} collections fit as options: narrow the collections you keep, or review individually.` : "";
      return {
        question: `${members.length} token path(s) ${where} map to more than one variable. Which variable keeps each path?${extra}`,
        options: optionsFor(g.collections, members.length),
      };
    },
  }));
}

export const tokenPathCollisionEmitter: KindEmitter = {
  kind: "token-path-collision",
  detect(input) {
    const first = collisionDetections(input as CollisionInput)[0];
    return first ?? { kind: "token-path-collision", members: [], domain: [], ask: () => ({ question: "", options: [] }) };
  },
};
