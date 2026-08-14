/**
 * diagram-lint — deterministic checks for diagram-craft artifacts (the linter half
 * of the emitter+linter pair behind `ui diagram`).
 * Design record and final audit: studio repo: specs/029-diagram-craft/.
 */
export interface DiagramFinding {
  checkId: string;
  severity: "error";
  message: string;
  elementId?: string;
}

export interface DiagramLintResult {
  findings: DiagramFinding[];
  errorCount: number;
  warningCount: number;
}

interface ElementInfo {
  tag: string;
  attrs: Record<string, string>;
}

const GRAMMARS = ["architecture", "sequence", "product-flow"];
const SOURCE_KINDS = ["brief", "flow-json"];
const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
const TAG_RE = /<([a-zA-Z][\w:-]*)([^>]*)>/g;

function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, "");
}

function stripCdata(source: string): string {
  return source.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(source)) !== null) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function parseElements(source: string): ElementInfo[] {
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

function idCount(source: string, id: string): number {
  const escaped = escapeRegExp(id);
  return (source.match(new RegExp(`(?:\\s|<)id=(?:"${escaped}"|'${escaped}'|${escaped}(?=\\s|/?>))`, "g")) ?? []).length;
}

function labelledbyIsValid(source: string, value: string | undefined): boolean {
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

function isSafeReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ||
    /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(trimmed);
}

function isSafeSourceSet(value: string): boolean {
  const candidate = String.raw`data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2}(?:\s+(?:\d+(?:\.\d+)?x|\d+w))?`;
  return new RegExp(`^${candidate}(?:,\\s*${candidate})*$`, "i").test(
    value.trim(),
  );
}

function hasUnsafeReference(source: string): boolean {
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

function lineGeometry(attrs: Record<string, string>): readonly number[] | undefined {
  const values = [attrs.x1, attrs.y1, attrs.x2, attrs.y2];
  if (values.some((value) => value === undefined || value.trim() === "")) return undefined;
  const numbers = values.map(Number);
  return numbers.every(Number.isFinite) ? numbers : undefined;
}

function finding(checkId: string, message: string, elementId?: string): DiagramFinding {
  return elementId === undefined
    ? { checkId, severity: "error", message }
    : { checkId, severity: "error", message, elementId };
}

export function lintDiagram(html: string): DiagramLintResult {
  const commentFree = stripComments(html);
  const cleaned = stripCdata(commentFree);
  const svgBlocks = cleaned.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi) ?? [];
  const owned = svgBlocks.filter((svg) => parseAttrs(svg.match(/<svg\b[^>]*>/i)![0])["data-diagram-owned"] === "true");
  if (owned.length !== 1) {
    const f = finding("svg-owned-count", `Expected exactly one owned SVG; found ${owned.length}. Mark one root data-diagram-owned="true".`);
    return { findings: [f], errorCount: 1, warningCount: 0 };
  }

  const svg = owned[0]!;
  const root = parseAttrs(svg.match(/<svg\b[^>]*>/i)![0]);
  const elements = parseElements(svg);
  const findings: DiagramFinding[] = [];
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

  const grammar = root["data-diagram-grammar"];
  if (!GRAMMARS.includes(grammar ?? "")) push("grammar-value", "Set data-diagram-grammar to architecture, sequence, or product-flow.");
  if ((root["data-reading-order"] ?? "").trim() === "") push("reading-order", "Declare a nonempty data-reading-order.");
  const focalId = root["data-focal-id"];
  if (!focalId || idCount(svg, focalId) !== 1) push("focal-id", "Set data-focal-id to one resolving element ID.");
  const sourceKind = root["data-source-kind"];
  if (!SOURCE_KINDS.includes(sourceKind ?? "") || (grammar === "product-flow" && sourceKind !== "flow-json")) {
    push("source-kind", grammar === "product-flow"
      ? "Set data-source-kind to flow-json for a product-flow projection."
      : "Set data-source-kind to brief or flow-json.");
  }

  if (grammar === "product-flow") {
    for (const element of elements) {
      const kind = element.attrs["data-diagram-element"];
      if ((kind === "node" || kind === "edge") && !element.attrs["data-source-id"]) {
        push("product-flow-source-id", `Add data-source-id to this ${kind}.`, element.attrs.id);
      }
    }
  }

  const edges = elements.filter((element) => element.attrs["data-diagram-element"] === "edge");
  for (const edge of edges) {
    if (edge.tag !== "line") continue;
    const geometry = lineGeometry(edge.attrs);
    if (geometry !== undefined && geometry[0] !== geometry[2] && geometry[1] !== geometry[3]) {
      push("diagonal-line", "Use an orthogonal line or an explicit path for this connector.", edge.attrs.id);
    }
  }

  const seen = new Set<string>();
  for (const edge of edges) {
    let geometry: string | undefined;
    if (edge.tag === "line") {
      const values = lineGeometry(edge.attrs);
      if (values !== undefined) geometry = `line:${values.join(",")}`;
    } else if (edge.tag === "path" && edge.attrs.d) {
      geometry = `path:${edge.attrs.d.trim().replace(/\s+/g, " ")}`;
    }
    if (geometry === undefined) continue;
    if (seen.has(geometry)) push("duplicate-connector", "Give this connector distinct geometry.", edge.attrs.id);
    else seen.add(geometry);
  }

  return { findings, errorCount: findings.length, warningCount: 0 };
}
