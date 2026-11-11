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
 * A name no directory fits (every directory holds two files of it) is asked on its own, per file (review fix round,
 * section E): a refusal that sends the owner to edit code is not an answer.
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
    // A name with two files in one directory cannot be kept by directory there, so it is grouped apart from the names that can.
    const dirs = c.files.map(dirOf);
    const key = JSON.stringify([[...new Set(dirs)].sort(byText), [...new Set(dirs.filter((d, i) => dirs.indexOf(d) !== i))].sort(byText)]);
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

/**
 * A name no directory can keep (it is exported twice from one directory in every directory the group runs between) is
 * still a question, one per name: the member is the name with its sorted files and the choices are `keep:<file>`, at
 * most three as options and every file as a choice of the per-name sheet. Which file is public is the owner's to say.
 */
function nameAsk(raw: NameCollision): AskResult {
  const c = { name: raw.name, files: [...raw.files].sort(byText) };
  const member = collisionMemberOf(c);
  const options: ClusterOption[] = c.files.slice(0, MAX_DIRECTORY_OPTIONS).map((file) => ({
    id: `public-file:${file}`, label: `${file} is the public file`,
    consequence: `the ${c.files.length - 1} other file(s) of ${c.name} are listed as shadowed; no component leaves the output`,
    assigns: { [member]: keepFileOutcome(file) },
  }));
  options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${c.files.length} files of ${c.name}; you choose one` });
  const extra = c.files.length > MAX_DIRECTORY_OPTIONS ? ` Only ${MAX_DIRECTORY_OPTIONS} of the ${c.files.length} files fit as options: review individually to choose another.` : "";
  return {
    question: `${c.name} is exported from ${c.files.length} files of one directory (${c.files.join(", ")}). Which file is the public one?${extra}`,
    options, memberChoices: { [member]: c.files.map((f) => ({ id: keepFileOutcome(f), label: `Keep ${f} public` })) }, labels: { [member]: `${c.name}: ${c.files.join(" or ")}` },
  };
}

/** One detection per set of directories that collide with each other, and one per name no directory can keep. */
export function collisionNameDetections(input: NameCollisionInput): KindDetection[] {
  const sizes = input.dirSizes ?? {};
  return [...groups(input).values()].flatMap((items) => {
    if (directoriesOf(items, sizes).fitting.length === 0) {
      return items.map((c) => ({ kind: "component-name-collision" as const, members: [collisionMemberOf(c)], domain: [collisionMemberOf(c)], ask: () => nameAsk(c) }));
    }
    const members = items.map(collisionMemberOf);
    return [{ kind: "component-name-collision" as const, members, domain: members, ask: (asked: readonly string[]) => groupAsk(items, sizes, asked) }];
  });
}

export const componentNameCollisionEmitter: KindEmitter = {
  kind: "component-name-collision",
  detect(input) {
    return collisionNameDetections(input as NameCollisionInput)[0] ?? { kind: "component-name-collision", members: [], domain: [], ask: () => ({ question: "", options: [] }) };
  },
  detectAll: (input) => collisionNameDetections(input as NameCollisionInput),
};
