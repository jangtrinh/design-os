/**
 * knowledge-lint core — the six checks as pure transforms over already-read
 * content. FS-free: every fixture is an in-memory KnowledgeLintInput.
 */
import { describe, expect, it } from "vitest";

import { lintKnowledge } from "../src/core/knowledge-lint.js";
import { fullRouteTable } from "./fixtures/full-route-table.js";
import { routingChecks } from "../src/core/knowledge-routing-check.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeLintInput } from "../src/core/knowledge-lint.js";
import { buildIndex, emitIndex } from "../src/core/knowledge-index-emit.js";
import { topLevelMarkdown } from "../src/core/knowledge-frontmatter-check.js";

/** A mutable view of the input so tests can tweak fixtures before linting. */
type MutableInput = Omit<KnowledgeLintInput, "files" | "mdContents" | "repoFiles"> & {
  files: string[];
  mdContents: Record<string, string>;
  repoFiles: string[];
};

/** A minimal-but-consistent knowledge core: one index row per md file, personas aligned. */
function consistent(overrides: Partial<MutableInput> = {}): MutableInput {
  const readme = [
    "# Knowledge",
    "",
    "## The files",
    "",
    "| File | Covers |",
    "|---|---|",
    "| `taste-rubric.md` | The taste model |",
    "| `persona-index.md` | Persona lookup |",
    "| `personas/<family>.md` | Persona DNA |",
    "| `benchmarks/*.dna.json` | Measured DNA |",
    "| `need-routing.md` | Need routing |",
    "",
  ].join("\n");
  const personaIndex = [
    "# Persona Index",
    "",
    "## 1. Lookup Table",
    "",
    "| Slug | Family | Keywords |",
    "|---|---|---|",
    "| `alpha-one` | family-a | k1, k2 |",
    "| `beta-two` | family-b | k3 |",
    "",
  ].join("\n");
  const familyA = "# Family A\n\n## Alpha One\n\n- **Slug:** `alpha-one`\n- **Family:** family-a\n";
  const familyB = "# Family B\n\n## Beta Two\n\n- **Slug:** `beta-two`\n- **Family:** family-b\n";
  const personasJson = JSON.stringify([
    { slug: "alpha-one", family: "family-a" },
    { slug: "beta-two", family: "family-b" },
  ]);
  const mdContents: Record<string, string> = {
    "README.md": readme,
    "taste-rubric.md": fm("taste-rubric", "The taste model.", ["taste"]) + "# Taste\n",
    "persona-index.md": fm("persona-index", "Persona lookup.", ["persona"]) + personaIndex,
    "personas/family-a.md": familyA,
    "personas/family-b.md": familyB,
    "need-routing.md": fm("need-routing", "Need routing.", ["routing"]) + "# Need routing\n\n" + fullRouteTable(),
  };
  const files = [
    "README.md",
    "taste-rubric.md",
    "persona-index.md",
    "personas/family-a.md",
    "personas/family-b.md",
    "need-routing.md",
    "personas/personas.json",
    "benchmarks/stripe--202607.dna.json",
  ];
  const base = {
    files,
    mdContents,
    personasJson,
    repoFiles: files.map((f) => `knowledge/${f}`),
    asOf: "202607",
    ...overrides,
  };
  // The committed index must match whatever mdContents the caller ended up with,
  // or every case would also trip index-drift and stop testing its own check.
  return { ...base, committedIndex: emitIndex(buildIndex(topLevelMarkdown(base.mdContents))) };
}

/** A routing front-matter block, the shape authoring-standard.md specifies. */
function fm(id: string, description: string, when: string[]): string {
  return `---\nid: ${id}\ndescription: "${description}"\nwhen: [${when.join(", ")}]\n---\n\n`;
}


const ids = (input: KnowledgeLintInput): string[] => lintKnowledge(input).map((f) => f.checkId);

describe("knowledge-lint — passes on a consistent core", () => {
  it("returns zero findings", () => {
    expect(lintKnowledge(consistent())).toEqual([]);
  });
});

describe("knowledge-lint — capability pilot evidence", () => {
  it("turns command-provided receipt rejection into a stable error", () => {
    const base = consistent({
      capabilityPilotReceipts: [{
        capabilityId: "native-macos",
        result: { ok: false, code: "PILOT_RECEIPT_DIGEST", message: "pilot receipt digest does not match exact stored bytes" },
      }],
    });
    expect(ids(base)).toContain("capability-pilot-receipt-invalid");
  });
});

describe("knowledge-lint — index checks", () => {
  it("index-missing-row: a knowledge md with no table row", () => {
    const base = consistent();
    base.mdContents["orphan.md"] = fm("orphan", "An orphan.", ["orphan"]) + "# Orphan\n";
    base.files.push("orphan.md");
    expect(ids(base)).toContain("index-missing-row");
  });

  it("index-dead-row: a File-column entry that matches no file", () => {
    const base = consistent();
    base.mdContents["README.md"] = base.mdContents["README.md"]!.replace(
      "| `taste-rubric.md` | The taste model |",
      "| `taste-rubric.md` | The taste model |\n| `ghost.md` | Nothing |",
    );
    expect(ids(base)).toContain("index-dead-row");
  });

  it("brace + glob + placeholder rows count as coverage", () => {
    const base = consistent();
    // deep-dive covered only by a brace list inside the Covers column
    base.mdContents["README.md"] = base.mdContents["README.md"]!.replace(
      "| `taste-rubric.md` | The taste model |",
      "| `taste-rubric.md` | See `sub/{a,b}.md` |",
    );
    base.mdContents["sub/a.md"] = "# A\n";
    base.mdContents["sub/b.md"] = "# B\n";
    base.files.push("sub/a.md", "sub/b.md");
    expect(ids(base)).not.toContain("index-missing-row");
  });
});

describe("knowledge-lint — persona-drift", () => {
  it("flags a slug present in the index but missing from personas.json", () => {
    const base = consistent();
    base.personasJson = JSON.stringify([{ slug: "alpha-one", family: "family-a" }]);
    expect(ids(base)).toContain("persona-drift");
  });

  it("flags a family that disagrees across sources", () => {
    const base = consistent();
    base.personasJson = JSON.stringify([
      { slug: "alpha-one", family: "WRONG" },
      { slug: "beta-two", family: "family-b" },
    ]);
    expect(ids(base)).toContain("persona-drift");
  });

  it("flags a missing/invalid personas.json", () => {
    const base = consistent({ personasJson: null });
    expect(ids(base)).toContain("persona-drift");
  });
});

describe("knowledge-lint — broken-xref", () => {
  it("flags a relative markdown link that does not resolve", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\nSee [gone](./does-not-exist.md).\n";
    expect(ids(base)).toContain("broken-xref");
  });

  it("resolves a link that points to a real sibling", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\nSee [idx](./persona-index.md).\n";
    expect(ids(base)).not.toContain("broken-xref");
  });
});

describe("knowledge-lint — benchmark-stale", () => {
  it("warns (not errors) when a benchmark is older than 6 months vs asOf", () => {
    const findings = lintKnowledge(consistent({ asOf: "202702" }));
    const stale = findings.filter((f) => f.checkId === "benchmark-stale");
    expect(stale.length).toBe(1);
    expect(stale[0]!.severity).toBe("warning");
  });

  it("does not warn within the 6-month window", () => {
    expect(ids(consistent({ asOf: "202612" }))).not.toContain("benchmark-stale");
  });
});

describe("knowledge-lint — provenance-bad-grammar", () => {
  it("flags a marker with no ref= attribute", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\n<!-- ease:source captured=\"202607\" -->\n";
    expect(ids(base)).toContain("provenance-bad-grammar");
  });

  it("flags a ref that points to a non-existent file", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\n<!-- ease:source ref=\"knowledge/nope.json\" -->\n";
    expect(ids(base)).toContain("provenance-bad-grammar");
  });

  it("accepts a marker whose ref resolves to a real repo file", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      "# Taste\n\n<!-- ease:source ref=\"knowledge/benchmarks/stripe--202607.dna.json\" -->\n";
    expect(ids(base)).not.toContain("provenance-bad-grammar");
  });

  it("ignores a marker shown inside a fenced code block (a documentation example)", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      "# Taste\n\n```\n<!-- ease:source ref=\"whatever\" -->\n```\n";
    expect(ids(base)).not.toContain("provenance-bad-grammar");
  });

  it("ignores a marker shown inside an inline code span (docs mentioning the grammar)", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      "# Taste\n\nUse the `<!-- ease:source ref=… -->` marker to cite a source.\n";
    expect(ids(base)).not.toContain("provenance-bad-grammar");
  });
});

describe("knowledge-lint — provenance-machine-local-ref [R]", () => {
  it("fires on a ref into references/** — knowledge.ts (D9) no longer walks references/, so this is now also 'dead' by resolution; one defect, one finding", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      '# Taste\n\n<!-- ease:source ref="references/some-external-capture.json" -->\n';
    const found = ids(base).filter(
      (id) => id === "provenance-machine-local-ref" || id === "provenance-bad-grammar",
    );
    expect(found).toEqual(["provenance-machine-local-ref"]);
  });

  it("fires on a ref into references/** EVEN WHEN it resolves locally (repoFiles carries it, e.g. a stale caller)", () => {
    const base = consistent();
    base.repoFiles.push("references/some-external-capture.json");
    base.mdContents["taste-rubric.md"] =
      '# Taste\n\n<!-- ease:source ref="references/some-external-capture.json" -->\n';
    const found = ids(base).filter(
      (id) => id === "provenance-machine-local-ref" || id === "provenance-bad-grammar",
    );
    expect(found).toEqual(["provenance-machine-local-ref"]);
  });

  it("fires on a ref into taste/** — exactly one finding, never also bad-grammar", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = '# Taste\n\n<!-- ease:source ref="taste/corpus.json" -->\n';
    const found = ids(base).filter(
      (id) => id === "provenance-machine-local-ref" || id === "provenance-bad-grammar",
    );
    expect(found).toEqual(["provenance-machine-local-ref"]);
  });

  it("does not fire on a ref into knowledge/**", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      '# Taste\n\n<!-- ease:source ref="knowledge/benchmarks/stripe--202607.dna.json" -->\n';
    expect(ids(base)).not.toContain("provenance-machine-local-ref");
  });

  it("an ordinary dead ref (not machine-local) still fires provenance-bad-grammar only", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = '# Taste\n\n<!-- ease:source ref="knowledge/nope.json" -->\n';
    const found = ids(base).filter(
      (id) => id === "provenance-machine-local-ref" || id === "provenance-bad-grammar",
    );
    expect(found).toEqual(["provenance-bad-grammar"]);
  });
});

describe("need-routing parity — the ship-gate for agent expertise", () => {
  const TABLE = (rows: string) => `## Route table\n\n| Need class | Route |\n|---|---|\n${rows}\n\n## Next\n`;

  it("(b) a route-table verb outside WORKFLOW_VERBS is an error — and this probe CAN go red", () => {
    const bad = TABLE("| something | `generate` |\n| bogus need | `frobnicate` |");
    const f = routingChecks(bad).filter((x) => x.checkId === "routing-unknown-verb");
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("frobnicate");
  });

  it("(c) a WORKFLOW_VERB with no route-table row is an error — a new feature cannot ship untaught", () => {
    const partial = TABLE("| words only, nothing exists yet | `generate` |");
    const f = routingChecks(partial).filter((x) => x.checkId === "routing-verb-uncovered");
    expect(f.length).toBeGreaterThan(10); // 19 verbs, only 1 covered
    expect(f.map((x) => x.message).join(" ")).toContain("slides");
  });

  it("prose mentions outside the anchored table NEVER count as coverage (the tautology guard)", () => {
    const prose = "Never use `slides` for single pages.\n" + TABLE("| words only | `generate` |");
    const f = routingChecks(prose).filter((x) => x.checkId === "routing-verb-uncovered");
    expect(f.map((x) => x.message).join(" ")).toContain("slides");
  });

  it("a backticked verb in the NEED column never counts as coverage — only the route column teaches", () => {
    // The `slides` row is deleted; another row's need cell mentions `slides` in
    // prose style. Coverage must still report slides untaught.
    const masked = TABLE("| a quantitative comparison graphic (not `slides`) | `chart` |");
    const f = routingChecks(masked).filter((x) => x.checkId === "routing-verb-uncovered");
    expect(f.map((x) => x.message).join(" ")).toContain("slides");
  });

  it("a backticked non-verb in the NEED column is not an unknown-verb false positive", () => {
    const masked = TABLE("| the need cell may say `frobnicate` freely | `generate` |");
    expect(routingChecks(masked).filter((x) => x.checkId === "routing-unknown-verb")).toEqual([]);
  });

  it("fenced examples inside the section are ignored (same law as the template commandSpans helper)", () => {
    const fenced =
      "## Route table\n\n| Need class | Route |\n|---|---|\n| x | `generate` |\n\n" +
      "```\n| illustrative only | `frobnicate` |\n```\n\n## Next\n";
    expect(routingChecks(fenced).filter((x) => x.checkId === "routing-unknown-verb")).toEqual([]);
  });

  it("a missing need-routing.md is itself an error (the routing home must exist)", () => {
    const f = routingChecks(null);
    expect(f[0]?.checkId).toBe("routing-file-missing");
  });

  it("the REAL knowledge/need-routing.md covers every verb with zero unknowns", () => {
    const real = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "knowledge", "need-routing.md"), "utf8");
    expect(routingChecks(real)).toEqual([]);
  });
});
