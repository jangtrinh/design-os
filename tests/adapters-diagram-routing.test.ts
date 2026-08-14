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

  it("invokes ui taste-lint and the full 6+1 axis taste rubric with the >=7 gate", () => {
    expect(workflow).toMatch(/ui taste-lint/);
    expect(workflow).toMatch(/6\+1/);
    expect(workflow).toMatch(/knowledge\/taste-rubric\.md/);
    expect(workflow).toMatch(/(?:>=|≥)\s*7/);
  });

  it("does not run a parallel, diagram-only four-axis critique in place of the taste rubric", () => {
    expect(workflow).not.toMatch(/\*\*Legibility\*\*/);
    expect(workflow).not.toMatch(/\*\*Honesty\*\*/);
    expect(workflow).not.toMatch(/\*\*Restraint\*\*/);
  });

  it("clarifies that ui diagram lint checks data-source-id presence, not flow.json resolution", () => {
    expect(workflow).toMatch(/manual step/i);
    expect(workflow).toMatch(/does not.*resolve|cannot confirm.*resolve/i);
  });

  it("states that ui flow lint never opens the diagram artifact", () => {
    expect(workflow).toMatch(/never opens the diagram artifact/i);
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

  it("scopes node identities to what the flow schema actually defines", () => {
    expect(contract).toMatch(/screen-state/i);
    expect(contract).toMatch(/entryPoints/);
    expect(contract).toMatch(/screens\[\]/);
    expect(contract).toMatch(/transitions\[\]/);
  });

  it("maps the screen-state node's data-source-id to screenId.stateId, not just the vocabulary string", () => {
    const row = contract
      .split("\n")
      .find((line) => /^\|\s*`screen-state`\s*\|/.test(line));
    expect(row, "expected a `screen-state` row in the node vocabulary table").toBeDefined();
    const columns = row!.split("|").map((c) => c.trim()).filter(Boolean);
    expect(columns[columns.length - 1]).toBe("`screenId.stateId`");
  });

  it("maps the transition edge's data-source-id to the transition's own id, not just the vocabulary string", () => {
    const row = contract
      .split("\n")
      .find((line) => /^\|\s*`transition`\s*\|/.test(line));
    expect(row, "expected a `transition` row in the edge vocabulary table").toBeDefined();
    const columns = row!.split("|").map((c) => c.trim()).filter(Boolean);
    expect(columns[columns.length - 1]).toBe("the transition's `id`");
  });

  it("does not list invented node kinds as vocabulary table rows", () => {
    expect(contract).not.toMatch(/^\|\s*`decision`\s*\|/m);
    expect(contract).not.toMatch(/^\|\s*`action`\s*\|/m);
    expect(contract).not.toMatch(/^\|\s*`system-event`\s*\|/m);
    expect(contract).not.toMatch(/^\|\s*`exit`\s*\|/m);
    expect(contract).not.toMatch(/^\|\s*`terminal-error`\s*\|/m);
  });

  it("states that cross-artifact source-id resolution is a manual audit step", () => {
    expect(contract).toMatch(/manual audit/i);
  });

  it("states that ui flow lint never opens a diagram artifact", () => {
    expect(contract).toMatch(/never opens? a diagram/i);
  });

  it("states that ui diagram lint has no access to flow.json", () => {
    expect(contract).toMatch(/no access to `?flow\.json`/i);
  });
});

describe("knowledge/diagram-grammars/sequence.md contract", () => {
  const contract = readRepoFile("knowledge/diagram-grammars/sequence.md");

  it("requires a focal anchor even when the brief gives participants equal weight", () => {
    expect(contract).toMatch(/data-focal-id/i);
    expect(contract).toMatch(/when the brief gives equal weight, choose/i);
    expect(contract).toMatch(/rather than omitting it/i);
    expect(contract).not.toMatch(/when the brief singles one out/i);
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
