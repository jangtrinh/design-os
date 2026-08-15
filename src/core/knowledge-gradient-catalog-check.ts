/**
 * The ShaderGradient gradient-catalog checks — the Art II LINTER half of the
 * pair (the emitter half is knowledge-gradient-matrix-emit.ts). Checks over
 * `knowledge/shader-gradient-direction.md`'s preset matrix against
 * `knowledge/shader-gradient/catalog.json`:
 *
 *   gradient-catalog-missing-ledger  direction file exists, ledger doesn't (or won't parse)
 *   gradient-catalog-revision-drift  40-hex SHA note in the direction file != ledger revision
 *   gradient-catalog-slug-unknown    matrix row not in the ledger
 *   gradient-catalog-slug-missing    ledger preset has no matrix row
 *   gradient-catalog-field-empty     Narrative job / Anti-use / Required fallback blank
 *   gradient-catalog-row-drift       matrix `Preset`/`mesh` cells disagree with the ledger
 *   gradient-catalog-fallback-thin   a Required fallback cell that never names the frozen state
 *   gradient-catalog-stale           (warning) captured > 6 months before --as-of
 *
 * gradient-catalog-fallback-thin is this pair's analogue of the Canvas UI
 * Draco clause: the one refusal that is specific to THIS capability rather
 * than generic ledger hygiene. Every field carries two independent fallbacks
 * (reduced-motion -> frozen field; no-WebGL -> token-derived CSS gradient), and
 * the measured failure mode is shipping one of them as though it were both. A
 * fallback cell that never names the frozen state is that failure in the
 * matrix itself, so it fails here rather than in review.
 *
 * FS-FREE (Art IV) — src/commands/knowledge.ts owns IO and hands already-read
 * strings in. Parsing lives in knowledge-gradient-catalog-parse.ts (Art IX split).
 */
import type { KnowledgeFinding } from "./knowledge-lint.js";
import { extractRevisionToken, monthsBetween } from "./knowledge-ledger-provenance.js";
import {
  parseGradientCatalog,
  parseGradientMatrixRows,
} from "./knowledge-gradient-catalog-parse.js";

const STALE_MONTHS = 6;

export interface GradientCatalogCheckInput {
  /** knowledge/shader-gradient-direction.md content, or null when the file doesn't exist. */
  knowledgeFileContent: string | null;
  /** knowledge/shader-gradient/catalog.json content, or null when missing. */
  catalogJson: string | null;
  /** Staleness reference month, `YYYYMM`. */
  asOf: string;
}

/** Run all gradient-catalog checks over pre-read content. */
export function gradientCatalogChecks(input: GradientCatalogCheckInput): KnowledgeFinding[] {
  const { knowledgeFileContent, catalogJson, asOf } = input;
  if (knowledgeFileContent === null && catalogJson === null) return []; // nothing adopted yet

  const catalog = catalogJson === null ? null : parseGradientCatalog(catalogJson);

  if (knowledgeFileContent !== null && catalog === null) {
    return [
      {
        checkId: "gradient-catalog-missing-ledger",
        severity: "error",
        message:
          "knowledge/shader-gradient-direction.md exists but knowledge/shader-gradient/catalog.json is missing or unparseable",
      },
    ];
  }

  if (knowledgeFileContent === null || catalog === null) return []; // ledger-only: nothing to check yet

  const findings: KnowledgeFinding[] = [];
  const rows = parseGradientMatrixRows(knowledgeFileContent);
  const bySlug = new Map(catalog.presets.map((p) => [p.slug, p]));
  const rowSlugs = new Set(rows.map((r) => r.slug));

  const revisionToken = extractRevisionToken(knowledgeFileContent);
  if (revisionToken === null || revisionToken !== catalog.revision) {
    findings.push({
      checkId: "gradient-catalog-revision-drift",
      severity: "error",
      message:
        revisionToken === null
          ? "knowledge/shader-gradient-direction.md has no pinned-revision note to verify against knowledge/shader-gradient/catalog.json"
          : `knowledge/shader-gradient-direction.md's pinned revision '${revisionToken}' does not match knowledge/shader-gradient/catalog.json's revision '${catalog.revision}'`,
    });
  }

  for (const row of rows) {
    // row.mesh is read for exactly one purpose: reporting drift. No other check
    // keys on the matrix cell — they all key on the ledger entry, which is the
    // authority a drifted cell is drifting FROM.
    const entry = bySlug.get(row.slug);
    if (entry === undefined) {
      findings.push({
        checkId: "gradient-catalog-slug-unknown",
        severity: "error",
        message: `matrix row slug '${row.slug}' is not in knowledge/shader-gradient/catalog.json`,
      });
    } else {
      // Deterministic within a row (Art I.2): name before mesh.
      if (row.name !== entry.name) {
        findings.push({
          checkId: "gradient-catalog-row-drift",
          severity: "error",
          message: `matrix row '${row.slug}' name '${row.name}' does not match knowledge/shader-gradient/catalog.json's '${entry.name}'`,
        });
      }
      if (row.mesh !== entry.mesh) {
        findings.push({
          checkId: "gradient-catalog-row-drift",
          severity: "error",
          message: `matrix row '${row.slug}' mesh '${row.mesh}' does not match knowledge/shader-gradient/catalog.json's '${entry.mesh}'`,
        });
      }
    }

    if (row.narrativeJob.trim() === "" || row.antiUse.trim() === "" || row.requiredFallback.trim() === "") {
      findings.push({
        checkId: "gradient-catalog-field-empty",
        severity: "error",
        message: `matrix row '${row.slug}' has an empty Narrative job, Anti-use, or Required fallback cell`,
      });
    } else if (!/frozen/i.test(row.requiredFallback)) {
      // Only when the cell HAS prose — an empty cell is already reported above,
      // and reporting it twice would make one defect look like two.
      findings.push({
        checkId: "gradient-catalog-fallback-thin",
        severity: "error",
        message: `matrix row '${row.slug}' Required fallback never names the frozen state — a field needs the reduced-motion fallback AND the no-WebGL fallback, not one standing in for both`,
      });
    }
  }

  for (const p of catalog.presets) {
    if (!rowSlugs.has(p.slug)) {
      findings.push({
        checkId: "gradient-catalog-slug-missing",
        severity: "error",
        message: `ledger preset '${p.slug}' has no matrix row in knowledge/shader-gradient-direction.md`,
      });
    }
  }

  const age = monthsBetween(catalog.captured, asOf);
  if (age !== null && age > STALE_MONTHS) {
    findings.push({
      checkId: "gradient-catalog-stale",
      severity: "warning",
      message: `knowledge/shader-gradient/catalog.json was captured ${catalog.captured}, ${age} months before ${asOf} (> ${STALE_MONTHS} months) — re-check the pinned revision`,
    });
  }

  return findings;
}
