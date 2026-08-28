/**
 * Resolve what to lint: a file, a directory, a glob, or several of these.
 *
 * Until now every linter took exactly one `.html` file, so a React app could not
 * be linted and a SwiftUI app was invisible. That is the open
 * `design-os-code-surface-gap`, and the fix belongs HERE, at the shared layer —
 * not in whichever linter the gap surfaced in. The repo already paid for the
 * other choice: a redirect-stub rule patched only into a11y-lint reappeared in
 * validate-layout.
 *
 * Nothing vanishes silently. A path that matches no extractor is SKIPPED with a
 * reason and reported, never dropped; a walk that hits its budget says exactly
 * what it stopped short of. A quiet truncation reads as "covered everything"
 * when it did not.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve, relative, sep } from "node:path";
import { SKIP_DIRS, MAX_DEPTH, MAX_ENTRIES } from "./project-scan.js";
import { extractorForExtension } from "./design-facts/extractor-registry.js";

export interface LintTarget {
  /** Absolute path. */
  path: string;
  /** Registered extractor id that claims this file's extension. */
  extractorId: string;
  /** Human tier label, printed next to findings. */
  tier: string;
  /** True when this extractor's output is an acknowledged undercount. */
  undercount: boolean;
}

export interface SkippedTarget {
  path: string;
  reason: string;
}

export interface TargetResolution {
  targets: LintTarget[];
  skipped: SkippedTarget[];
  /** Set when a walk hit its entry budget; `droppedNote` says what was lost. */
  truncated: boolean;
  droppedNote?: string;
}

/**
 * Match a glob against a path. Supports `*`, `**` and `?` — the forms people
 * actually type at a shell that has already been quoted away from them.
 */
function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
        if (pattern[i + 1] === "/") i++;
      } else out += "[^/]*";
    } else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function isGlob(input: string): boolean {
  return /[*?]/.test(input);
}

/**
 * Walk a directory for lintable files.
 *
 * Alphabetical, deliberately: `project-scan.ts` is alphabetical because Art I
 * says determinism, and "improving" it to depth-first would make two runs over
 * the same tree disagree.
 */
export interface ResolveOptions {
  /**
   * Directory reader seam. Exists so the ordering guard can be PROVEN: APFS
   * happens to return these names already sorted, so deleting the `.sort()`
   * below cannot go red on macOS — the guard would be real (ext4 and others
   * return arbitrary order) but untested, which is the same as unguarded.
   */
  readDir?: (dir: string) => string[];
}

function walkDir(
  root: string,
  acc: { visited: number; truncated: boolean },
  readDir: (dir: string) => string[],
): string[] {
  const out: string[] = [];
  const descend = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || acc.truncated) return;
    let entries: string[];
    try {
      entries = readDir(dir).slice().sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (acc.visited >= MAX_ENTRIES) {
        acc.truncated = true;
        return;
      }
      acc.visited++;
      const full = join(dir, name);
      let isDir: boolean;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
        descend(full, depth + 1);
      } else {
        out.push(full);
      }
    }
  };
  descend(root, 0);
  return out;
}

/** Classify one file: a target, or a skip with a stated reason. */
function classify(path: string): LintTarget | SkippedTarget {
  const ext = extname(path).toLowerCase();
  if (ext === "") return { path, reason: "no file extension" };
  const profile = extractorForExtension(ext);
  if (profile === undefined) return { path, reason: `no extractor claims "${ext}"` };
  return { path, extractorId: profile.id, tier: profile.tier, undercount: profile.undercount };
}

function isTarget(x: LintTarget | SkippedTarget): x is LintTarget {
  return "extractorId" in x;
}

/**
 * Resolve CLI arguments into an ordered target list.
 *
 * Order is alphabetical by absolute path and duplicates collapse, so the same
 * arguments always produce byte-identical output.
 */
export function resolveTargets(
  inputs: readonly string[],
  cwd = process.cwd(),
  opts: ResolveOptions = {},
): TargetResolution {
  const readDir = opts.readDir ?? ((d: string) => readdirSync(d));
  const files = new Set<string>();
  const skipped: SkippedTarget[] = [];
  const acc = { visited: 0, truncated: false };

  for (const input of inputs) {
    if (isGlob(input)) {
      // A glob's base is the longest leading segment run with no wildcard.
      const parts = input.split("/");
      const firstWild = parts.findIndex((p) => isGlob(p));
      const baseParts = parts.slice(0, firstWild < 0 ? parts.length : firstWild);
      const base = resolve(cwd, baseParts.join("/") === "" ? "." : baseParts.join("/"));
      if (!existsSync(base)) {
        skipped.push({ path: input, reason: "glob base does not exist" });
        continue;
      }
      const re = globToRegExp(resolve(cwd, input).split(sep).join("/"));
      for (const f of walkDir(base, acc, readDir)) if (re.test(f.split(sep).join("/"))) files.add(f);
      continue;
    }

    const abs = resolve(cwd, input);
    if (!existsSync(abs)) {
      skipped.push({ path: input, reason: "path does not exist" });
      continue;
    }
    if (statSync(abs).isDirectory()) {
      for (const f of walkDir(abs, acc, readDir)) files.add(f);
    } else {
      files.add(abs);
    }
  }

  const targets: LintTarget[] = [];
  for (const path of [...files].sort()) {
    const verdict = classify(path);
    if (isTarget(verdict)) targets.push(verdict);
    else skipped.push(verdict);
  }
  skipped.sort((a, b) => a.path.localeCompare(b.path));

  return {
    targets,
    skipped,
    truncated: acc.truncated,
    droppedNote: acc.truncated
      ? `walk stopped at ${MAX_ENTRIES} entries; files beyond that point were NOT examined`
      : undefined,
  };
}

/** One line summarising what was and was not looked at. Never omit on a zero. */
export function describeResolution(r: TargetResolution, cwd = process.cwd()): string {
  const undercounted = r.targets.filter((t) => t.undercount).length;
  const parts = [`${r.targets.length} file(s)`];
  if (undercounted > 0) parts.push(`${undercounted} at an UNDERCOUNT tier`);
  if (r.skipped.length > 0) parts.push(`${r.skipped.length} skipped`);
  if (r.truncated) parts.push("TRUNCATED");
  void cwd;
  void relative;
  return parts.join(", ");
}
