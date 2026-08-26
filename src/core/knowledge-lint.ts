/**
 * The knowledge-core linter — the "unit tier" for knowledge/: free, runs on
 * every commit, no model call. It answers one question deterministically: has
 * the knowledge core drifted from its own conventions?
 *
 * Checks (findings-linter shape, per constitution Art II):
 *   index-missing-row             error    a knowledge/*.md with no README table row
 *   index-dead-row                 error    a table row pointing to a missing file
 *   persona-drift                   error    index ↔ family md ↔ personas.json disagree
 *   broken-xref                     error    a relative md link that doesn't resolve
 *   benchmark-stale                 warning  a benchmark DNA file older than 6 months
 *   provenance-bad-grammar          error    an ease:source marker missing/with a dead ref
 *   provenance-machine-local-ref    error    an ease:source ref into references/** or taste/**
 *                                             (fires on the ref prefix, never on resolution)
 *   effect-catalog-*                mixed    Canvas UI ledger↔matrix drift (see
 *                                             knowledge-effect-catalog-check.ts)
 *   gradient-catalog-*              mixed    ShaderGradient ledger↔matrix drift (see
 *                                             knowledge-gradient-catalog-check.ts)
 *   index-frontmatter-missing       error    a top-level knowledge/*.md with no routing block
 *   index-frontmatter-bad           error    a routing block unparseable, or id != filename
 *   index-drift                     error    knowledge/index.json != what the emitter produces
 *
 * This module is FS-FREE: it receives already-read content and returns findings,
 * so the command layer owns all IO and the checks stay pure and testable.
 */
import { indexChecks } from "./knowledge-index-check.js";
import { personaChecks } from "./knowledge-persona-check.js";
import { xrefChecks, provenanceChecks } from "./knowledge-link-check.js";
import { effectCatalogChecks } from "./knowledge-effect-catalog-check.js";
import { gradientCatalogChecks } from "./knowledge-gradient-catalog-check.js";
import { frontMatterChecks } from "./knowledge-frontmatter-check.js";
import { routingChecks } from "./knowledge-routing-check.js";
import { sourceLedgerChecks } from "./knowledge-source-ledger-check.js";
import { webTechniqueChecks } from "./knowledge-web-technique-check.js";
import { capabilityChecks } from "./knowledge-capability-check.js";
import { SKILL_NAMES, WORKFLOW_VERBS } from "../adapters/templates.js";
import { COMMAND_SIGNATURES } from "./command-signatures.js";
import { VERB_SKILL_REFS } from "../adapters/skill-refs.js";
import type { CapabilityPilotReceiptCheck } from "./capability-pilot-receipt.js";
// monthsBetween was a third local copy of the same 12-line helper (the other two were
// in knowledge-effect-catalog-parse.ts). Shared-layer rule: one definition, three
// consumers — a fix to the staleness arithmetic can no longer miss two of them.
import { monthsBetween } from "./knowledge-ledger-provenance.js";

export interface KnowledgeFinding {
  checkId: string;
  severity: "error" | "warning";
  message: string;
}

/** Command-validated receipt result; this FS-free kernel only turns it into a finding. */
export interface CapabilityPilotReceiptValidation {
  capabilityId: string;
  result: CapabilityPilotReceiptCheck;
}

export interface KnowledgeLintInput {
  /** Every existing knowledge-relative file path (posix separators), any extension. */
  files: readonly string[];
  /** Knowledge-relative path → content, for every `.md` file under knowledge/ (incl READMEs). */
  mdContents: Readonly<Record<string, string>>;
  /** Raw personas/personas.json bytes, or null when missing/unreadable. */
  personasJson: string | null;
  /** Repo-relative paths (knowledge/**, references/**) an ease:source ref may target. */
  repoFiles: readonly string[];
  /** Staleness reference month, `YYYYMM`. */
  asOf: string;
  /** Raw knowledge/index.json bytes, or null when the file is missing. */
  committedIndex?: string | null;
  /** knowledge/canvas-ui/catalog.json content, or null/absent when missing.
   * Optional so existing fixtures that predate the Canvas UI adoption (spec 028)
   * keep typechecking without an edit — absent is treated identically to null. */
  canvasCatalogJson?: string | null;
  /** knowledge/shader-gradient/catalog.json content, or null/absent when missing.
   * Optional for the same reason as canvasCatalogJson — fixtures that predate the
   * ShaderGradient adoption keep typechecking, and absent is treated as null. */
  gradientCatalogJson?: string | null;
  /** Tracked Phase 1 source-ledger manifest and its fixed parts. */
  sourceLedgerJson?: string | null;
  sourceLedgerParts?: Readonly<Record<string, string>>;
  /** Future Phase 3 technique catalog; absent is meaningful during Phase 2. */
  webTechniqueCatalogJson?: string | null;
  /** Capability catalog. Undefined skips the check for legacy unit fixtures; null means missing. */
  capabilityCatalogJson?: string | null;
  /** Exact-byte pilot receipt results prepared by the command layer. */
  capabilityPilotReceipts?: readonly CapabilityPilotReceiptValidation[];
}

const STALE_MONTHS = 6;

/** benchmark-stale: benchmarks/<slug>--<YYYYMM>.dna.json older than 6 months vs asOf. */
function benchmarkChecks(files: readonly string[], asOf: string): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  for (const rel of files) {
    const m = /(?:^|\/)benchmarks\/[^/]+--(\d{6})\.dna\.json$/.exec(rel);
    if (m === null || m[1] === undefined) continue;
    const age = monthsBetween(m[1], asOf);
    if (age !== null && age > STALE_MONTHS) {
      findings.push({
        checkId: "benchmark-stale",
        severity: "warning",
        message: `'${rel}' is ${age} months old (captured ${m[1]}, > ${STALE_MONTHS} months as of ${asOf}) — re-capture its DNA`,
      });
    }
  }
  return findings;
}

/** Sort: errors before warnings, then by checkId, then by message — deterministic. */
function sortFindings(findings: KnowledgeFinding[]): KnowledgeFinding[] {
  return [...findings].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.checkId.localeCompare(b.checkId) ||
      a.message.localeCompare(b.message),
  );
}

/** Only the persona family markdown files (personas/*.md, excluding any README). */
function personaFiles(mdContents: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rel, content] of Object.entries(mdContents)) {
    if (/^personas\/[^/]+\.md$/.test(rel) && !/README\.md$/.test(rel)) out[rel] = content;
  }
  return out;
}

/** Run all seven checks over pre-read knowledge content. */
export function lintKnowledge(input: KnowledgeLintInput): KnowledgeFinding[] {
  const readme = input.mdContents["README.md"] ?? "";
  const findings: KnowledgeFinding[] = [
    ...indexChecks(readme, input.files),
    ...personaChecks(input.mdContents["persona-index.md"], personaFiles(input.mdContents), input.personasJson),
    ...xrefChecks(input.mdContents, input.files),
    ...benchmarkChecks(input.files, input.asOf),
    ...provenanceChecks(input.mdContents, input.repoFiles),
    ...effectCatalogChecks({
      knowledgeFileContent: input.mdContents["canvas-effect-direction.md"] ?? null,
      catalogJson: input.canvasCatalogJson ?? null,
      asOf: input.asOf,
    }),
    ...gradientCatalogChecks({
      knowledgeFileContent: input.mdContents["shader-gradient-direction.md"] ?? null,
      catalogJson: input.gradientCatalogJson ?? null,
      asOf: input.asOf,
    }),
    ...sourceLedgerChecks({ manifestJson: input.sourceLedgerJson ?? null, parts: input.sourceLedgerParts ?? {}, files: input.files }),
    ...webTechniqueChecks({
      ledgerJson: input.sourceLedgerJson ?? null, ledgerParts: input.sourceLedgerParts ?? {},
      catalogJson: input.webTechniqueCatalogJson ?? null, files: input.files, mdContents: input.mdContents,
      skillNames: SKILL_NAMES, verbSkillRefs: VERB_SKILL_REFS,
    }),
    ...frontMatterChecks(input.mdContents, input.committedIndex ?? null),
    // The agent-expertise ship-gate: the need→verb route table stays in exact
    // parity with the live verb registry, both directions (see routing-check).
    ...routingChecks(input.mdContents["need-routing.md"] ?? null),
    ...(input.capabilityCatalogJson === undefined ? [] : capabilityChecks({
      catalogJson: input.capabilityCatalogJson,
      knowledgeIndexJson: input.committedIndex ?? null,
      needRoutingMd: input.mdContents["need-routing.md"] ?? null,
      workflowVerbs: WORKFLOW_VERBS,
      commandNames: commandNames(),
      repoFiles: input.repoFiles,
    })),
    ...pilotReceiptFindings(input.capabilityPilotReceipts ?? []),
  ];
  return sortFindings(findings);
}

function pilotReceiptFindings(validations: readonly CapabilityPilotReceiptValidation[]): KnowledgeFinding[] {
  return validations.flatMap(({ capabilityId, result }) => {
    if (result.ok) return [];
    const checkId = result.code === "PILOT_RECEIPT_MISSING"
      ? "capability-pilot-receipt-missing"
      : "capability-pilot-receipt-invalid";
    return [{ checkId, severity: "error", message: `'${capabilityId}' ${result.code}: ${result.message}` }];
  });
}

function commandNames(): string[] {
  return Object.entries(COMMAND_SIGNATURES).flatMap(([name, schema]) => [
    name,
    ...Object.keys(schema.subcommands ?? {}).map((subcommand) => `${name} ${subcommand}`),
  ]);
}
