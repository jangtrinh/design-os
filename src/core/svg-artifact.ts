/**
 * svg-artifact — the contract shared by every owned-inline-SVG artifact.
 *
 * Diagrams and charts are different capabilities with different grammars, but they make
 * the same promises about the file they produce: one owned SVG, a resolving accessible
 * name, no script, no reference that leaves the document, and no colour that bypasses the
 * design system. Those checks live here so a rule fixed once is fixed for both — the
 * alternative is patching the same blind spot twice and missing it the third time.
 *
 * Capability-specific rules (grammar vocabulary, geometry, metadata) stay in
 * `diagram-lint.ts` / `chart-lint.ts`.
 */

export interface ArtifactFinding {
  checkId: string;
  severity: "error";
  message: string;
  elementId?: string;
}

export interface ElementInfo {
  tag: string;
  attrs: Record<string, string>;
}

/**
 * SVG presentation attributes that carry colour. `ds-usage-lint` only reads CSS
 * declarations, so without this list a `fill="#eb6c36"` passes every gate while bypassing
 * the design system entirely.
 */
export const COLOR_ATTRS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"];

/**
 * The only colour values an artifact may name inline. Stated positively rather than trying
 * to enumerate every literal format (hex, rgb(), oklch(), CSS keywords).
 */
const ALLOWED_COLOR_VALUES = new Set(["none", "currentcolor", "inherit", "transparent", ""]);

const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
const TAG_RE = /<([a-zA-Z][\w:-]*)([^>]*)>/g;

export function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, "");
}

export function stripCdata(source: string): string {
  return source.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
}

export function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(source)) !== null) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

export function parseElements(source: string): ElementInfo[] {
  const elements: ElementInfo[] = [];
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(source)) !== null) {
    elements.push({ tag: match[1]!.toLowerCase(), attrs: parseAttrs(match[2]!) });
  }
  return elements;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function idCount(source: string, id: string): number {
  const escaped = escapeRegExp(id);
  return (source.match(new RegExp(`(?:\\s|<)id=(?:"${escaped}"|'${escaped}'|${escaped}(?=\\s|/?>))`, "g")) ?? []).length;
}

export function labelledbyIsValid(source: string, value: string | undefined): boolean {
  const ids = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (ids.length !== 2 || new Set(ids).size !== 2) return false;
  const matches = ids.map((id) => {
    if (idCount(source, id) !== 1) return "";
    const escaped = escapeRegExp(id);
    const result = new RegExp(
      `<(title|desc)\\b[^>]*\\bid=(?:"${escaped}"|'${escaped}'|${escaped}(?=\\s|/?>))[^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ).exec(source);
    return result !== null && result[2]!.trim() !== "" ? result[1]!.toLowerCase() : "";
  });
  return matches.includes("title") && matches.includes("desc");
}

export function isSafeReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ||
    /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(trimmed);
}

function isSafeSourceSet(value: string): boolean {
  const candidate = String.raw`data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2}(?:\s+(?:\d+(?:\.\d+)?x|\d+w))?`;
  return new RegExp(`^${candidate}(?:,\\s*${candidate})*$`, "i").test(value.trim());
}

export function hasUnsafeReference(source: string): boolean {
  const attribute = /\b(?:href|src|xlink:href|poster|data|action|formaction|background|cite|longdesc|manifest|ping)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = attribute.exec(source)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (value.trim() !== "" && !isSafeReference(value)) return true;
  }
  const sourceSet = /\b(?:srcset|imagesrcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/gi;
  while ((match = sourceSet.exec(source)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (value.trim() !== "" && !isSafeSourceSet(value)) return true;
  }
  const meta = /<meta\b[^>]*>/gi;
  while ((match = meta.exec(source)) !== null) {
    const attrs = parseAttrs(match[0]);
    if (attrs["http-equiv"]?.trim().toLowerCase() !== "refresh") continue;
    const target = /(?:^|;)\s*url\s*=\s*(.*)$/i.exec(attrs.content ?? "")?.[1]?.trim();
    if (target !== undefined && target !== "" && !isSafeReference(target.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2"))) {
      return true;
    }
  }
  const cssUrl = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
  while ((match = cssUrl.exec(source)) !== null) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (value !== "" && !isSafeReference(value)) return true;
  }
  return /@import\b/i.test(source);
}

/** `var(--token)` and `url(#gradient)` are indirection, not a literal colour. */
export function isTokenColorValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (ALLOWED_COLOR_VALUES.has(trimmed)) return true;
  return /^var\(\s*--[\w-]+/.test(trimmed) || /^url\(\s*['"]?#/.test(trimmed);
}

export function finding(checkId: string, message: string, elementId?: string): ArtifactFinding {
  return elementId === undefined
    ? { checkId, severity: "error", message }
    : { checkId, severity: "error", message, elementId };
}

export interface OwnedSvg {
  svg: string;
  root: Record<string, string>;
  elements: ElementInfo[];
  commentFree: string;
}

/**
 * Locate the single owned SVG. Returns a finding instead when the count is wrong, because
 * every downstream check depends on there being exactly one.
 */
export function resolveOwnedSvg(html: string, ownedAttr: string): OwnedSvg | ArtifactFinding {
  const commentFree = stripComments(html);
  const cleaned = stripCdata(commentFree);
  const svgBlocks = cleaned.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi) ?? [];
  const owned = svgBlocks.filter((svg) => parseAttrs(svg.match(/<svg\b[^>]*>/i)![0])[ownedAttr] === "true");
  if (owned.length !== 1) {
    return finding(
      "svg-owned-count",
      `Expected exactly one owned SVG; found ${owned.length}. Mark one root ${ownedAttr}="true".`,
    );
  }
  const svg = owned[0]!;
  return {
    svg,
    root: parseAttrs(svg.match(/<svg\b[^>]*>/i)![0]),
    elements: parseElements(svg),
    commentFree,
  };
}

/**
 * The checks every owned-SVG artifact shares, regardless of capability.
 */
export function sharedArtifactChecks(owned: OwnedSvg): ArtifactFinding[] {
  const { svg, root, elements, commentFree } = owned;
  const findings: ArtifactFinding[] = [];
  const push = (id: string, message: string, elementId?: string): void => {
    findings.push(finding(id, message, elementId));
  };

  if (root.role !== "img") push("svg-role-img", 'Set role="img" on the owned SVG.');
  if (!labelledbyIsValid(svg, root["aria-labelledby"])) {
    push("svg-labelledby", "aria-labelledby must resolve once to one nonempty title and one nonempty desc.");
  }
  if (/\{\{[\s\S]*?\}\}/.test(commentFree)) push("no-placeholder", "Resolve template placeholders before delivery.");
  if (/<script\b/i.test(commentFree)) push("no-script", "Remove script elements from the self-contained artifact.");
  if (hasUnsafeReference(commentFree)) {
    push("no-external-ref", "Remove external runtime references; inline the required asset.");
  }

  for (const element of elements) {
    for (const attr of COLOR_ATTRS) {
      const value = element.attrs[attr];
      if (value !== undefined && !isTokenColorValue(value)) {
        push(
          "hardcoded-svg-color",
          `Replace ${attr}="${value}" with a design-system token: var(--color-…), currentColor, or none.`,
          element.attrs.id,
        );
      }
    }
  }

  return findings;
}
