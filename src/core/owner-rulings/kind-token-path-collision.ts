/**
 * `token-path-collision` (FR-008): two variables inside the collections the owner kept map to one token path. The
 * question is assigned (one outcome per member): a member is one collision, `<path>#<id>,<id>` (the path plus the
 * sorted ids of the variables on it), and its outcome names what is kept, `keep:<variableId>` or `keep-none`. A
 * rename of a collection or a reorder of the scan changes neither a member nor an outcome; a change in who collides is
 * a new member and is asked. Collisions are grouped by the set of collections they run between, one question per
 * group, because "keep the one from collection X" only means something for paths that run between the same
 * collections. `collisionDetections` is the ingest's entry point; the registry's `detect` returns the first group.
 */
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { AskResult, KindDetection, KindEmitter } from "./kind-emitter.js";

export interface CollisionVariable {
  id: string;
  name: string;
  collection: string;
  value?: string;
  /** Set when this variable aliases another variable of the same collision: it has no value of its own on the path. */
  aliasOf?: { id: string; name: string; collection: string };
}

export interface CollisionInput {
  /** Every colliding path with the variables on it, in scan order. */
  collisions: { path: string; variables: CollisionVariable[] }[];
  /** Per variable id, the ids of the variables that alias it (any mode). Absent means "not counted". */
  aliasedBy?: Record<string, string[]>;
}

/** Options name at most three collections; a fourth would not fit beside `review individually`. */
const MAX_COLLECTION_OPTIONS = 3;
export const KEEP_NONE_OUTCOME = "keep-none";

export const keepOutcome = (variableId: string): string => `keep:${variableId}`;

/** The id of the variable that keeps a colliding path under the outcome the owner gave; "" keeps none. */
export function collisionWinner(outcome: string): string {
  return outcome.startsWith("keep:") ? outcome.slice("keep:".length) : "";
}

interface Collision { member: string; path: string; variables: CollisionVariable[] }

/** The member id of one collision: the path plus the sorted ids of the variables on it. */
export const collisionMember = (path: string, variables: readonly { id: string }[]): string => `${path}#${variables.map((v) => v.id).sort().join(",")}`;
const memberOf = collisionMember;
const collectionText = (c: string): string => (c === "" ? "(no collection)" : c);
const describe = (v: CollisionVariable): string => v.aliasOf !== undefined
  ? `${v.name} (${collectionText(v.collection)}) aliases ${v.aliasOf.name} (${collectionText(v.aliasOf.collection)}) on the same path`
  : `${v.name} (${collectionText(v.collection)}${v.value === undefined || v.value === "" ? "" : ` = ${v.value}`})`;

function groupAsk(collections: readonly string[], all: ReadonlyMap<string, Collision>, aliasedBy: Record<string, string[]>, members: readonly string[]): AskResult {
  const asked = members.map((m) => all.get(m)).filter((c): c is Collision => c !== undefined);
  // Aliases that point at a variable which would lose, counted only when their own source is still written under the
  // option: a source that loses in this question leaves with its path, so it is never asked as a dangling alias.
  const lost = (keep: (c: Collision) => string): number => {
    const losers = new Set(asked.flatMap((c) => c.variables.filter((v) => v.id !== keep(c)).map((v) => v.id)));
    return [...losers].reduce((n, id) => n + (aliasedBy[id] ?? []).filter((source) => !losers.has(source)).length, 0);
  };
  const aliasNote = (n: number): string => `${n} alias(es) point at variables that would lose${n > 0 ? "; each is then asked as a dangling alias" : ""}`;

  const options: ClusterOption[] = [];
  // A collection is offered only when the variable it picks has a value of its own on every path of the group.
  const qualifying = collections.filter((col) => asked.every((c) => {
    const there = c.variables.filter((v) => v.collection === col);
    return there.length === 1 && there[0]?.aliasOf === undefined;
  }));
  for (const col of qualifying.slice(0, MAX_COLLECTION_OPTIONS)) {
    const pick = (c: Collision): string => (c.variables.find((v) => v.collection === col) as CollisionVariable).id;
    options.push({
      id: `keep-from:${col}`, label: `Keep the one from ${collectionText(col)}`,
      consequence: `${asked.length} path(s): the variable from ${collectionText(col)} stays, the others are excluded and counted; ${aliasNote(lost(pick))}`,
      assigns: Object.fromEntries(asked.map((c) => [c.member, keepOutcome(pick(c))])),
    });
  }
  if (options.length + 1 < 4) {
    options.push({
      id: KEEP_NONE_OUTCOME, label: "Exclude all of them",
      consequence: `${asked.length} path(s) left out, every variable counted and named; ${aliasNote(lost(() => ""))}`,
      assigns: Object.fromEntries(asked.map((c) => [c.member, KEEP_NONE_OUTCOME])),
    });
  }
  options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} token path(s) with their variables; you choose per path` });

  const where = collections.length === 1 ? `inside ${collectionText(collections[0] as string)}` : `between ${collections.map(collectionText).join(" and ")}`;
  const extra = collections.length > MAX_COLLECTION_OPTIONS ? ` Only ${MAX_COLLECTION_OPTIONS} of the ${collections.length} collections fit as options: narrow the collections you keep, or review individually.` : "";
  const memberChoices: Record<string, MemberChoice[]> = {};
  const labels: Record<string, string> = {};
  for (const c of asked) {
    memberChoices[c.member] = [...c.variables.filter((v) => v.aliasOf === undefined).map((v) => ({ id: keepOutcome(v.id), label: `Keep ${describe(v)}` })), { id: KEEP_NONE_OUTCOME, label: "Exclude all of them" }];
    labels[c.member] = `${c.path}: ${c.variables.map(describe).join(" or ")}`;
  }
  return {
    question: `${asked.length} token path(s) ${where} map to more than one variable. Which variable keeps each path?${extra}`,
    options, memberChoices, labels,
  };
}

/** One detection per set of collections that collide with each other. */
export function collisionDetections(input: CollisionInput): KindDetection[] {
  const aliasedBy = input.aliasedBy ?? {};
  const groups = new Map<string, { collections: string[]; items: Collision[] }>();
  for (const c of input.collisions) {
    const collections = [...new Set(c.variables.map((v) => v.collection))];
    const key = JSON.stringify([...collections].sort());
    const g = groups.get(key) ?? { collections: [], items: [] };
    for (const col of collections) if (!g.collections.includes(col)) g.collections.push(col);
    g.items.push({ member: memberOf(c.path, c.variables), path: c.path, variables: c.variables });
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const all = new Map(g.items.map((i) => [i.member, i]));
    const members = g.items.map((i) => i.member);
    return { kind: "token-path-collision" as const, members, domain: members, ask: (asked: readonly string[]) => groupAsk(g.collections, all, aliasedBy, asked) };
  });
}

export const tokenPathCollisionEmitter: KindEmitter = {
  kind: "token-path-collision",
  detect(input) {
    const first = collisionDetections(input as CollisionInput)[0];
    return first ?? { kind: "token-path-collision", members: [], domain: [], ask: () => ({ question: "", options: [] }) };
  },
  detectAll: (input) => collisionDetections(input as CollisionInput),
};
