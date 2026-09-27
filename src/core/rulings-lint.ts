/**
 * Rulings lint: schema validation plus the cross-reference checks a schema cannot
 * express (dead source anchors, unmarked supersessions, dangling ids).
 * Fs-free — the caller supplies `pathExists`, so the rules stay deterministic.
 */
import { validateRulingsFile } from "./rulings-validate.js";
import type { RulingsFinding } from "./rulings-validate.js";

export interface RulingsLintInput {
  doc: unknown;
  /** True when a repo-relative path exists under the lint root. */
  pathExists: (relPath: string) => boolean;
}

/**
 * A source entry "looks like a repo path" when it is a single token of path
 * characters with a file extension (an optional #anchor is stripped). Prose such
 * as "legacy memory (lost 2026-09 move): x.md", URLs and `figma:<id>` refs are not.
 */
export function repoPathOf(source: string): string | null {
  const bare = source.split("#")[0] ?? "";
  if (!/^[\w.@/-]+\.[A-Za-z0-9]{1,8}$/.test(bare)) return null;
  if (bare.startsWith("/") || bare.split("/").includes("..")) return null;
  return bare;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export function lintRulings(input: RulingsLintInput): RulingsFinding[] {
  const findings = validateRulingsFile(input.doc);
  if (!isRecord(input.doc) || !Array.isArray(input.doc["rulings"])) return findings;
  const rulings = input.doc["rulings"].filter(isRecord);
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const r of rulings) {
    const id = r["id"];
    if (typeof id !== "string") continue;
    if (seen.has(id)) findings.push({ checkId: "duplicate-id", severity: "error", message: `${id}: id appears more than once`, id });
    seen.add(id); ids.add(id);
  }
  for (const r of rulings) {
    const id = typeof r["id"] === "string" ? r["id"] : undefined;
    if (id === undefined) continue;
    for (const src of Array.isArray(r["source"]) ? r["source"] : []) {
      const rel = typeof src === "string" ? repoPathOf(src) : null;
      if (rel !== null && !input.pathExists(rel)) {
        findings.push({ checkId: "dead-source-anchor", severity: "error", message: `${id}: source '${src}' points to a missing path '${rel}'`, id });
      }
    }
    const text = typeof r["text"] === "string" ? r["text"] : "";
    if (/\bSUPERSEDED\b/.test(text) && r["superseded_by"] === undefined) {
      findings.push({ checkId: "unmarked-supersession", severity: "warning", message: `${id}: text mentions SUPERSEDED but the ruling has no 'superseded_by' field`, id });
    }
    const links: [string, unknown][] = [["superseded_by", r["superseded_by"]], ["supersedes", r["supersedes"]], ["conflicts_with", r["conflicts_with"]]];
    for (const [field, value] of links) {
      for (const target of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        if (typeof target === "string" && !ids.has(target)) {
          findings.push({ checkId: "dangling-ruling-ref", severity: "error", message: `${id}: ${field} '${target}' is not a ruling id in this file`, id });
        }
      }
    }
  }
  return findings;
}
