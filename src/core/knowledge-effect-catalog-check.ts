/**
 * The Canvas UI effect-catalog checks — the Art II LINTER half of the pair
 * (the emitter half is knowledge-effect-matrix-emit.ts). Eight checks over
 * `knowledge/canvas-effect-direction.md`'s matrix against
 * `knowledge/canvas-ui/catalog.json` (spec 028 §8.2). Checks: missing-ledger ·
 * revision-drift (40-hex SHA note != catalog revision) · slug-unknown (row not
 * in ledger) · slug-missing (ledger slug has no row) · field-empty (Narrative
 * job/Anti-use/Required fallback blank) · row-drift (matrix `Effect`/`family`
 * cells disagree with the ledger entry of the same slug — C1, Amendment 2) ·
 * draco-missing (`object` row's fallback lacks the Draco clause, keyed on the
 * LEDGER entry's family, never the matrix's — a row's own family cell may be
 * drifted, which is exactly what row-drift reports) · stale (warning,
 * catalog.json.captured > 6 months before --as-of).
 *
 * Together, slug-unknown + slug-missing + row-drift close all three matrix
 * "machine columns" (`Effect`, `slug`, `family`) against the ledger: slug
 * membership is covered by the first two, and row-drift covers the two
 * remaining cells for slugs that DO match. FS-FREE (Art IV) —
 * src/commands/knowledge.ts owns IO and hands already-read strings in.
 * Parsing lives in knowledge-effect-catalog-parse.ts (Art IX split, C1 —
 * this module crossed 200 lines once row-drift was added).
 */
import type { KnowledgeFinding } from "./knowledge-lint.js";
import {
  extractRevisionToken,
  monthsBetween,
  parseCatalog,
  parseMatrixRows,
} from "./knowledge-effect-catalog-parse.js";

const STALE_MONTHS = 6;

export interface EffectCatalogCheckInput {
  /** knowledge/canvas-effect-direction.md content, or null when the file doesn't exist. */
  knowledgeFileContent: string | null;
  /** knowledge/canvas-ui/catalog.json content, or null when missing. */
  catalogJson: string | null;
  /** Staleness reference month, `YYYYMM`. */
  asOf: string;
}

/** Run all eight effect-catalog checks over pre-read content. */
export function effectCatalogChecks(input: EffectCatalogCheckInput): KnowledgeFinding[] {
  const { knowledgeFileContent, catalogJson, asOf } = input;
  if (knowledgeFileContent === null && catalogJson === null) return []; // nothing adopted yet

  const catalog = catalogJson === null ? null : parseCatalog(catalogJson);

  if (knowledgeFileContent !== null && catalog === null) {
    return [
      {
        checkId: "effect-catalog-missing-ledger",
        severity: "error",
        message:
          "knowledge/canvas-effect-direction.md exists but knowledge/canvas-ui/catalog.json is missing or unparseable",
      },
    ];
  }

  if (knowledgeFileContent === null || catalog === null) return []; // ledger-only: nothing to check yet

  const findings: KnowledgeFinding[] = [];
  const rows = parseMatrixRows(knowledgeFileContent);
  const catalogBySlug = new Map(catalog.effects.map((e) => [e.slug, e]));
  const rowSlugs = new Set(rows.map((r) => r.slug));

  const revisionToken = extractRevisionToken(knowledgeFileContent);
  if (revisionToken === null || revisionToken !== catalog.revision) {
    findings.push({
      checkId: "effect-catalog-revision-drift",
      severity: "error",
      message:
        revisionToken === null
          ? "knowledge/canvas-effect-direction.md has no pinned-revision note to verify against knowledge/canvas-ui/catalog.json"
          : `knowledge/canvas-effect-direction.md's pinned revision '${revisionToken}' does not match knowledge/canvas-ui/catalog.json's revision '${catalog.revision}'`,
    });
  }

  for (const row of rows) {
    // row.family is read for exactly one purpose below: reporting drift. Every
    // other check (draco-missing) keys on the ledger entry's family, never this cell.
    const ledgerEntry = catalogBySlug.get(row.slug);
    if (ledgerEntry === undefined) {
      findings.push({
        checkId: "effect-catalog-slug-unknown",
        severity: "error",
        message: `matrix row slug '${row.slug}' is not in knowledge/canvas-ui/catalog.json`,
      });
    } else {
      // Deterministic within a row (Art I.2, D2d(b)): name before family.
      if (row.name !== ledgerEntry.name) {
        findings.push({
          checkId: "effect-catalog-row-drift",
          severity: "error",
          message: `matrix row '${row.slug}' name '${row.name}' does not match knowledge/canvas-ui/catalog.json's '${ledgerEntry.name}'`,
        });
      }
      if (row.family !== ledgerEntry.family) {
        findings.push({
          checkId: "effect-catalog-row-drift",
          severity: "error",
          message: `matrix row '${row.slug}' family '${row.family}' does not match knowledge/canvas-ui/catalog.json's '${ledgerEntry.family}'`,
        });
      }
    }

    if (row.narrativeJob.trim() === "" || row.antiUse.trim() === "" || row.requiredFallback.trim() === "") {
      findings.push({
        checkId: "effect-catalog-field-empty",
        severity: "error",
        message: `matrix row '${row.slug}' has an empty Narrative job, Anti-use, or Required fallback cell`,
      });
    }
    // An empty fallback cell is already reported by effect-catalog-field-empty;
    // only fire here when there IS fallback prose but it omits the Draco clause.
    // A slug absent from the ledger makes no Draco claim — slug-unknown already fired.
    if (
      ledgerEntry !== undefined &&
      ledgerEntry.family === "object" &&
      row.requiredFallback.trim() !== "" &&
      !/draco/i.test(row.requiredFallback)
    ) {
      findings.push({
        checkId: "effect-catalog-draco-missing",
        severity: "error",
        message: `matrix row '${row.slug}' is ledger family 'object' but its Required fallback cell has no Draco clause`,
      });
    }
  }

  for (const e of catalog.effects) {
    if (!rowSlugs.has(e.slug)) {
      findings.push({
        checkId: "effect-catalog-slug-missing",
        severity: "error",
        message: `ledger slug '${e.slug}' has no matrix row in knowledge/canvas-effect-direction.md`,
      });
    }
  }

  const age = monthsBetween(catalog.captured, asOf);
  if (age !== null && age > STALE_MONTHS) {
    findings.push({
      checkId: "effect-catalog-stale",
      severity: "warning",
      message: `knowledge/canvas-ui/catalog.json was captured ${catalog.captured}, ${age} months before ${asOf} (> ${STALE_MONTHS} months) — re-check the pinned revision`,
    });
  }

  return findings;
}
