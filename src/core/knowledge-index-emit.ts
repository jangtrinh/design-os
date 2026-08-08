/**
 * `ui knowledge index` core — the routing index over the knowledge core.
 *
 * Why it exists: `knowledge/README.md`'s table is the only map an agent has, and
 * its cells run past a thousand characters each. Routing a task through it means
 * loading the whole prose table. This emits the same map as a small, machine-read
 * file: one entry per knowledge file, carrying the `when` tags a task matches on.
 *
 * Pure, FS-free, deterministic (Art I.2): same `files` in → same bytes out. No
 * clock, no fs, no network. Entries sort by `id`, tags keep their authored order,
 * and the JSON is emitted with a fixed 2-space indent so a drift check can compare
 * bytes rather than parse trees.
 *
 * The EMITTER half of the Art II pair; the linter half is knowledge-index-check.ts
 * (`index-frontmatter-missing`, `index-frontmatter-bad`, `index-drift`).
 */

/** One knowledge file's routing record, as it appears in the emitted index. */
export interface KnowledgeIndexEntry {
  readonly id: string;
  readonly path: string;
  readonly description: string;
  readonly when: readonly string[];
}

export interface KnowledgeIndex {
  readonly version: 1;
  readonly entries: readonly KnowledgeIndexEntry[];
}

/** A parsed front-matter block, or the reason it could not be parsed. */
export type FrontMatterResult =
  | { readonly ok: true; readonly id: string; readonly description: string; readonly when: readonly string[] }
  | { readonly ok: false; readonly reason: string };

const OPEN = "---\n";

/**
 * Parse the routing front-matter at the top of a knowledge file.
 *
 * Deliberately NOT a general YAML parser: the block is three known scalar keys in
 * any order, and a real YAML dependency would break Art I.2's zero-runtime-deps
 * rule. Anything the grammar does not cover is rejected by name rather than
 * guessed at, so a malformed block fails loudly instead of emitting a half entry.
 */
export function parseFrontMatter(content: string): FrontMatterResult | null {
  if (!content.startsWith(OPEN)) return null; // no block at all — caller reports it
  const end = content.indexOf("\n---", OPEN.length);
  if (end === -1) return { ok: false, reason: "front-matter block is never closed" };
  const body = content.slice(OPEN.length, end + 1);

  let id: string | null = null;
  let description: string | null = null;
  let when: string[] | null = null;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const sep = line.indexOf(":");
    if (sep === -1) return { ok: false, reason: `front-matter line is not 'key: value' — '${line}'` };
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key === "id") id = value;
    else if (key === "description") description = unquote(value);
    else if (key === "when") {
      if (!value.startsWith("[") || !value.endsWith("]")) {
        return { ok: false, reason: "'when' must be an inline list, e.g. when: [motion, easing]" };
      }
      when = value
        .slice(1, -1)
        .split(",")
        .map((t) => unquote(t.trim()))
        .filter((t) => t !== "");
    } else return { ok: false, reason: `unknown front-matter key '${key}' (allowed: id, description, when)` };
  }

  if (id === null || id === "") return { ok: false, reason: "front-matter is missing 'id'" };
  if (description === null || description === "") return { ok: false, reason: "front-matter is missing 'description'" };
  if (when === null || when.length === 0) return { ok: false, reason: "front-matter is missing a non-empty 'when'" };
  return { ok: true, id, description, when };
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  return quoted && value.length >= 2 ? value.slice(1, -1) : value;
}

/**
 * Build the index from already-read files. `files` maps a knowledge-relative path
 * (`motion-craft.md`) to its full content. Files without a parseable block are
 * skipped here and reported by the linter — an emitter that invented an entry for
 * an untagged file would hide exactly what the check exists to surface.
 */
export function buildIndex(files: ReadonlyMap<string, string>): KnowledgeIndex {
  const entries: KnowledgeIndexEntry[] = [];
  for (const [rel, content] of files) {
    const parsed = parseFrontMatter(content);
    if (parsed === null || !parsed.ok) continue;
    entries.push({ id: parsed.id, path: `knowledge/${rel}`, description: parsed.description, when: parsed.when });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, entries };
}

/** Serialize the index to the exact bytes `knowledge/index.json` must hold. */
export function emitIndex(index: KnowledgeIndex): string {
  return JSON.stringify(index, null, 2) + "\n";
}
