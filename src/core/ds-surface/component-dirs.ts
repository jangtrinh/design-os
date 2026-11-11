/**
 * The component directories of one app, taken from the files the surface itself walked (review fix round, section B).
 * The project scan stops at 4000 entries for the whole project, so a directory list taken from it silently shrinks when
 * another part of the project spends the budget. The surface's walk of the chosen app has no entry cap, so the
 * directories come from it, through the one rule the scan applies (`isComponentDir`).
 */
import { posix } from "node:path";
import { isCodeFileName, isComponentDir, isTestDirName } from "../project-scan.js";

/** Project-relative component directories of the given project-relative files, sorted. */
export function componentDirsOf(files: Iterable<string>): string[] {
  const direct = new Map<string, number>();
  for (const file of files) {
    if (!isCodeFileName(posix.basename(file))) continue;
    const dir = posix.dirname(file);
    direct.set(dir, (direct.get(dir) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const [dir, count] of direct) {
    const names = dir === "." ? [] : dir.split("/");
    const ancestors = names.slice(0, -1);
    const own = names[names.length - 1] ?? "";
    // A test tree is the directory itself or any directory above it, as in the scan walk.
    const inTestTree = names.some(isTestDirName);
    const hasComponentsAncestor = ancestors.some((n) => n.toLowerCase() === "components");
    if (isComponentDir(own, count, hasComponentsAncestor, inTestTree)) out.push(dir);
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
