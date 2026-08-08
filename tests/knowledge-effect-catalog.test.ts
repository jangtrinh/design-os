/**
 * effect-catalog checks (knowledge-effect-catalog-check.ts) — the Art II LINTER
 * half of the Canvas UI adoption pair (spec 028 §8.2, §9). Pure, FS-free: every
 * fixture is an in-memory EffectCatalogCheckInput. See also
 * knowledge-effect-matrix-emit.test.ts for the emitter half and its M6
 * round-trip proof that the two agree on row shape.
 */
import { describe, expect, it } from "vitest";

import { effectCatalogChecks } from "../src/core/knowledge-effect-catalog-check.js";
import type { EffectCatalogCheckInput } from "../src/core/knowledge-effect-catalog-check.js";

const REVISION = "728550d4523e1b8bef834b64b3e936c215cad630";

const CLEAN_ROWS = [
  "| Asciify | `asciify` | live-html | inspection lens | no novelty use | plain HTML |",
  "| Dithered Object | `dithered-object` | object | retro 3D | no generic use | self-hosted Draco decoder only, never the default Google-hosted CDN |",
];

function catalogJson(overrides: { revision?: string; captured?: string; effects?: unknown } = {}): string {
  return JSON.stringify({
    upstream: "https://github.com/DavidHDev/canvas-ui",
    revision: overrides.revision ?? REVISION,
    captured: overrides.captured ?? "202607",
    license: "MIT + Commons Clause",
    effects: overrides.effects ?? [
      { slug: "asciify", name: "Asciify", family: "live-html", overlayFallback: true },
      { slug: "dithered-object", name: "Dithered Object", family: "object", overlayFallback: false },
    ],
  });
}

function knowledgeMd(rows: string[] = CLEAN_ROWS): string {
  return [
    "# Canvas UI External-Effect Direction",
    "",
    `Pinned revision: \`${REVISION}\``,
    "",
    "| Effect | slug | family | Narrative job | Anti-use | Required fallback |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function input(overrides: Partial<EffectCatalogCheckInput> = {}): EffectCatalogCheckInput {
  return {
    knowledgeFileContent: knowledgeMd(),
    catalogJson: catalogJson(),
    asOf: "202607",
    ...overrides,
  };
}

const ids = (i: EffectCatalogCheckInput): string[] => effectCatalogChecks(i).map((f) => f.checkId);

describe("effectCatalogChecks — clean + absent", () => {
  it("returns zero findings on a matching ledger + matrix", () => {
    expect(effectCatalogChecks(input())).toEqual([]);
  });

  it("returns zero findings when both the ledger and the knowledge file are absent", () => {
    expect(effectCatalogChecks({ knowledgeFileContent: null, catalogJson: null, asOf: "202607" })).toEqual([]);
  });

  it("returns zero findings when only the ledger exists (nothing authored yet)", () => {
    expect(
      effectCatalogChecks({ knowledgeFileContent: null, catalogJson: catalogJson(), asOf: "202607" }),
    ).toEqual([]);
  });
});

describe("effectCatalogChecks — effect-catalog-missing-ledger", () => {
  it("fires when the knowledge file exists but the ledger is missing", () => {
    expect(ids(input({ catalogJson: null }))).toContain("effect-catalog-missing-ledger");
  });

  it("fires when the ledger is unparseable", () => {
    expect(ids(input({ catalogJson: "{not json" }))).toContain("effect-catalog-missing-ledger");
  });

  it("[R] fires when an effect carries the removed family:'overlay' value", () => {
    const bad = catalogJson({
      effects: [{ slug: "asciify", name: "Asciify", family: "overlay", overlayFallback: true }],
    });
    expect(ids(input({ catalogJson: bad }))).toContain("effect-catalog-missing-ledger");
  });

  it("[R] fires when an effect is missing overlayFallback", () => {
    const bad = catalogJson({ effects: [{ slug: "asciify", name: "Asciify", family: "live-html" }] });
    expect(ids(input({ catalogJson: bad }))).toContain("effect-catalog-missing-ledger");
  });

  it("[R] fires when an effect's overlayFallback is not a boolean", () => {
    const bad = catalogJson({
      effects: [{ slug: "asciify", name: "Asciify", family: "live-html", overlayFallback: "true" }],
    });
    expect(ids(input({ catalogJson: bad }))).toContain("effect-catalog-missing-ledger");
  });
});

describe("effectCatalogChecks — effect-catalog-revision-drift", () => {
  it("fires when the knowledge file's revision note does not match the ledger", () => {
    const md = knowledgeMd().replace(REVISION, "0000000000000000000000000000000000000000");
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-revision-drift");
  });

  it("fires when the knowledge file has no revision note at all", () => {
    const md = knowledgeMd().replace(`Pinned revision: \`${REVISION}\`\n\n`, "");
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-revision-drift");
  });
});

describe("effectCatalogChecks — effect-catalog-slug-unknown", () => {
  it("fires for a matrix row whose slug is not in the ledger", () => {
    const md = knowledgeMd([...CLEAN_ROWS, "| Ghost | `ghost` | live-html | nothing | nothing | nothing |"]);
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-slug-unknown");
  });
});

describe("effectCatalogChecks — effect-catalog-slug-missing", () => {
  it("fires for a ledger slug with no matrix row", () => {
    const md = knowledgeMd([CLEAN_ROWS[0]!]);
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-slug-missing");
  });
});

describe("effectCatalogChecks — effect-catalog-field-empty", () => {
  it("fires when a matrix row has an empty Anti-use cell", () => {
    const md = knowledgeMd([
      "| Asciify | `asciify` | live-html | inspection lens |  | plain HTML |",
      CLEAN_ROWS[1]!,
    ]);
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-field-empty");
  });
});

describe("effectCatalogChecks — effect-catalog-draco-missing", () => {
  it("fires when an object-family row's fallback has no Draco clause", () => {
    const md = knowledgeMd([
      CLEAN_ROWS[0]!,
      "| Dithered Object | `dithered-object` | object | retro 3D | no generic use | poster image only |",
    ]);
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-draco-missing");
  });
});

describe("effectCatalogChecks — effect-catalog-row-drift (C1, Amendment 2)", () => {
  it("[R2] (a) relabel: an object row mislabeled live-html with its Draco clause dropped fires BOTH row-drift (family) and draco-missing — this fixture yields ZERO findings against the pre-C1 linter (recorded in docs/research/canvas-ui/implementation-evidence-260725.md)", () => {
    const md = knowledgeMd([
      CLEAN_ROWS[0]!,
      "| Dithered Object | `dithered-object` | live-html | retro 3D | no generic use | poster image only |",
    ]);
    const findings = effectCatalogChecks(input({ knowledgeFileContent: md }));
    const drift = findings.filter((f) => f.checkId === "effect-catalog-row-drift");
    expect(drift).toHaveLength(1);
    expect(drift[0]!.message).toContain("family 'live-html' does not match");
    expect(ids(input({ knowledgeFileContent: md }))).toContain("effect-catalog-draco-missing");
  });

  it("[R2] (b) display-name drift: Effect cell != ledger name, same slug, fires row-drift on name", () => {
    const md = knowledgeMd([
      "| Asciified | `asciify` | live-html | inspection lens | no novelty use | plain HTML |",
      CLEAN_ROWS[1]!,
    ]);
    const drift = effectCatalogChecks(input({ knowledgeFileContent: md })).filter(
      (f) => f.checkId === "effect-catalog-row-drift",
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]!.message).toContain("name 'Asciified' does not match knowledge/canvas-ui/catalog.json's 'Asciify'");
  });

  it("[R2] (c) both fields drift: exactly two findings, ordered name before family", () => {
    const md = knowledgeMd([
      "| Asciified | `asciify` | object | inspection lens | no novelty use | plain HTML |",
      CLEAN_ROWS[1]!,
    ]);
    const drift = effectCatalogChecks(input({ knowledgeFileContent: md })).filter(
      (f) => f.checkId === "effect-catalog-row-drift",
    );
    expect(drift).toHaveLength(2);
    expect(drift[0]!.message).toContain("name 'Asciified'");
    expect(drift[1]!.message).toContain("family 'object'");
  });

  it("[R2] (d) unknown slug makes no Draco claim, whatever its family cell says", () => {
    const md = knowledgeMd([
      CLEAN_ROWS[0]!,
      CLEAN_ROWS[1]!,
      "| Ghost | `ghost` | object | nothing | nothing | nothing (no draco clause) |",
    ]);
    const found = ids(input({ knowledgeFileContent: md }));
    expect(found).toContain("effect-catalog-slug-unknown");
    expect(found).not.toContain("effect-catalog-draco-missing");
    expect(found.filter((c) => c === "effect-catalog-row-drift")).toHaveLength(0);
  });

  it("[R2] (e) no false positives on a clean matrix — backticks, spacing, case normalise like the row parser already does", () => {
    const md = knowledgeMd([
      "|  Asciify  |  `asciify`  | live-html | inspection lens | no novelty use | plain HTML |",
      CLEAN_ROWS[1]!,
    ]);
    expect(ids(input({ knowledgeFileContent: md }))).not.toContain("effect-catalog-row-drift");
  });
});

describe("effectCatalogChecks — effect-catalog-stale", () => {
  it("warns when captured is more than 6 months before asOf", () => {
    const findings = effectCatalogChecks(input({ asOf: "202702" }));
    const stale = findings.filter((f) => f.checkId === "effect-catalog-stale");
    expect(stale.length).toBe(1);
    expect(stale[0]!.severity).toBe("warning");
  });

  it("does not warn within the 6-month window", () => {
    expect(ids(input({ asOf: "202612" }))).not.toContain("effect-catalog-stale");
  });
});
