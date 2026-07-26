// scripts/lib/git.mjs
//
// Local-only git helpers. Every call reads local objects/refs (ls-tree, cat-file,
// log, status, merge-base) — never the network — per Article I determinism and D12.
import { execFileSync } from "node:child_process";

const MAX_BUFFER = 1024 * 1024 * 64;

export function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER }).trim();
}

export function gitBuffer(args, cwd) {
  return execFileSync("git", args, { cwd, maxBuffer: MAX_BUFFER });
}

// Deterministic enumeration of every SKILL.md at a pinned commit OBJECT — never the
// working tree — so local edits cannot change the enumerated set (architecture §C).
export function lsTreeSkillPaths(corpus, commit) {
  const out = git(["-C", corpus, "ls-tree", "-r", "--name-only", commit], corpus);
  return out
    .split("\n")
    .filter((line) => /^agent-skills\/[^/]+\/[^/]+\/SKILL\.md$/.test(line))
    .sort(); // default JS string sort == UTF-16 code-unit order == byte order for
    // these ASCII paths, i.e. equivalent to `sort` under LC_ALL=C.
}

export function catFileBlob(corpus, commit, path) {
  return gitBuffer(["-C", corpus, "cat-file", "blob", `${commit}:${path}`], corpus);
}
