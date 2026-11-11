/**
 * `component-name-collision` (FR-020): one component name is exported from more than one file. The question is
 * assigned (one outcome per member): a member is one name plus the sorted project-relative files that export it,
 * `<name>#<file>,<file>`, and its outcome names what is kept public by the file's path, `keep:<file>`. A reorder of
 * the tree changes neither a member nor an outcome; a renamed directory or a new file under a ruled name is a new
 * member and is asked again. There is no "exclude" outcome: no component leaves the output, the files that lose are
 * listed as shadowed.
 *
 * Collisions are grouped by the set of directories they run between, one question per group, because "directory X is
 * the public layer" only means something for names that collide between the same directories. An option is offered
 * for a directory that holds exactly one file of every member of the group, at most three, ordered by the number of
 * components the directory holds, largest first, ties by path (owner decision D15: the kind has no recommendation).
 * A group no directory fits (every directory holds two files of some name) cannot be asked as a question that keeps
 * one file per name; `unaskableCollisions` returns it so the command can say so instead of guessing.
 */
import { posix } from "node:path";
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { memberWithIds } from "./fingerprint.js";
import type { AskResult, KindDetection, KindEmitter } from "./kind-emitter.js";

export interface NameCollision { name: string; files: string[] }
export interface NameCollisionInput {
  collisions: NameCollision[];
  /** How many components each directory holds, for the order of the options (largest first). */
  dirSizes?: Record<string, number>;
}

/** Options name at most three directories; a fourth would not fit beside `review individually`. */
const MAX_DIRECTORY_OPTIONS = 3;
export const keepFileOutcome = (file: string): string => `keep:${file}`;

/** The file kept public under the outcome the owner gave, or null when the outcome does not name one. */
export function keptFile(outcome: string): string | null {
  return outcome.startsWith("keep:") ? outcome.slice("keep:".length) : null;
}

export const collisionMemberOf = (c: NameCollision): string => memberWithIds(c.name, c.files);

const dirOf = (file: string): string => posix.dirname(file);
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const filesIn = (c: NameCollision, dir: string): string[] => c.files.filter((f) => dirOf(f) === dir);

/** The directories a group runs between and the ones that hold exactly one file of every member. */
function directoriesOf(items: readonly NameCollision[], sizes: Record<string, number>): { all: string[]; fitting: string[] } {
  const all = [...new Set(items.flatMap((c) => c.files.map(dirOf)))].sort(byText);
  const fitting = all.filter((d) => items.every((c) => filesIn(c, d).length === 1))
    .sort((a, b) => (sizes[b] ?? 0) - (sizes[a] ?? 0) || byText(a, b));
  return { all, fitting };
}

function groups(input: NameCollisionInput): Map<string, NameCollision[]> {
  const out = new Map<string, NameCollision[]>();
  for (const c of input.collisions) {
    const key = JSON.stringify([...new Set(c.files.map(dirOf))].sort(byText));
    out.set(key, [...(out.get(key) ?? []), c]);
  }
  return out;
}

function groupAsk(items: readonly NameCollision[], sizes: Record<string, number>, members: readonly string[]): AskResult {
  const wanted = new Set(members);
  const asked = items.filter((c) => wanted.has(collisionMemberOf(c)));
  const { all, fitting } = directoriesOf(items, sizes);
  const losing = (dir: string): number => asked.reduce((n, c) => n + c.files.length - filesIn(c, dir).length, 0);
  const options: ClusterOption[] = fitting.slice(0, MAX_DIRECTORY_OPTIONS).map((dir) => ({
    id: `public-dir:${dir}`, label: `Directory ${dir} is the public layer`,
    consequence: `${asked.length} component name(s): the file in ${dir} is the public one and the ${losing(dir)} other file(s) are listed as shadowed; no component leaves the output`,
    assigns: Object.fromEntries(asked.map((c) => [collisionMemberOf(c), keepFileOutcome(filesIn(c, dir)[0] as string)])),
  }));
  options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} component name(s) with their files; you choose per name` });
  const memberChoices: Record<string, MemberChoice[]> = {};
  const labels: Record<string, string> = {};
  for (const c of asked) {
    const member = collisionMemberOf(c);
    memberChoices[member] = c.files.map((f) => ({ id: keepFileOutcome(f), label: `Keep ${f} public` }));
    labels[member] = `${c.name}: ${c.files.join(" or ")}`;
  }
  const extra = fitting.length > MAX_DIRECTORY_OPTIONS ? ` Only ${MAX_DIRECTORY_OPTIONS} of the ${fitting.length} directories fit as options: review individually to choose a file per name.` : "";
  return {
    question: `${asked.length} component name(s) are exported from more than one file, between ${all.join(" and ")}. Which file is the public one for each name?${extra}`,
    options, memberChoices, labels,
  };
}

/** One detection per set of directories that collide with each other, for the groups a question can be built for. */
export function collisionNameDetections(input: NameCollisionInput): KindDetection[] {
  const sizes = input.dirSizes ?? {};
  return [...groups(input).values()].filter((items) => directoriesOf(items, sizes).fitting.length > 0).map((items) => {
    const members = items.map(collisionMemberOf);
    return { kind: "component-name-collision" as const, members, domain: members, ask: (asked: readonly string[]) => groupAsk(items, sizes, asked) };
  });
}

/** The collisions no directory fits: a name exported twice from one directory in every directory the group runs between. */
export function unaskableCollisions(input: NameCollisionInput): NameCollision[] {
  return [...groups(input).values()].filter((items) => directoriesOf(items, input.dirSizes ?? {}).fitting.length === 0).flat();
}

export const componentNameCollisionEmitter: KindEmitter = {
  kind: "component-name-collision",
  detect(input) {
    return collisionNameDetections(input as NameCollisionInput)[0] ?? { kind: "component-name-collision", members: [], domain: [], ask: () => ({ question: "", options: [] }) };
  },
  detectAll: (input) => collisionNameDetections(input as NameCollisionInput),
};
