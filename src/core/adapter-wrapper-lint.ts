/**
 * Wrapper-integrity half of the `ui doctor --cwd` adapter lint (see adapter-lint.ts
 * for the template-drift half + the shared entry point).
 *
 * Lints each generated per-runtime wrapper the manifest recorded: it must exist,
 * carry YAML frontmatter, point at a template that still resolves on disk, mark
 * every Antigravity bash block with `// turbo`, and (Codex) hold exactly one
 * ease-design sentinel pair.
 *
 * Pure except fs reads (existsSync/readFileSync). No writes, no network.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END } from "../adapters/wrapper-shapes.js";
import type { AdapterLintCheck, ReadManifest } from "./adapter-lint.js";

const TEMPLATE_REF_RE = /`([^`]+\.md)`/g;
const BASH_FENCE_RE = /^```bash\s*$/;
const TURBO_RE = /^\/\/\s*turbo\s*$/;

function fwd(p: string): string {
  return p.replace(/\\/g, "/");
}

/** True for the synthetic init wrapper, which points at no template file. */
function isInitWrapper(rel: string): boolean {
  const base = fwd(rel).split("/").pop() ?? "";
  return base === "init.md" || base === "ui-init.md";
}

/** True for generated routing-rule wrappers (.claude/rules and .agent/rules). */
function isRoutingRuleWrapper(rel: string): boolean {
  const relFwd = fwd(rel);
  return (
    relFwd === ".claude/rules/design-os-routing.md" ||
    relFwd === ".agent/rules/design-os-routing.md" ||
    relFwd.endsWith("/.claude/rules/design-os-routing.md") ||
    relFwd.endsWith("/.agent/rules/design-os-routing.md")
  );
}

/** Parse frontmatter strictly, rejecting duplicate keys, malformed lines, or paths scoping. */
function parseRuleFrontmatter(frontmatter: string): { ok: true; keys: Map<string, string> } | { ok: false; reason: string } {
  const keys = new Map<string, string>();
  const lines = frontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (raw !== trimmed) return { ok: false, reason: "indented generated frontmatter key" };

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      return { ok: false, reason: `malformed YAML frontmatter: '${trimmed}'` };
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();

    if (keys.has(key)) {
      return { ok: false, reason: `duplicate key '${key}' in frontmatter` };
    }
    if (key === "paths") {
      return { ok: false, reason: "paths scope in frontmatter would make rule conditional" };
    }
    if (key !== "trigger" && key !== "description") {
      return { ok: false, reason: `unsupported generated frontmatter key '${key}'` };
    }
    if (key === "description") {
      try {
        const description: unknown = JSON.parse(val);
        if (typeof description !== "string" || description.trim() === "") throw new Error("description must be a nonempty string");
      } catch {
        return { ok: false, reason: "description must be a valid quoted generated string" };
      }
    }
    keys.set(key, val);
  }
  if (!keys.has("description")) return { ok: false, reason: "missing generated description" };
  return { ok: true, keys };
}

/** Lint one wrapper file; returns a problem string or null when clean. */
function lintWrapper(cwd: string, rel: string): string | null {
  const relFwd = fwd(rel);
  const abs = join(cwd, rel);
  if (!existsSync(abs)) return `${relFwd} is missing (re-run 'ui init --force')`;

  const content = readFileSync(abs, "utf8");
  const isCodex = relFwd.endsWith("AGENTS.md");

  if (isCodex) {
    const begins = content.split(CODEX_SENTINEL_BEGIN).length - 1;
    const ends = content.split(CODEX_SENTINEL_END).length - 1;
    if (begins !== 1 || ends !== 1) {
      return `${relFwd} has ${begins} begin / ${ends} end ease-design sentinels (expected exactly 1 pair)`;
    }
    return null;
  }

  // Claude / Antigravity workflow + skill wrappers all carry YAML frontmatter.
  if (!content.startsWith("---")) return `${relFwd} is missing YAML frontmatter`;

  // Routing-rule wrapper validation (Claude and Antigravity)
  if (isRoutingRuleWrapper(relFwd)) {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!fmMatch) return `${relFwd} is missing YAML frontmatter`;
    const frontmatter = fmMatch[1] ?? "";

    const fmParsed = parseRuleFrontmatter(frontmatter);
    if (!fmParsed.ok) {
      return `${relFwd} frontmatter invalid: ${fmParsed.reason}`;
    }

    const trigger = fmParsed.keys.get("trigger");
    if (trigger !== "always_on") {
      return `${relFwd} is missing required 'trigger: always_on' frontmatter`;
    }

    const allBacktickRefs = [...content.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] as string);

    const required = [
      ["need-routing.md", "file"], ["build-loop.md", "file"],
      ["workflows", "directory"], ["skills", "directory"], ["journeys", "directory"],
    ] as const;
    for (const [name, kind] of required) {
      const ref = allBacktickRefs.find((r) => fwd(r).endsWith(`/${name}`) || fwd(r) === name);
      if (!ref) return `${relFwd} is missing required reference to ${name}`;
      if (!existsSync(ref) || (kind === "file" ? !statSync(ref).isFile() : !statSync(ref).isDirectory())) {
        return `${relFwd} points at a path that does not exist: ${ref}`;
      }
    }

    // 6. Check any other absolute / template / knowledge path references
    const otherPathRefs = allBacktickRefs.filter(
      (p) => p.startsWith("/") && (fwd(p).includes("/templates/") || fwd(p).includes("/knowledge/")),
    );
    for (const p of otherPathRefs) {
      if (!existsSync(p)) {
        return `${relFwd} points at a path that does not exist: ${p}`;
      }
    }
  }

  // Non-init, non-rule wrappers must point at a template that still resolves on disk.
  if (!isInitWrapper(relFwd) && !isRoutingRuleWrapper(relFwd)) {
    const refs = [...content.matchAll(TEMPLATE_REF_RE)]
      .map((m) => m[1] as string)
      .filter((p) => fwd(p).includes("/templates/"));
    if (refs.length === 0) return `${relFwd} does not reference its runtime-neutral template`;
    const missing = refs.filter((p) => !existsSync(p));
    if (missing.length > 0) return `${relFwd} points at a template that no longer exists: ${missing.join(", ")}`;
  }

  // Antigravity workflow / rule wrappers auto-run shell — every bash fence needs `// turbo`.
  if (relFwd.includes("/.agent/workflows/") || relFwd.includes("/workflows/ui-") || relFwd.includes("/.agent/rules/")) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (BASH_FENCE_RE.test(lines[i] ?? "")) {
        let j = i - 1;
        while (j >= 0 && (lines[j] ?? "").trim() === "") j--;
        if (j < 0 || !TURBO_RE.test((lines[j] ?? "").trim())) {
          return `${relFwd} has a bash block at line ${i + 1} without a preceding '// turbo' marker`;
        }
      }
    }
  }

  return null;
}

/** Lint every wrapper file the manifest recorded for this project. */
export function checkWrappers(cwd: string, manifest: ReadManifest): AdapterLintCheck {
  const adapters = manifest.adapters;
  if (!Array.isArray(adapters) || adapters.length === 0) {
    return {
      id: "adapter-wrappers",
      status: "warn",
      detail: "manifest lists no adapter files — run 'ui init --force' to (re)generate the wrapper tree",
    };
  }
  const problems: string[] = [];
  for (const rel of adapters) {
    if (typeof rel !== "string") continue;
    const problem = lintWrapper(cwd, rel);
    if (problem !== null) problems.push(problem);
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 5);
    const extra = problems.length > shown.length ? ` (+${problems.length - shown.length} more)` : "";
    return { id: "adapter-wrappers", status: "fail", detail: shown.join("; ") + extra };
  }
  return { id: "adapter-wrappers", status: "pass", detail: `${adapters.length} wrapper file(s) well-formed` };
}
