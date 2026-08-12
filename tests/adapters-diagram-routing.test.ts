import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKFLOW_VERBS, SKILL_NAMES } from "../src/adapters/templates.js";
import { VERB_SKILL_REFS } from "../src/adapters/skill-refs.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

const SUPPORTED_GRAMMARS = ["architecture", "sequence", "product-flow"] as const;

describe("diagram knowledge index", () => {
  it("registers the top-level shared contract", () => {
    const index = JSON.parse(readRepoFile("knowledge/index.json")) as {
      entries: Array<{ path: string }>;
    };
    const paths = index.entries.map((entry) => entry.path);
    expect(paths).toContain("knowledge/diagram-craft.md");
  });
});

describe("diagram routing registries", () => {
  it("registers the diagram verb", () => {
    expect(WORKFLOW_VERBS).toContain("diagram");
  });

  it("registers the diagram-craft skill", () => {
    expect(SKILL_NAMES).toContain("diagram-craft");
  });

  it("maps the diagram verb to exactly the diagram-craft skill", () => {
    expect(VERB_SKILL_REFS.diagram).toEqual(["diagram-craft"]);
  });
});

describe("templates/workflows/diagram.md", () => {
  const workflow = readRepoFile("templates/workflows/diagram.md");

  it("references the diagram-craft knowledge doc", () => {
    expect(workflow).toMatch(/knowledge\/diagram-craft\.md/);
  });

  it("references all three grammar knowledge docs", () => {
    for (const grammar of SUPPORTED_GRAMMARS) {
      expect(workflow).toMatch(
        new RegExp(`knowledge/diagram-grammars/${grammar}\\.md`)
      );
    }
  });

  it("lists exactly the three supported grammar tokens", () => {
    const section = workflow.match(
      /##\s*Supported grammars\s*\n([\s\S]*?)(?:\n##|\n?$)/i
    );
    expect(section, "expected a 'Supported grammars' section").not.toBeNull();

    const body = section![1] ?? "";
    const tokens = [...body.matchAll(/^[-*]\s*(?:\[)?(?:\*\*)?([a-z-]+)(?:\*\*)?/gim)].map(
      (m) => m[1]
    );

    expect(tokens.sort()).toEqual([...SUPPORTED_GRAMMARS].sort());
  });

  it("instructs rejection of unsupported diagram intents", () => {
    expect(workflow).toMatch(/unsupported grammar/i);
    expect(workflow).toMatch(/reject/i);
  });
});

describe("knowledge/diagram-grammars/product-flow.md contract", () => {
  const contract = readRepoFile("knowledge/diagram-grammars/product-flow.md");

  it("requires the UI flow lint", () => {
    expect(contract).toMatch(/ui flow lint/i);
  });

  it("requires a data-source-id attribute", () => {
    expect(contract).toMatch(/data-source-id/i);
  });

  it("requires a fidelity ledger", () => {
    expect(contract).toMatch(/fidelity ledger/i);
  });

  it("mandates read-only, non-mutating sourcing language", () => {
    expect(contract).toMatch(/read-only/i);
    expect(contract).toMatch(/no mutation|must not mutate|non-mutating/i);
  });
});

describe("shared diagram-craft output contract", () => {
  const contract = readRepoFile("knowledge/diagram-craft.md");

  it("requires the UI diagram lint", () => {
    expect(contract).toMatch(/ui diagram lint/i);
  });

  it("requires self-contained HTML with inline SVG", () => {
    expect(contract).toMatch(/self-contained html/i);
    expect(contract).toMatch(/inline svg/i);
  });

  it("forbids scripts and external dependencies", () => {
    expect(contract).toMatch(/no .*script/i);
    expect(contract).toMatch(/no external .*dependenc|no view-time network dependenc/i);
  });

  it("requires role=img with title and desc", () => {
    expect(contract).toMatch(/role=["']?img["']?/i);
    expect(contract).toMatch(/\btitle\b/i);
    expect(contract).toMatch(/\bdesc\b/i);
  });

  it("requires token fallback behavior", () => {
    expect(contract).toMatch(/token fallback/i);
  });
});
