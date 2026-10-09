/** Public kit command adapter; validation/prepare stay read-only. */
import { resolve } from "node:path";
import { adoptKit, KitAdoptionError } from "../core/ds-kit-adopt.js";
import { parseKitSpec, readKitJson } from "../core/ds-kit-parse.js";
import { emitKitTheme } from "../core/ds-kit-theme.js";
import { canonicalHash } from "../core/ds-manifest.js";
import { KitError } from "../core/ds-kit-types.js";
import { prepareKit, validateKit } from "../core/ds-kit-validate.js";
import { DSError, discoverDesignSystem, loadDesignSystem, pathsForDir } from "../core/design-system.js";
import { errJsonWithData, errText, ok, okJson, okJsonWithExit, type CommandResult } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { planKit } from "./ds-kit-plan-impl.js";

export function runKit(parsed: ParsedArgs): CommandResult {
  const operation = parsed.positionals[0], command = `ds kit ${operation ?? ""}`.trim();
  const reply = (data: unknown): CommandResult => parsed.json ? okJson(command, data) : ok(JSON.stringify(data, null, 2) + "\n");
  try {
    const allowed = operation === "plan" ? ["source", "kind", "tokens", "out", "name"] : operation === "adopt" ? ["out", "now"] : operation === "verify" ? ["dir"] : [];
    const unknown = findUnknownFlag(parsed.flags, allowed);
    if (unknown !== null) throw new KitAdoptionError("UNKNOWN_FLAG", unknownFlagMessage(unknown));
    if (parsed.repeatedFlags.size) throw new KitAdoptionError("BAD_ARG", "kit flags must occur exactly once");
    const flag = (name: string): string => {
      const value = parsed.flags[name];
      if (typeof value !== "string" || !value) throw new KitAdoptionError("BAD_ARG", `--${name} requires a nonempty value`);
      return value;
    };
    if (operation === "plan") {
      if (parsed.positionals.length !== 1) throw new KitAdoptionError("BAD_ARG", "kit plan takes flags only");
      const kind = flag("kind");
      if (kind !== "figma" && kind !== "registry") throw new KitAdoptionError("BAD_ARG", "--kind must be figma|registry");
      return reply(planKit({ source: flag("source"), kind, tokens: flag("tokens"), out: flag("out"), name: flag("name") }));
    }
    if (operation === "verify") {
      if (parsed.positionals.length !== 1) throw new KitAdoptionError("BAD_ARG", "kit verify takes --dir only");
      const paths = parsed.flags["dir"] !== undefined ? pathsForDir(resolve(flag("dir"), "design")) : discoverDesignSystem(undefined);
      const ds = loadDesignSystem(paths);
      if (!ds.kit) throw new KitAdoptionError("KIT_NOT_BOUND", "project has no adopted kit descriptor");
      const data = { name: ds.manifest.name, generation: ds.manifest.generation, kitStatus: ds.kit.status,
        ready: ds.kit.status === "verified", staleReasons: ds.kit.staleReasons, contentHash: ds.kit.contentHash, lockHash: ds.manifest.kit!.lockHash };
      return parsed.json ? okJsonWithExit(command, data, data.ready ? 0 : 1) : { ...reply(data), exitCode: data.ready ? 0 : 1 };
    }
    if (!["prepare", "validate", "adopt", "theme"].includes(operation ?? "") || parsed.positionals.length !== 2 || !parsed.positionals[1]) {
      throw new KitAdoptionError("BAD_ARG", "usage: ui ds kit plan|theme|prepare|validate|adopt|verify (theme/prepare/validate/adopt require <candidate-root>)");
    }
    const root = resolve(parsed.positionals[1]);
    if (operation === "theme") {
      const spec = parseKitSpec(readKitJson(root, "kit.json"));
      const css = emitKitTheme(readKitJson(root, spec.tokens), spec.aliases);
      return parsed.json ? okJson(command, { path: spec.theme, css }) : ok(css);
    }
    if (operation === "prepare") {
      const prepared = prepareKit(root);
      return reply({ complete: prepared.complete, contentHash: prepared.contentHash, tokensHash: prepared.tokensHash,
        registryHash: prepared.registryHash, capturedCount: prepared.capturedCount, mappingCount: prepared.spec.mappings.length, componentCount: prepared.registry.components.length,
        findings: prepared.findings, unresolvedIds: [...new Set([
          ...prepared.spec.mappings.filter((mapping) => mapping.disposition === "unresolved").map((mapping) => mapping.sourceId),
          ...prepared.findings.flatMap((finding) => finding.sourceId ? [finding.sourceId] : []),
        ])] });
    }
    if (operation === "validate") {
      const lock = validateKit(root);
      return reply({ status: lock.status, contentHash: lock.contentHash, lockHash: canonicalHash(lock),
        componentCount: lock.registry.components.length, contentCount: lock.content.length, evidenceCount: lock.evidence.length });
    }
    const ds = adoptKit(root, { out: flag("out"), ...(parsed.flags["now"] !== undefined && { now: flag("now") }) });
    return reply({ name: ds.manifest.name, dir: resolve(flag("out")), generation: ds.manifest.generation, kitStatus: ds.kit!.status,
      contentHash: ds.kit!.contentHash, lockHash: ds.manifest.kit!.lockHash });
  } catch (error) {
    const code = error instanceof KitAdoptionError || error instanceof DSError ? error.code :
      error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "BAD_KIT";
    const message = error instanceof Error ? error.message : String(error);
    const data = error instanceof KitError ? { findings: error.details } :
      error instanceof KitAdoptionError && error.reservation ? { reservation: error.reservation } : undefined;
    return parsed.json ? errJsonWithData(command, code, message, data) : errText(`ui: ${message}\n`);
  }
}
