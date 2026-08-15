/**
 * gradient-catalog checks (knowledge-gradient-catalog-check.ts) — the Art II
 * LINTER half of the ShaderGradient adoption pair. Pure, FS-free: every fixture
 * is an in-memory GradientCatalogCheckInput. See also
 * knowledge-gradient-matrix-emit.test.ts for the emitter half and its round-trip
 * proof that the two agree on row shape.
 */
import { describe, expect, it } from "vitest";

import { gradientCatalogChecks } from "../src/core/knowledge-gradient-catalog-check.js";
import type { GradientCatalogCheckInput } from "../src/core/knowledge-gradient-catalog-check.js";
import {
  parseGradientCatalog,
  parseGradientMatrixRows,
} from "../src/core/knowledge-gradient-catalog-parse.js";

const REVISION = "974a230b1e6c3ec375fbe17a8ea1c89edbc48019";

const CLEAN_ROWS = [
  "| Halo | `halo` | plane | a warm directional wash | not for cool grounds | Frozen field + warm token-derived linear gradient |",
  "| Mint | `mint` | waterPlane | a cool rippling ground | not for warm palettes | Frozen field + cool token-derived linear gradient |",
];

function catalogJson(
  overrides: { revision?: string; captured?: string; presets?: unknown; surfaces?: unknown } = {},
): string {
  return JSON.stringify({
    upstream: "https://github.com/ruucm/shadergradient",
    revision: overrides.revision ?? REVISION,
    captured: overrides.captured ?? "202606",
    license: "MIT",
    presets: overrides.presets ?? [
      { slug: "halo", name: "Halo", mesh: "plane", light: "3d", grain: true },
      { slug: "mint", name: "Mint", mesh: "waterPlane", light: "3d", grain: false },
    ],
    surfaces: overrides.surfaces ?? [
      { shader: "defaults", mesh: "plane" },
      { shader: "glass", mesh: "sphere" },
    ],
  });
}

function knowledgeFile(rows: readonly string[] = CLEAN_ROWS, revision: string = REVISION): string {
  return [
    "# ShaderGradient Field Direction",
    "",
    `Pinned revision: \`${revision}\`.`,
    "",
    "| Preset | slug | mesh | Narrative job | Anti-use | Required fallback |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

/**
 * `in`, not `??`. Both content fields are nullable and `null` is a MEANINGFUL
 * value here ("this file does not exist"), so `??` would silently substitute the
 * clean fixture for every absence case — three tests would then assert the clean
 * case while claiming to assert absence, and pass.
 */
function run(input: Partial<GradientCatalogCheckInput> = {}): readonly string[] {
  return gradientCatalogChecks({
    knowledgeFileContent: "knowledgeFileContent" in input ? (input.knowledgeFileContent ?? null) : knowledgeFile(),
    catalogJson: "catalogJson" in input ? (input.catalogJson ?? null) : catalogJson(),
    asOf: input.asOf ?? "202608",
  }).map((f) => f.checkId);
}

describe("gradient-catalog — the clean case", () => {
  it("a matching ledger and matrix produce no findings", () => {
    expect(run()).toEqual([]);
  });

  it("neither file adopted yet is silent, not an error", () => {
    expect(run({ knowledgeFileContent: null, catalogJson: null })).toEqual([]);
  });

  it("a ledger with no direction file yet is silent — adoption can land in either order", () => {
    expect(run({ knowledgeFileContent: null })).toEqual([]);
  });
});

describe("gradient-catalog — ledger presence and shape", () => {
  it("a direction file with no ledger fails missing-ledger", () => {
    expect(run({ catalogJson: null })).toEqual(["gradient-catalog-missing-ledger"]);
  });

  it("an unparseable ledger fails missing-ledger rather than crashing", () => {
    expect(run({ catalogJson: "{not json" })).toEqual(["gradient-catalog-missing-ledger"]);
  });

  it("a preset with a mesh outside the enum invalidates the whole ledger", () => {
    const bad = catalogJson({ presets: [{ slug: "halo", name: "Halo", mesh: "torus", light: "3d", grain: true }] });
    expect(run({ catalogJson: bad })).toEqual(["gradient-catalog-missing-ledger"]);
  });

  it("a preset with a non-boolean grain invalidates the whole ledger", () => {
    const bad = catalogJson({ presets: [{ slug: "halo", name: "Halo", mesh: "plane", light: "3d", grain: "on" }] });
    expect(run({ catalogJson: bad })).toEqual(["gradient-catalog-missing-ledger"]);
  });

  it("a duplicate preset slug invalidates the ledger — two rows claiming one matrix row is ambiguous", () => {
    const bad = catalogJson({
      presets: [
        { slug: "halo", name: "Halo", mesh: "plane", light: "3d", grain: true },
        { slug: "halo", name: "Halo Two", mesh: "sphere", light: "3d", grain: false },
      ],
    });
    expect(parseGradientCatalog(bad)).toBeNull();
  });

  it("a duplicate surface pair invalidates the ledger", () => {
    const bad = catalogJson({
      surfaces: [
        { shader: "defaults", mesh: "plane" },
        { shader: "defaults", mesh: "plane" },
      ],
    });
    expect(parseGradientCatalog(bad)).toBeNull();
  });
});

describe("gradient-catalog — revision drift", () => {
  it("a direction file with no SHA at all fails revision-drift", () => {
    const noSha = knowledgeFile(CLEAN_ROWS).replace(/Pinned revision: `[0-9a-f]{40}`\./, "No pin here.");
    expect(run({ knowledgeFileContent: noSha })).toEqual(["gradient-catalog-revision-drift"]);
  });

  it("a direction file pinned to a different SHA fails revision-drift", () => {
    const other = "0".repeat(40);
    expect(run({ knowledgeFileContent: knowledgeFile(CLEAN_ROWS, other) })).toEqual([
      "gradient-catalog-revision-drift",
    ]);
  });
});

describe("gradient-catalog — row/ledger cross-checks", () => {
  it("a matrix row absent from the ledger fails slug-unknown", () => {
    const rows = [...CLEAN_ROWS, "| Ghost | `ghost` | plane | x | y | Frozen field + z |"];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-slug-unknown"]);
  });

  it("a ledger preset with no matrix row fails slug-missing", () => {
    expect(run({ knowledgeFileContent: knowledgeFile([CLEAN_ROWS[0]!]) })).toEqual([
      "gradient-catalog-slug-missing",
    ]);
  });

  it("a drifted name cell fails row-drift", () => {
    const rows = [CLEAN_ROWS[0]!.replace("| Halo |", "| Halooo |"), CLEAN_ROWS[1]!];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-row-drift"]);
  });

  it("a drifted mesh cell fails row-drift", () => {
    const rows = [CLEAN_ROWS[0]!.replace("| plane |", "| sphere |"), CLEAN_ROWS[1]!];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-row-drift"]);
  });

  it("a row unknown to the ledger makes NO drift claim — slug-unknown alone fires", () => {
    // Guards the branch order: drift is keyed on the ledger entry, so a row with no
    // entry must not also be reported as drifted against nothing.
    const rows = [...CLEAN_ROWS, "| Ghost | `ghost` | sphere | x | y | Frozen field + z |"];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-slug-unknown"]);
  });
});

describe("gradient-catalog — the prose cells", () => {
  it("an empty prose cell fails field-empty", () => {
    const rows = [CLEAN_ROWS[0]!.replace("| a warm directional wash |", "|  |"), CLEAN_ROWS[1]!];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-field-empty"]);
  });

  it("an empty fallback cell fires field-empty ONCE, not also fallback-thin", () => {
    // One defect must not read as two — an empty cell trivially lacks 'frozen'.
    const rows = [
      CLEAN_ROWS[0]!.replace("| Frozen field + warm token-derived linear gradient |", "|  |"),
      CLEAN_ROWS[1]!,
    ];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-field-empty"]);
  });

  it("a fallback cell that never names the frozen state fails fallback-thin", () => {
    const rows = [
      CLEAN_ROWS[0]!.replace("| Frozen field + warm token-derived linear gradient |", "| a static image |"),
      CLEAN_ROWS[1]!,
    ];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual(["gradient-catalog-fallback-thin"]);
  });

  it("fallback-thin is case-insensitive — 'FROZEN' satisfies it", () => {
    const rows = [
      CLEAN_ROWS[0]!.replace("| Frozen field + warm", "| FROZEN field + warm"),
      CLEAN_ROWS[1]!,
    ];
    expect(run({ knowledgeFileContent: knowledgeFile(rows) })).toEqual([]);
  });
});

describe("gradient-catalog — staleness", () => {
  it("a capture within 6 months is silent", () => {
    expect(run({ asOf: "202611" })).toEqual([]);
  });

  it("a capture older than 6 months warns", () => {
    expect(run({ asOf: "202701" })).toEqual(["gradient-catalog-stale"]);
  });

  it("a malformed captured month does not warn — it cannot be aged", () => {
    expect(run({ catalogJson: catalogJson({ captured: "20260" }) })).toEqual([]);
  });
});

describe("gradient matrix row parser", () => {
  it("ignores a 6-column table whose slug cell is not backticked", () => {
    // The direction file carries other tables; only backticked-slug rows are matrix rows.
    const content = [
      "| Axis | Trigger | Required fallback | Why | Extra | More |",
      "|---|---|---|---|---|---|",
      "| Motion | reduce | frozen field | design intent | a | b |",
    ].join("\n");
    expect(parseGradientMatrixRows(content)).toEqual([]);
  });

  it("ignores the header and separator rows", () => {
    expect(parseGradientMatrixRows(knowledgeFile())).toHaveLength(CLEAN_ROWS.length);
  });

  it("strips backticks from the slug cell", () => {
    expect(parseGradientMatrixRows(knowledgeFile())[0]?.slug).toBe("halo");
  });
});
