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
const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"/g;
const TAG_RE = /<([a-zA-Z][\w:-]*)([^>]*)>/g;

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(source)) !== null) attrs[match[1]!] = match[2]!;
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
  return (source.match(new RegExp(`(?:\\s|<)id="${escapeRegExp(id)}"`, "g")) ?? []).length;
}

function labelledbyIsValid(source: string, value: string | undefined): boolean {
  const ids = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (ids.length !== 2 || new Set(ids).size !== 2) return false;
  const matches = ids.map((id) => {
    if (idCount(source, id) !== 1) return "";
    const result = new RegExp(
      `<(title|desc)\\b[^>]*\\bid="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ).exec(source);
    return result !== null && result[2]!.trim() !== "" ? result[1]!.toLowerCase() : "";
  });
  return matches.includes("title") && matches.includes("desc");
}

function finding(checkId: string, message: string, elementId?: string): DiagramFinding {
  return elementId === undefined
    ? { checkId, severity: "error", message }
    : { checkId, severity: "error", message, elementId };
}

export function lintDiagram(html: string): DiagramLintResult {
  const svgBlocks = html.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi) ?? [];
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
  if (/\{\{[\s\S]*?\}\}/.test(svg)) push("no-placeholder", "Resolve template placeholders before delivery.");
  if (/<script\b/i.test(svg)) push("no-script", "Remove script elements from the self-contained artifact.");
  if (/\b(?:href|src|xlink:href)\s*=\s*"(?:https?:)?\/\//i.test(svg)) {
    push("no-external-ref", "Remove external runtime references; inline the required asset.");
  }

  const grammar = root["data-diagram-grammar"];
  if (!GRAMMARS.includes(grammar ?? "")) push("grammar-value", "Set data-diagram-grammar to architecture, sequence, or product-flow.");
  if ((root["data-reading-order"] ?? "").trim() === "") push("reading-order", "Declare a nonempty data-reading-order.");
  const focalId = root["data-focal-id"];
  if (!focalId || idCount(svg, focalId) !== 1) push("focal-id", "Set data-focal-id to one resolving element ID.");
  if (!SOURCE_KINDS.includes(root["data-source-kind"] ?? "")) push("source-kind", "Set data-source-kind to brief or flow-json.");

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
    const { x1, y1, x2, y2 } = edge.attrs;
    if ([x1, y1, x2, y2].every((value) => value !== undefined && Number.isFinite(Number(value))) &&
        Number(x1) !== Number(x2) && Number(y1) !== Number(y2)) {
      push("diagonal-line", "Use an orthogonal line or an explicit path for this connector.", edge.attrs.id);
    }
  }

  const seen = new Set<string>();
  for (const edge of edges) {
    let geometry: string | undefined;
    if (edge.tag === "line") {
      const { x1, y1, x2, y2 } = edge.attrs;
      if ([x1, y1, x2, y2].every((value) => value !== undefined)) geometry = `line:${x1},${y1},${x2},${y2}`;
    } else if (edge.tag === "path" && edge.attrs.d) {
      geometry = `path:${edge.attrs.d.trim().replace(/\s+/g, " ")}`;
    }
    if (geometry === undefined) continue;
    if (seen.has(geometry)) push("duplicate-connector", "Give this connector distinct geometry.", edge.attrs.id);
    else seen.add(geometry);
  }

  return { findings, errorCount: findings.length, warningCount: 0 };
}
