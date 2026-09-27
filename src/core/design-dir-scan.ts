/** Filesystem/git view of a project root for `ui design lint`. The rules never touch the disk. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ProjectView {
  /** Project-relative posix paths: tracked files plus untracked-but-not-ignored files. */
  files: string[];
  /** Tracked paths; null when the root is not the top level of its own git repository. */
  tracked: Set<string> | null;
  read(rel: string): string | null;
  mtimeMs(rel: string): number | null;
}

const WALK_SKIP = new Set([".git", "node_modules", "dist", ".next"]);
const WALK_CAP = 200_000;

function git(root: string, args: string[]): string[] | null {
  try {
    const out = execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\0").filter((p) => p !== "");
  } catch { return null; }
}

function walk(root: string): string[] {
  const out: string[] = [];
  const visit = (rel: string): void => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (out.length >= WALK_CAP) return;
      const next = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) { if (!WALK_SKIP.has(e.name)) visit(next); } else out.push(next);
    }
  };
  visit("");
  return out;
}

export function loadProjectView(root: string): ProjectView {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  const ownRepo = top !== null && realpathSync(top.join("\n").trim()) === realpathSync(root);
  const tracked = ownRepo ? git(root, ["ls-files", "-z", "--cached"]) : null;
  const listed = ownRepo ? git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]) : null;
  const files = [...new Set(listed ?? walk(root))].sort();
  return {
    files,
    tracked: tracked === null ? null : new Set(tracked),
    read: (rel) => { try { return readFileSync(join(root, rel), "utf8"); } catch { return null; } },
    mtimeMs: (rel) => { try { return statSync(join(root, rel)).mtimeMs; } catch { return null; } },
  };
}
