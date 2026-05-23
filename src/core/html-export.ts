/**
 * HTML export utilities — pure string transforms, no browser APIs, no I/O.
 *
 * Ported from EaseUI's export.ts (string-only subset).
 * Browser-only functions (triggerDownload, Blob, jszip, etc.) are excluded.
 */

// ─── escapeHtml (internal) ────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── enhanceAccessibility ─────────────────────────────────────────────────────

/**
 * Add basic accessibility attributes to an HTML document string:
 * - `lang="en"` on `<html>` if missing
 * - `alt=""` on `<img>` tags missing an alt attribute
 * - `rel="noopener noreferrer"` on `<a target="_blank">` missing rel
 * - `role="img" aria-hidden="true"` on `<svg>` missing role
 */
export function enhanceAccessibility(html: string): string {
  let result = html;

  result = result.replace(
    /<html(?![^>]*\blang\b)([^>]*)>/i,
    '<html lang="en"$1>',
  );

  result = result.replace(
    /<img(?![^>]*\balt\b)([^>]*?)\/?>/gi,
    '<img alt=""$1 />',
  );

  result = result.replace(
    /<a(?=[^>]*\btarget=["']_blank["'])(?![^>]*\brel\b)([^>]*)>/gi,
    '<a rel="noopener noreferrer"$1>',
  );

  result = result.replace(
    /<svg(?![^>]*\brole\b)([^>]*)>/gi,
    '<svg role="img" aria-hidden="true"$1>',
  );

  return result;
}

// ─── cleanHtmlForExport ───────────────────────────────────────────────────────

/**
 * Prepare an HTML string for export:
 * - Strip any preamble text before `<!doctype` or `<html`
 * - Wrap bare fragments (no `<html>`) in a full document scaffold
 * - Ensure doctype, viewport meta, charset meta, and `<title>` are present
 * - Run `enhanceAccessibility` on the result
 *
 * @param html   Raw HTML string (may be a fragment or a full document).
 * @param title  Title to use; defaults to `"Exported Component"`.
 */
export function cleanHtmlForExport(html: string, title = "Exported Component"): string {
  let cleaned = html.trim();

  // Strip preamble text before the first doctype or <html tag
  const doctypeIdx = cleaned.toLowerCase().indexOf("<!doctype");
  const htmlIdx = cleaned.toLowerCase().indexOf("<html");
  const startIdx = doctypeIdx >= 0 ? doctypeIdx : htmlIdx;
  if (startIdx > 0) cleaned = cleaned.substring(startIdx);

  if (!cleaned.toLowerCase().includes("<html")) {
    // Fragment — wrap in a full document
    cleaned = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
</head>
<body>
${cleaned}
</body>
</html>`;
  } else {
    // Full document — ensure required elements are present
    if (!cleaned.toLowerCase().startsWith("<!doctype")) {
      cleaned = "<!DOCTYPE html>\n" + cleaned;
    }

    if (!cleaned.includes("viewport")) {
      cleaned = cleaned.replace(
        /<head([^>]*)>/i,
        `<head$1>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
      );
    }

    if (!cleaned.includes("charset")) {
      cleaned = cleaned.replace(
        /<head([^>]*)>/i,
        `<head$1>\n    <meta charset="UTF-8">`,
      );
    }

    if (cleaned.includes("<title>")) {
      cleaned = cleaned.replace(
        /<title>[^<]*<\/title>/i,
        `<title>${escapeHtml(title)}</title>`,
      );
    } else {
      cleaned = cleaned.replace(
        /<\/head>/i,
        `    <title>${escapeHtml(title)}</title>\n</head>`,
      );
    }
  }

  return enhanceAccessibility(cleaned);
}

// ─── minifyHtml ───────────────────────────────────────────────────────────────

/**
 * Minify an HTML string: strip comments, collapse blank lines and whitespace,
 * remove space between adjacent tags.
 */
export function minifyHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n\s*\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

// ─── Filename helpers ─────────────────────────────────────────────────────────

/**
 * Convert a name to a safe lowercase kebab-case filename (max 64 chars).
 * Falls back to `"component"` for empty input.
 */
export function toSafeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "component"
  );
}

/**
 * Generate a project-level filename prefix from the first 4 words of a prompt.
 */
export function toProjectPrefix(prompt: string): string {
  const words = prompt.trim().toLowerCase().split(/\s+/).slice(0, 4);
  return words.join("-").replace(/[^a-z0-9-]/g, "") || "easeui-project";
}
