/**
 * Report model and text rendering for `ui ds reseal` (preview, nothing-to-reseal, apply).
 * Everything user-controlled that reaches the terminal goes through forTerminal().
 */
import { basename } from "node:path";

import { countTokens } from "../core/design-system.js";
import type { DesignSystem, DesignSystemPaths, HashDrift } from "../core/design-system.js";
import { forTerminal } from "../core/output.js";
import { describeShadowed } from "./ds-reseal-guards.js";
import type { RegistrySwitch, ShadowedRegistry } from "./ds-reseal-guards.js";

export interface DriftReport {
  file: "tokens" | "registry";
  path: string;
  manifestHash: string;
  currentHash: string;
  unit: "tokens" | "components";
  /** The manifest records hashes only, so the count at seal time is not knowable. */
  before: null;
  after: number;
}

export function describeDrift(ds: DesignSystem, d: HashDrift): DriftReport {
  const tokens = d.file === "tokens";
  return {
    file: d.file,
    path: basename(tokens ? ds.paths.tokens : ds.paths.registry),
    manifestHash: d.expected,
    currentHash: d.actual,
    unit: tokens ? "tokens" : "components",
    before: null,
    after: tokens ? countTokens(ds.tokens) : ds.registry.components.length,
  };
}

/** "tokens=sha256-…; registry=sha256-…" — one part per drifted file, in a fixed order. */
export const hashList = (drift: DriftReport[], pick: "manifestHash" | "currentHash"): string =>
  drift.map((d) => `${d.file}=${d[pick]}`).join("; ");

export function previewText(paths: DesignSystemPaths, ds: DesignSystem, drift: DriftReport[], registrySwitch?: RegistrySwitch, shadowed?: ShadowedRegistry): string {
  const lines = [`ui ds reseal — preview, nothing written (${paths.dir})`, ""];
  for (const d of drift) {
    lines.push(
      `${d.path}  (${d.file})`,
      `  manifest hash : ${d.manifestHash}`,
      `  current hash  : ${d.currentHash}`,
      `  ${d.unit}: ${d.after} now; the count at seal time is not recorded in the manifest`,
    );
  }
  if (registrySwitch !== undefined) {
    const { sealed, resolved } = registrySwitch;
    lines.push(
      "registry file switch (not hash drift)",
      `  sealed file   : ${sealed.path}  ${sealed.hash}  ${sealed.components} components (still matches the manifest)`,
      `  resolved file : ${resolved.path}  ${resolved.hash}  ${resolved.components} components (what the store loads now)`,
    );
  }
  const shown = new Set<string>(drift.map((d) => d.file));
  if (registrySwitch !== undefined) shown.add("registry");
  for (const f of (["tokens", "registry"] as const).filter((x) => !shown.has(x))) {
    lines.push(`${basename(f === "tokens" ? paths.tokens : paths.registry)}  (${f})  hash matches the seal`);
  }
  if (shadowed !== undefined) lines.push(describeShadowed(shadowed, paths));
  lines.push("");
  if (registrySwitch !== undefined) {
    lines.push("--apply would be refused (RESEAL_REGISTRY_SWITCHED): remove or rename the resolved file first, or re-register through ui registry.");
  } else {
    lines.push(`Manifest is at generation ${ds.manifest.generation}. Adopt these hashes with:`,
      '  ui ds reseal --apply --reason "<why the drift is legitimate>"');
  }
  return lines.join("\n") + "\n";
}

export function appliedText(
  paths: DesignSystemPaths, drift: DriftReport[], from: number, to: number, reason: string, shadowed?: ShadowedRegistry,
): string {
  return `ui ds reseal: re-sealed ${drift.map((d) => d.path).join(", ")} (gen ${from} → gen ${to})\n` +
    drift.map((d) => `  ${d.path}: ${d.manifestHash} → ${d.currentHash}`).join("\n") +
    `\n  reason recorded in the manifest changelog: ${forTerminal(reason, 256)}\n` +
    (shadowed === undefined ? "" : `  ${describeShadowed(shadowed, paths)}\n`);
}
