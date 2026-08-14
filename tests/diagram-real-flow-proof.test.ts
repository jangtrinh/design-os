import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintDiagram } from "../src/core/diagram-lint.js";
import { lintFlow } from "../src/core/flow-lint.js";
import { parseFlow } from "../src/core/flow-model.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE_DIR = join(ROOT, "tests", "fixtures", "diagram");
const FLOW_PATH = join(FIXTURE_DIR, "product-flow-real.json");
const DIAGRAM_PATH = join(FIXTURE_DIR, "product-flow-real.html");
const FLOW_SHA256 = "f7b1d062bc6512dfa8fdd01c1be7e5208752c3fceb9cf04996eb42441f958865";

describe("real product-flow proof", () => {
  const flowSource = readFileSync(FLOW_PATH, "utf8");
  const diagramSource = readFileSync(DIAGRAM_PATH, "utf8");
  const flow = parseFlow(JSON.parse(flowSource), FLOW_PATH);

  it("pins a lint-clean real flow and a lint-clean derived diagram", () => {
    expect(createHash("sha256").update(flowSource).digest("hex")).toBe(FLOW_SHA256);
    expect(diagramSource).toContain(`sha256:${FLOW_SHA256}`);
    expect(lintFlow(flow)).toEqual({ findings: [], errorCount: 0, warningCount: 0 });
    expect(lintDiagram(diagramSource)).toEqual({ findings: [], errorCount: 0, warningCount: 0 });
  });

  it("resolves every diagram source ID and records full fidelity", () => {
    const sourceIds = new Set([
      ...flow.screens.map((screen) => screen.id),
      ...flow.transitions.map((transition) => transition.id),
      ...flow.entryPoints.map((entry) => entry.id),
    ]);
    const diagramIds = new Set(
      [...diagramSource.matchAll(/data-source-id="([^"]+)"/g)].map((match) => match[1]),
    );

    expect(diagramIds).toEqual(sourceIds);
    expect(diagramSource).toContain('data-reading-order="main-entry, start, review, published, edit"');
    expect(diagramSource).toContain('data-fidelity="full"');
    expect(diagramSource).toContain("Empty — no source screen, entry point, or transition is merged, collapsed, or dropped.");
  });
});
