import { describe, expect, it } from "vitest";
import { lintDiagram } from "../src/core/diagram-lint.js";

const ROOT = 'data-diagram-owned="true" role="img" aria-labelledby="dt dd" data-reading-order="left-to-right" data-focal-id="n1"';
const NODES = '<title id="dt">Diagram</title><desc id="dd">A test diagram.</desc><g data-diagram-element="node" id="n1"/><g data-diagram-element="node" id="n2"/>';
const svg = (inner: string, grammar = "architecture", source = "brief"): string =>
  `<svg ${ROOT} data-diagram-grammar="${grammar}" data-source-kind="${source}">${inner}</svg>`;

describe("product-flow source IDs", () => {
  const flow = NODES.replace('id="n1"', 'id="n1" data-source-id="step-1"') +
    '<line data-diagram-element="edge" id="e1" data-source-id="transition-1" x1="0" y1="0" x2="0" y2="20"/>';

  it("flags a node missing data-source-id", () => {
    expect(lintDiagram(svg(flow, "product-flow", "flow-json")).findings).toContainEqual(
      expect.objectContaining({ checkId: "product-flow-source-id", elementId: "n2" }),
    );
  });

  it("passes when every node and edge has a source ID", () => {
    const valid = flow.replace('id="n2"', 'id="n2" data-source-id="step-2"');
    expect(lintDiagram(svg(valid, "product-flow", "flow-json")).findings).toEqual([]);
  });

  it("requires flow-json provenance", () => {
    expect(lintDiagram(svg(flow, "product-flow", "brief")).findings.map((item) => item.checkId)).toContain("source-kind");
  });
});

describe("connector geometry and finding order", () => {
  const edge = '<line data-diagram-element="edge" id="e1" x1="0" y1="0" x2="0" y2="20"/>';

  it("flags diagonal lines", () => {
    const diagonal = edge.replace('x2="0"', 'x2="20"');
    expect(lintDiagram(svg(NODES + diagonal)).findings).toContainEqual(
      expect.objectContaining({ checkId: "diagonal-line", elementId: "e1" }),
    );
  });

  it("normalizes duplicate line geometry", () => {
    const duplicate = '<line data-diagram-element="edge" id="e2" x1="0.0" y1="0" x2="0" y2="20.0"/>';
    expect(lintDiagram(svg(NODES + edge + duplicate)).findings).toContainEqual(
      expect.objectContaining({ checkId: "duplicate-connector", elementId: "e2" }),
    );
  });

  it("flags duplicate path geometry", () => {
    const paths = '<path data-diagram-element="edge" id="e1" d="M0,0 L20,0"/><path data-diagram-element="edge" id="e2" d="M0,0 L20,0"/>';
    expect(lintDiagram(svg(NODES + paths)).findings).toContainEqual(
      expect.objectContaining({ checkId: "duplicate-connector", elementId: "e2" }),
    );
  });

  it("returns stable findings in contract order", () => {
    const broken = svg(NODES + edge.replace('x2="0"', 'x2="20"') + "<text>{{unresolved}}</text>", "invalid")
      .replace('data-reading-order="left-to-right"', 'data-reading-order=""');
    const first = lintDiagram(broken);
    const ids = first.findings.map((item) => item.checkId);
    expect(ids).toEqual(["no-placeholder", "grammar-value", "reading-order", "diagonal-line"]);
    expect(lintDiagram(broken).findings.map((item) => item.checkId)).toEqual(ids);
  });
});
