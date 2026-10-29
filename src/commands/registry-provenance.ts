/**
 * Ground-truth provenance for `ui registry register`.
 *
 * Once a design system is sealed (`design/ds.manifest.json` exists next to the registry), a component
 * is accepted only with a verified source reference (`--source-ref`) or an explicit, reasoned synthetic
 * approval (`--synthetic-approved --reason`), and only if its markup passes the design system's usage
 * lint and the owner-promoted token-ban rules. Before the seal nothing is required, but a flag that is
 * given is still verified and recorded.
 *
 * Check order (nothing is written by this module, so a refusal at any step leaves the store untouched):
 * flag shape -> source verification -> markup lint.
 *
 * Not covered here: composition-contract rules (they do not exist yet) and whether the markup matches
 * the referenced slice (the reference proves where the markup claims to come from, not that it equals it).
 */
import { existsSync } from "node:fs";
import type { FloorFindingBase } from "../core/finding-schema.js";
import type { DesignSystemPaths } from "../core/design-system.js";
import { loadDsUsageGateInput, runDsUsageFamily } from "../core/ds-usage-gate.js";
import { RegistryError } from "../core/registry-store.js";
import type { ComponentProvenance } from "../core/registry-store.js";
import { sha256OfText, verifySourceRef } from "./registry-provenance-refs.js";

export interface RegisterProvenanceResult {
  /** Absent only on an unsealed store when no provenance flag was given. */
  provenance?: ComponentProvenance;
  /** Non-blocking notes (lint warnings, checks that did not run), printed by the caller. */
  warnings: string[];
}

interface ProvenanceFlags {
  sourceRef?: string;
  syntheticApproved: boolean;
  reason?: string;
}

const badArg = (message: string): RegistryError => new RegistryError("BAD_ARG", message);

function stringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw badArg(`--${key} requires a value`);
  return v;
}

function parseFlags(flags: Record<string, string | boolean>): ProvenanceFlags {
  const sourceRef = stringFlag(flags, "source-ref");
  const reason = stringFlag(flags, "reason");
  const approval = flags["synthetic-approved"];
  if (approval !== undefined && approval !== true) {
    throw badArg("--synthetic-approved takes no value (put it before another --flag, or use --synthetic-approved --reason \"<text>\")");
  }
  const syntheticApproved = approval === true;
  if (sourceRef !== undefined && syntheticApproved) {
    throw badArg("--source-ref and --synthetic-approved are mutually exclusive: give the source of the markup, or approve it as synthetic, not both");
  }
  if (reason !== undefined && !syntheticApproved) {
    throw badArg("--reason is only valid with --synthetic-approved");
  }
  if (syntheticApproved && (reason === undefined || reason.trim() === "")) {
    throw badArg("--synthetic-approved requires a non-empty --reason \"<text>\" saying why no source exists");
  }
  if (sourceRef !== undefined && sourceRef.trim() === "") {
    throw badArg("--source-ref requires a value: <path>:<startLine>[-<endLine>] or figma:<nodeId>");
  }
  return { ...(sourceRef !== undefined && { sourceRef }), syntheticApproved, ...(reason !== undefined && { reason: reason.trim() }) };
}

function describeFindings(findings: readonly FloorFindingBase[]): string {
  return findings.map((f) => {
    const text = f.message.length > 140 ? `${f.message.slice(0, 137)}...` : f.message;
    return `  - ${f.checkId}${f.line === undefined ? "" : ` (line ${f.line})`}: ${text}`;
  }).join("\n");
}

/** Lint `markup` as the gate does; throws REGISTRY_MARKUP_DRIFT on any error finding. Returns the warnings. */
function lintMarkup(markup: string, paths: DesignSystemPaths): string[] {
  let input;
  try {
    input = loadDsUsageGateInput({ ...(existsSync(paths.tokens) && { tokensPath: paths.tokens }), designDir: paths.dir });
  } catch (e) {
    const code = e !== null && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "READ_ERROR";
    throw new RegistryError(code, `cannot lint the markup against the design system: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (input === undefined) {
    return [`markup not linted: '${paths.tokens}' and the promoted rules under '${paths.dir}' give nothing to judge it against`];
  }
  const out = runDsUsageFamily(markup, input);
  const errors = out.findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    throw new RegistryError(
      "REGISTRY_MARKUP_DRIFT",
      `REGISTRY_MARKUP_DRIFT: the markup breaks the design system (${errors.length} error(s)); nothing was registered:\n${describeFindings(errors)}`,
    );
  }
  return [
    ...out.findings.map((f) => `warning ${f.checkId}${f.line === undefined ? "" : ` (line ${f.line})`}: ${f.message}`),
    ...out.skipped.map((s) => `skipped ${s}`),
    ...out.notes,
  ];
}

/**
 * Decide the provenance of a component about to be registered and gate it on the design system.
 * @param flags  The parsed flags of the register call (`source-ref`, `synthetic-approved`, `reason`).
 * @param paths  The resolved store: its `manifest` decides sealed, its `dir` is where the project root and inventories hang from.
 * @throws RegistryError with BAD_ARG, REGISTRY_MISSING_SOURCE_REF, REGISTRY_BAD_SOURCE_REF or REGISTRY_MARKUP_DRIFT.
 */
export function resolveRegisterProvenance(
  flags: Record<string, string | boolean>,
  markup: string,
  paths: DesignSystemPaths,
): RegisterProvenanceResult {
  const given = parseFlags(flags);
  const sealed = existsSync(paths.manifest);

  let provenance: ComponentProvenance | undefined;
  if (given.sourceRef !== undefined) {
    provenance = verifySourceRef(given.sourceRef, paths.dir);
  } else if (given.syntheticApproved) {
    provenance = { kind: "synthetic-approved", sourceRef: "synthetic", sha256: sha256OfText(markup), reason: given.reason! };
  } else if (sealed) {
    throw new RegistryError(
      "REGISTRY_MISSING_SOURCE_REF",
      "REGISTRY_MISSING_SOURCE_REF: this design system is sealed, so a component needs its ground truth — pass " +
        "--source-ref <path>:<startLine>-<endLine> (or figma:<nodeId>), or --synthetic-approved --reason \"<text>\"",
    );
  }

  const warnings = sealed ? lintMarkup(markup, paths) : [];
  return { ...(provenance !== undefined && { provenance }), warnings };
}
