/**
 * The files of one app root that `ui ds surface` reads: the polyglot source walk (Spec 031 P1), narrowed the way the
 * scan walk is: a directory the scan skips as a class (`isSkippedDir`) is not read, a directory the owner left out
 * (`walkDecision`: a `scan-budget` skip or an `app-roots` drop) is not read, and a file that belongs to a nested app
 * root other than the one asked for is not read. What the walk met and did not read is returned with its reason.
 */
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { isSkippedDir } from "../project-scan.js";
import { walkDecision } from "../project-scan-rulings.js";
import type { ScanRulings } from "../project-scan-rulings.js";
import { walkUiSources } from "../polyglot-ui-walk.js";

export interface AppFiles {
  /** Project-relative POSIX path -> text, for every file read. */
  sources: Map<string, string>;
  /** Project-relative POSIX path of every `.css` file the same walk met (through the same filters); they are not read as sources. */
  css: string[];
  /** Files the walk met and did not read (a symlink, an oversized file, an unreadable directory), with the reason. */
  unread: { file: string; reason: string }[];
}

const under = (path: string, root: string): boolean => root === "" || path === root || path.startsWith(`${root}/`);

/** The deepest of `appRoots` that holds `path`, or "" (the scan root owns it). */
export function ownerRoot(path: string, appRoots: readonly string[]): string {
  let best = "";
  for (const a of appRoots) if (under(path, a) && a.length > best.length) best = a;
  return best;
}

export function readAppFiles(projectDir: string, appRoot: string, appRoots: readonly string[], rulings: ScanRulings): AppFiles {
  const walk = walkUiSources(join(projectDir, appRoot), { extraExtensions: [".css"] });
  const rel = (p: string): string => (appRoot === "" ? p : posix.join(appRoot, p));
  const out: AppFiles = { sources: new Map(), css: [], unread: walk.skipped.map((s) => ({ file: rel(s.path), reason: s.reason })) };
  walk.relative.forEach((relative, i) => {
    const file = rel(relative);
    const dirs = posix.dirname(file).split("/").filter((s) => s !== ".");
    if (dirs.some((d, k) => k >= appRoot.split("/").filter((s) => s !== "").length && isSkippedDir(d))) return;
    if (walkDecision(rulings, posix.dirname(file) === "." ? "" : posix.dirname(file)) !== "walk") return;
    if (ownerRoot(file, appRoots) !== appRoot) return;
    if (file.toLowerCase().endsWith(".css")) { out.css.push(file); return; }
    try { out.sources.set(file, readFileSync(walk.files[i] as string, "utf8")); }
    catch (e) { out.unread.push({ file, reason: `cannot read: ${e instanceof Error ? e.message : String(e)}` }); }
  });
  out.css.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  out.unread.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return out;
}
