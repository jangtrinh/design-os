/** `ui ksync census <manifest.json> --pins <pins.json>` — built / placeholder / orphan / parked, and how much of built is pinned. */
import { okJson, ok } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { computeCensus, readLabels, readManifest, STATUSES } from "../core/ksync-census.js";
import type { Status } from "../core/ksync-census.js";
import { parsePins, PinsError } from "../core/ksync-pins.js";
import { failWith, KsyncCliError, readJsonFile, requiredFlag, stringFlag } from "../core/ksync-cli-io.js";

const wrap = <T>(code: string, path: string, fn: () => T): T => {
  try { return fn(); } catch (e) { throw e instanceof KsyncCliError ? e : new KsyncCliError(code, `${path}: ${e instanceof Error ? e.message : String(e)}`); }
};

export function runCensus(parsed: ParsedArgs): CommandResult {
  try {
    const manifestPath = parsed.positionals[0];
    if (manifestPath === undefined) throw new KsyncCliError("BAD_ARG", "ui ksync census requires <routes.json|route-manifest.json>");
    const pinsPath = requiredFlag(parsed, "pins");
    const assume = stringFlag(parsed, "assume-unlisted");
    if (assume !== undefined && !(STATUSES as readonly string[]).includes(assume)) throw new KsyncCliError("BAD_ARG", `--assume-unlisted must be one of ${STATUSES.join("|")}`);
    const labelsPath = stringFlag(parsed, "labels");
    const registryPath = stringFlag(parsed, "registry");

    const entries = wrap("BAD_MANIFEST", manifestPath, () => readManifest(readJsonFile(manifestPath, "manifest", "Pass the route manifest the project generates.")));
    const pins = wrap("BAD_PINS", pinsPath, () => {
      try { return parsePins(readJsonFile(pinsPath, "pins file", "Create it with 'ui ksync pin <route> --file <key> --node <id>'.")); }
      catch (e) { throw e instanceof PinsError ? new Error(e.message) : e; }
    });
    const labels = labelsPath === undefined ? undefined : wrap("BAD_LABELS", labelsPath, () => readLabels(readJsonFile(labelsPath, "labels file", "It lists entries with their built/placeholder/orphan/parked status.")));
    const registry = registryPath === undefined ? undefined : wrap("BAD_REGISTRY", registryPath, () => {
      const doc = readJsonFile(registryPath, "registry", "Pass the component registry JSON ({version, components}).");
      const comps = (doc as { components?: unknown } | null)?.components;
      if (!Array.isArray(comps)) throw new Error("registry needs a 'components' array");
      return comps as { figmaNode?: unknown }[];
    });

    const census = computeCensus({ entries, pins: pins.pins, ...(labels !== undefined ? { labels } : {}), ...(assume !== undefined ? { assumeUnlisted: assume as Status } : {}), ...(registry !== undefined ? { registry } : {}) });
    if (parsed.json) return okJson("ksync census", census);
    const c = census.counts;
    const pct = census.pinnedOfBuiltPct === null ? "n/a (no built entries labeled)" : `${census.pinnedOfBuiltPct}% (${census.builtPinned}/${c.built})`;
    const table = census.perApp.map((a) => `  ${a.app.padEnd(24)} ${String(a.built).padStart(5)} ${String(a.placeholder).padStart(11)} ${String(a.orphan).padStart(6)} ${String(a.parked).padStart(6)} ${String(a.unlabeled).padStart(9)} ${String(a.pinned).padStart(6)}`);
    const lines = [
      `ksync census: ${census.entries} entries — built ${c.built} / placeholder ${c.placeholder} / orphan ${c.orphan} / parked ${c.parked} / unlabeled ${c.unlabeled}`,
      ...(census.assumption === null ? [] : [`  note: ${census.assumption}`]),
      `pins: ${census.pins.total} (${census.pins.matchedToManifest} match a manifest frame, ${census.pins.unmatched} do not) in ${census.pins.appsWithPins}/${census.pins.appsTotal} apps; pinned-of-built ${pct}`,
      ...(census.registry === null ? [] : [`registry: ${census.registry.withFigmaNode}/${census.registry.total} components have figmaNode (${census.registry.withoutFigmaNode} without)`]),
      `  ${"app".padEnd(24)} ${"built".padStart(5)} ${"placeholder".padStart(11)} ${"orphan".padStart(6)} ${"parked".padStart(6)} ${"unlabeled".padStart(9)} ${"pinned".padStart(6)}`,
      ...table,
    ];
    return ok(`${lines.join("\n")}\n`);
  } catch (e) {
    if (e instanceof KsyncCliError) return failWith(parsed, "census", e);
    throw e;
  }
}
