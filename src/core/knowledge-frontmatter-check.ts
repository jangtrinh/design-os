/**
 * Routing front-matter checks — the LINTER half of the `ui knowledge index` pair
 * (the emitter half is knowledge-index-emit.ts).
 *
 *   index-frontmatter-missing  error  a top-level knowledge/*.md with no block
 *   index-frontmatter-bad      error  a block present but not parseable
 *   index-drift                error  committed index.json ≠ what the emitter produces
 *
 * Scope is deliberately the TOP LEVEL of knowledge/ only. `personas/**` route
 * through `persona-index.md`, `figma-craft/**` through its own entry file, and
 * `benchmarks/*.json` are data, not prose — tagging each of them individually
 * would grow the index without giving a task a new place to land. Widen this
 * only when a subdirectory file becomes a routing destination in its own right.
 *
 * FS-free, like every other knowledge check: content in, findings out.
 */
import { buildIndex, emitIndex, parseFrontMatter } from "./knowledge-index-emit.js";
import type { KnowledgeFinding } from "./knowledge-lint.js";

/** README is the map itself, not a destination — it carries no routing block. */
const EXEMPT = new Set(["README.md"]);

/** Top-level `.md` files only (no `/` in the knowledge-relative path). */
export function topLevelMarkdown(
  mdContents: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const rel of Object.keys(mdContents).sort()) {
    if (rel.includes("/") || EXEMPT.has(rel)) continue;
    out.set(rel, mdContents[rel] ?? "");
  }
  return out;
}

/**
 * `committedIndex` is the raw bytes of `knowledge/index.json`, or null when the
 * file is absent. Absent counts as drift: the emitted map is part of the core,
 * and a missing one silently sends every consumer back to the prose table.
 */
export function frontMatterChecks(
  mdContents: Readonly<Record<string, string>>,
  committedIndex: string | null,
): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  const files = topLevelMarkdown(mdContents);

  for (const [rel, content] of files) {
    const parsed = parseFrontMatter(content);
    if (parsed === null) {
      findings.push({
        checkId: "index-frontmatter-missing",
        severity: "error",
        message: `'${rel}' has no routing front-matter — add an id/description/when block so 'ui knowledge index' can route to it`,
      });
      continue;
    }
    if (!parsed.ok) {
      findings.push({
        checkId: "index-frontmatter-bad",
        severity: "error",
        message: `'${rel}' front-matter is unparseable: ${parsed.reason}`,
      });
      continue;
    }
    const expectedId = rel.replace(/\.md$/, "");
    if (parsed.id !== expectedId) {
      findings.push({
        checkId: "index-frontmatter-bad",
        severity: "error",
        message: `'${rel}' declares id '${parsed.id}' — the id must match the filename ('${expectedId}'), it is how a ref resolves without a path`,
      });
    }
  }

  const expected = emitIndex(buildIndex(files));
  if (committedIndex === null) {
    findings.push({
      checkId: "index-drift",
      severity: "error",
      message: "knowledge/index.json is missing — run 'ui knowledge index --emit' and commit the result",
    });
  } else if (committedIndex !== expected) {
    findings.push({
      checkId: "index-drift",
      severity: "error",
      message: "knowledge/index.json does not match the front-matter it is emitted from — run 'ui knowledge index --emit' and commit the result",
    });
  }

  return findings;
}
