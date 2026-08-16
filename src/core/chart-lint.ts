/**
 * chart-lint — deterministic checks for chart-craft artifacts (the linter half of the
 * emitter+linter pair behind `ui chart`).
 *
 * Shares the owned-SVG contract with diagrams via `svg-artifact.ts`; everything here is
 * chart-specific. The checks prove the contract holds — they say nothing about whether
 * the encoding is honest or the comparison worth making, which is the taste rubric's job.
 */
import {
  type ArtifactFinding,
  finding,
  idCount,
  resolveOwnedSvg,
  sharedArtifactChecks,
} from "./svg-artifact.js";

export type ChartFinding = ArtifactFinding;

export interface ChartLintResult {
  findings: ChartFinding[];
  errorCount: number;
  warningCount: number;
}

/** Every supported chart grammar. Diagrams live in their own capability. */
const GRAMMARS = [
  "bar",
  "line",
  "scatter",
  "radar",
  "gantt",
  "timeline",
  "quadrant",
  "venn",
  "pyramid",
];

const SOURCE_KINDS = ["dataset", "brief"];

/**
 * Grammars whose marks encode value by *length* or *area* measured from an origin. For
 * these a non-zero baseline misstates the comparison, so the artifact must declare its
 * baseline explicitly and declare it as zero.
 *
 * Position-encoded grammars (line, scatter) may legitimately truncate, which is why they
 * are absent here — they must still declare the baseline, just not necessarily zero.
 */
const ZERO_BASELINE_GRAMMARS = new Set(["bar", "pyramid"]);

/** Grammars that plot one or more named series and therefore need series identity. */
const SERIES_GRAMMARS = new Set(["bar", "line", "scatter", "radar"]);

export function lintChart(html: string): ChartLintResult {
  const owned = resolveOwnedSvg(html, "data-chart-owned");
  if ("checkId" in owned) {
    return { findings: [owned], errorCount: 1, warningCount: 0 };
  }

  const { svg, root, elements } = owned;
  const findings: ChartFinding[] = sharedArtifactChecks(owned);
  const push = (id: string, message: string, elementId?: string): void => {
    findings.push(finding(id, message, elementId));
  };

  const grammar = root["data-chart-grammar"];
  if (!GRAMMARS.includes(grammar ?? "")) {
    push("grammar-value", "Set data-chart-grammar to a supported grammar; see knowledge/chart-craft.md for the routing table.");
  }
  if ((root["data-reading-order"] ?? "").trim() === "") {
    push("reading-order", "Declare a nonempty data-reading-order.");
  }

  const focalId = root["data-focal-id"];
  if (!focalId || idCount(svg, focalId) !== 1) {
    push("focal-id", "Set data-focal-id to one resolving element ID.");
  }

  const sourceKind = root["data-source-kind"];
  if (!SOURCE_KINDS.includes(sourceKind ?? "")) {
    push("source-kind", "Set data-source-kind to dataset or brief.");
  }

  // A chart that does not say where its baseline sits lets the reader assume zero. That
  // assumption is exactly what a truncated axis exploits, so the declaration is mandatory
  // for every grammar and its value is constrained for the length-encoded ones.
  const baseline = root["data-baseline"];
  if (grammar !== undefined && GRAMMARS.includes(grammar)) {
    if ((baseline ?? "").trim() === "") {
      push("baseline-declared", 'Declare data-baseline (e.g. "zero" or the truncated start value) so a reader cannot assume zero.');
    } else if (ZERO_BASELINE_GRAMMARS.has(grammar) && baseline!.trim().toLowerCase() !== "zero") {
      push(
        "zero-baseline-required",
        `A ${grammar} chart encodes value by length or area, so its baseline must be zero; got "${baseline}".`,
      );
    }
  }

  const series = elements.filter((element) => element.attrs["data-chart-element"] === "series");
  if (grammar !== undefined && SERIES_GRAMMARS.has(grammar)) {
    if (series.length === 0) {
      push("series-present", `A ${grammar} chart must mark at least one data-chart-element="series" group.`);
    }
    const seen = new Set<string>();
    for (const entry of series) {
      const id = entry.attrs.id;
      if (id === undefined || id.trim() === "") {
        push("series-id", 'Give every series a stable id so it can be referenced and labelled.');
        continue;
      }
      if (seen.has(id)) push("series-id", `Series id "${id}" is used more than once.`, id);
      else seen.add(id);
    }

    // Colour alone is not a legible channel. Requiring a label per series is the
    // statically checkable half of that rule; pattern and marker variation are not.
    for (const entry of series) {
      if ((entry.attrs["data-series-label"] ?? "").trim() === "") {
        push(
          "series-label",
          "Give every series a data-series-label; colour alone does not distinguish series for a colour-blind or grayscale reader.",
          entry.attrs.id,
        );
      }
    }
  }

  // Two scales on one frame invite a comparison the data does not support.
  const axes = elements.filter((element) => element.attrs["data-chart-element"] === "axis");
  const valueAxes = axes.filter((axis) => (axis.attrs["data-axis-role"] ?? "") === "value");
  if (valueAxes.length > 1) {
    push("no-dual-axis", `Found ${valueAxes.length} value axes; split into separate charts rather than overlaying two scales.`);
  }

  return { findings, errorCount: findings.length, warningCount: 0 };
}
