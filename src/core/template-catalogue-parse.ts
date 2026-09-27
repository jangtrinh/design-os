/**
 * The ONLY frontmatter parser for template discovery descriptions. It is called
 * by the maintainer emitter (`ui templates catalogue`); the kernel runtime reads
 * schemas/template-descriptions.json instead.
 *
 * Deterministic, intentionally narrow: a leading `---` line, a closing `---`
 * line, and a single-line `description:` between them. Surrounding single or
 * double quotes are stripped. Returns null when there is no frontmatter, no
 * description, or an empty one.
 */
export function parseTemplateDescription(raw: string): string | null {
  if (!raw.startsWith("---\n")) return null;
  const closeIdx = raw.indexOf("\n---", 4);
  if (closeIdx === -1) return null;
  const block = raw.slice(4, closeIdx);
  for (const line of block.split("\n")) {
    const m = /^description:\s*(.+)\s*$/.exec(line);
    if (m !== null && m[1] !== undefined) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1).replace(/\\"/g, '"');
      }
      return v.length > 0 ? v : null;
    }
  }
  return null;
}
