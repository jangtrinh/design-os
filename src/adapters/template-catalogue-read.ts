/**
 * Reader for <root>/schemas/template-descriptions.json — the catalogue emitted
 * by `ui templates catalogue` from template frontmatter and bytes. The kernel
 * never parses template Markdown at runtime; it reads this JSON instead.
 *
 * Split out of templates.ts (PR-W3c) to keep that file under the repo's
 * 200-line module guideline; both live in src/adapters/ and templates.ts
 * re-exports these two functions so no importer needs to change.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const TEMPLATE_KINDS = new Set(["workflows", "skills", "journeys"]);

interface TemplateCatalogueEntry {
  description: string | null;
  sourceSha256: string;
}
const catalogueCache = new Map<string, Map<string, TemplateCatalogueEntry>>();

function loadTemplateCatalogue(path: string): Map<string, TemplateCatalogueEntry> {
  const cached = catalogueCache.get(path);
  if (cached !== undefined) return cached;
  let doc: { templates: Array<{ path: string; description: string | null; sourceSha256: string }> };
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      `template description catalogue unreadable at ${path}; regenerate it with ` +
        "`ui templates catalogue --out schemas/template-descriptions.json`",
    );
  }
  const map = new Map(
    doc.templates.map((t) => [t.path, { description: t.description, sourceSha256: t.sourceSha256 }] as const),
  );
  catalogueCache.set(path, map);
  return map;
}

/** Resolve `<root>/schemas/template-descriptions.json` for a template `absPath`. */
function catalogueEntry(absPath: string): { key: string; entry: TemplateCatalogueEntry } | null {
  const kindDir = dirname(absPath);
  const templatesDir = dirname(kindDir);
  if (basename(templatesDir) !== "templates" || !TEMPLATE_KINDS.has(basename(kindDir))) return null;
  const catalogue = loadTemplateCatalogue(
    join(dirname(templatesDir), "schemas", "template-descriptions.json"),
  );
  const key = `${basename(kindDir)}/${basename(absPath)}`;
  const entry = catalogue.get(key);
  return entry === undefined ? null : { key, entry };
}

/**
 * The `description` of a registered template (what + when + trigger terms), or
 * null when the template carries none or `absPath` is not a template location
 * (<root>/templates/{workflows,skills,journeys}/<name>.md).
 *
 * The value comes from <root>/schemas/template-descriptions.json, emitted from
 * the template frontmatter by `ui templates catalogue`; the kernel never parses
 * template Markdown at runtime. A missing or unparseable catalogue throws.
 */
export function readTemplateDescription(absPath: string): string | null {
  return catalogueEntry(absPath)?.entry.description ?? null;
}

/**
 * The recorded sha256 of a registered template's source bytes, read from
 * <root>/schemas/template-descriptions.json (emitted by `ui templates catalogue`
 * from the same bytes that ship in the package — see package.json `files`).
 *
 * Use this instead of `hashTemplateFile` (templates.ts) whenever a caller only
 * needs "the hash of template X" to RECORD or embed (init's manifest baseline,
 * the codex adapter block): the catalogue is audited
 * (`ui templates catalogue --check`) and is exactly as trustworthy as
 * re-hashing the file, without a runtime read.
 *
 * Do NOT use this for `ui doctor`'s template-drift check (adapter-lint.ts) —
 * that check's entire job is comparing a recorded baseline against the file's
 * CURRENT bytes on disk right now, to catch a hand-edited installed template
 * even when the catalogue was never touched. A cached catalogue value cannot
 * observe "current disk state", so that one call site must keep hashing live
 * bytes via `hashTemplateFile` (see evidence/w3a/proposals.md §2's decision
 * note — do not relabel that guarantee).
 *
 * Throws if `absPath` is not a registered template location or the catalogue
 * has no entry for it (both indicate a broken/stale catalogue, not a valid
 * "no hash" state — every registered template has a hash).
 */
export function readTemplateSourceHash(absPath: string): string {
  const found = catalogueEntry(absPath);
  if (found === null) {
    throw new Error(`not a registered template location: ${absPath}`);
  }
  return found.entry.sourceSha256;
}
