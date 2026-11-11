/**
 * `figma-collections` (FR-008): two of a file's variable collections collide on a token path. The question is a
 * multi-select over every collection: which ones stay. Pure over plain data; the ingest builds the input.
 *
 * The recommendation is computed on the alias graph, never matched on names: a collection is in conflict when it
 * collides with another; the recommended set is every collection not in conflict plus each conflicting collection that
 * an alias connects to one that is not. When that set is empty or still holds a colliding pair, there is no
 * recommendation. The options are largest first, ties in the order of the file's collections (owner decision D15).
 */
import type { Cluster } from "./cluster.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import { setValuedOptions } from "./set-valued-options.js";

export interface CollectionsInput {
  /** In the order the scan lists them; `count` is the number of variables. */
  collections: { name: string; count: number }[];
  /** Pairs of collections that map variables to one token path, with the number of such paths. */
  collisions: { a: string; b: string; paths: number }[];
  /** Variables of `from` that alias a variable of `to` (any mode), counted. */
  aliases: { from: string; to: string; count: number }[];
}

export function recommendedCollections(input: CollectionsInput): string[] {
  const conflicting = new Set(input.collisions.flatMap((c) => [c.a, c.b]));
  const names = input.collections.map((c) => c.name);
  const base = names.filter((n) => !conflicting.has(n));
  const baseSet = new Set(base);
  const connected = names.filter((n) => conflicting.has(n) && input.aliases.some((a) => (a.from === n && baseSet.has(a.to)) || (a.to === n && baseSet.has(a.from))));
  const recommended = new Set([...base, ...connected]);
  const stillCollides = input.collisions.some((c) => recommended.has(c.a) && recommended.has(c.b));
  return recommended.size === 0 || stillCollides ? [] : [...recommended];
}

/** Aliases of the chosen collections that point into a collection outside the choice. */
function broken(aliases: CollectionsInput["aliases"], kept: ReadonlySet<string>): number {
  return aliases.filter((a) => kept.has(a.from) && !kept.has(a.to)).reduce((n, a) => n + a.count, 0);
}

const show = (name: string): string => (name === "" ? "(no collection)" : name);

function detect(raw: unknown): KindDetection | null {
  const input = raw as CollectionsInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.collections)) return null;
  const names = input.collections.map((c) => c.name);
  const count = new Map(input.collections.map((c) => [c.name, c.count]));
  const recommended = recommendedCollections(input);
  const conflicting = new Set(input.collisions.flatMap((c) => [c.a, c.b]));
  return {
    kind: "figma-collections",
    members: input.collisions.length > 0 ? names : [],
    domain: names,
    ask(members) {
      const asked = new Set(members);
      const pairs = input.collisions.filter((c) => asked.has(c.a) || asked.has(c.b)).map((c) => `${show(c.a)} × ${show(c.b)}: ${c.paths} token paths`);
      const list = members.map((m) => `${show(m)} (${count.get(m) ?? 0} variables)`).join(", ");
      const question = `Which variable collections stay? ${list}.${pairs.length > 0 ? ` Collisions: ${pairs.join("; ")}.` : ""} Variables of a collection left out are excluded, counted and named.`;
      const options = setValuedOptions({
        members,
        recommended,
        weight: (m) => count.get(m) ?? 0,
        describe(group, role) {
          const total = group.reduce((n, m) => n + (count.get(m) ?? 0), 0);
          const aliasNote = `chosen alone, it leaves ${broken(input.aliases, new Set(group))} alias(es) pointing into a collection it does not keep`;
          const colliding = group.filter((n) => conflicting.has(n));
          const recommendedLabel = colliding.length === 0
            ? `Keep the ${group.length} collection(s) that do not collide`
            : `Keep ${group.map(show).join(", ")} (${colliding.map(show).join(", ")} collide but are linked by aliases to a collection that does not)`;
          const what = role === "recommended" ? recommendedLabel : role === "single" ? `Keep ${show(group[0] ?? "")}` : `Keep the other ${group.length} (${total} variables)`;
          return { label: what, consequence: `${total} variables kept; ${aliasNote}` };
        },
      });
      return { question, options, evidence: { aliases: input.aliases }, labels: Object.fromEntries(members.map((m) => [m, show(m)])) };
    },
  };
}

/** The refusal message when the outcomes keep a collection whose aliases point into one that is left out. */
function checkAnswer(cluster: Cluster, outcomes: Record<string, string>): string | null {
  const ev = cluster.evidence as { aliases?: CollectionsInput["aliases"] } | undefined;
  const edges = (ev?.aliases ?? []).filter((a) => outcomes[a.from] === "keep" && outcomes[a.to] === "drop");
  if (edges.length === 0) return null;
  const total = edges.reduce((n, e) => n + e.count, 0);
  const shown = edges.slice(0, 3).map((e) => `${e.from} → ${e.to} (${e.count})`).join(", ");
  return `this selection would leave ${total} alias(es) of kept variables pointing into collections that are left out: ${shown}. Keep those collections too, or leave out the ones that alias them.`;
}

export const figmaCollectionsEmitter: KindEmitter = { kind: "figma-collections", detect, checkAnswer };
