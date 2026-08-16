/**
 * diagram-lint — deterministic checks for diagram-craft artifacts (the linter half
 * of the emitter+linter pair behind `ui diagram`).
 * Design record and final audit: studio repo: specs/029-diagram-craft/.
 */
import {
  type ArtifactFinding,
  finding,
  idCount,
  resolveOwnedSvg,
  sharedArtifactChecks,
} from "./svg-artifact.js";

export type DiagramFinding = ArtifactFinding;

export interface DiagramLintResult {
  findings: DiagramFinding[];
  errorCount: number;
  warningCount: number;
}

const GRAMMARS = [
  "architecture",
  "sequence",
  "product-flow",
  "swimlane",
  "data-flow",
  "process",
  "high-level",
  "dp-integration",
  "medallion",
  "it-state",
  "dp-security-matrix",
  "loop",
  "er",
  "flowchart",
  "layers",
  "nested",
  "org-chart",
  "state",
  "tree",
];

/**
 * Grammars exempt from the orthogonal-connector rule, because they are non-orthogonal
 * by construction: `loop` draws a radial ring, and `org-chart`/`tree` may link a parent
 * to a child corner to corner.
 *
 * Stated as an exemption rather than an allowlist so the strict rule stays the default —
 * an unrecognised or missing grammar is still geometry-checked rather than silently
 * skipping it. Applied to every grammar (the previous tag-only gate) the rule made these
 * three impossible to author at all.
 */
const NON_ORTHOGONAL_GRAMMARS = new Set(["loop", "org-chart", "tree"]);

const SOURCE_KINDS = ["brief", "flow-json"];

function lineGeometry(attrs: Record<string, string>): readonly number[] | undefined {
  const values = [attrs.x1, attrs.y1, attrs.x2, attrs.y2];
  if (values.some((value) => value === undefined || value.trim() === "")) return undefined;
  const numbers = values.map(Number);
  return numbers.every(Number.isFinite) ? numbers : undefined;
}

/**
 * True when a path `d` contains a straight segment that moves on both axes at once.
 *
 * Curve commands (C/S/Q/T/A) are left alone: a deliberate arc is a routing decision,
 * and several grammars specify one. Only the straight-line commands are checked, which
 * is what stops an author from dodging the orthogonality rule by swapping `<line>` for
 * a `<path>` drawing the same diagonal.
 */
function pathHasDiagonalSegment(d: string): boolean {
  const tokens = d.match(/[MmLlHhVvZzCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let command = "";
  let x = 0;
  let y = 0;
  let index = 0;
  const nextNumber = (): number => Number(tokens[index++] ?? NaN);

  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      index++;
      if (/[Zz]/.test(command)) continue;
    }
    const relative = command === command.toLowerCase();
    switch (command.toLowerCase()) {
      case "m":
      case "l": {
        const dx = nextNumber();
        const dy = nextNumber();
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
        const nx = relative ? x + dx : dx;
        const ny = relative ? y + dy : dy;
        // Only an explicit line segment can be a forbidden diagonal; a moveto just repositions.
        if (command.toLowerCase() === "l" && nx !== x && ny !== y) return true;
        x = nx;
        y = ny;
        break;
      }
      case "h": {
        const dx = nextNumber();
        if (!Number.isFinite(dx)) return false;
        x = relative ? x + dx : dx;
        break;
      }
      case "v": {
        const dy = nextNumber();
        if (!Number.isFinite(dy)) return false;
        y = relative ? y + dy : dy;
        break;
      }
      default:
        // Curve and arc commands are permitted routing; skip their parameters.
        index++;
        break;
    }
  }
  return false;
}

export function lintDiagram(html: string): DiagramLintResult {
  const owned = resolveOwnedSvg(html, "data-diagram-owned");
  if ("checkId" in owned) {
    return { findings: [owned], errorCount: 1, warningCount: 0 };
  }

  const { svg, root, elements } = owned;
  const findings: DiagramFinding[] = sharedArtifactChecks(owned);
  const push = (id: string, message: string, elementId?: string): void => {
    findings.push(finding(id, message, elementId));
  };

  const grammar = root["data-diagram-grammar"];
  if (!GRAMMARS.includes(grammar ?? "")) {
    push("grammar-value", "Set data-diagram-grammar to a supported grammar; see knowledge/diagram-craft.md for the routing table.");
  }
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
  if (!NON_ORTHOGONAL_GRAMMARS.has(grammar ?? "")) {
    for (const edge of edges) {
      if (edge.tag === "line") {
        const geometry = lineGeometry(edge.attrs);
        if (geometry !== undefined && geometry[0] !== geometry[2] && geometry[1] !== geometry[3]) {
          push("diagonal-line", "Use an orthogonal line or an explicit path for this connector.", edge.attrs.id);
        }
      } else if (edge.tag === "path" && edge.attrs.d && pathHasDiagonalSegment(edge.attrs.d)) {
        push("diagonal-line", "This path draws a diagonal segment; route it orthogonally or use a curve.", edge.attrs.id);
      }
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
