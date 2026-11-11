/**
 * The closing section of DESIGN.md: the ledger and everything that was left out, by name. Appended after every other
 * section. Counts are always complete; names are listed up to ten per reason and the rest is counted, so the doc
 * stays readable on a file with thousands of items (the `--json` envelope carries the full list).
 */
import type { BindingReport, ComponentFinal } from "./figma-ds-ingest-components.js";
import { ledgerLines } from "./figma-ds-ledger.js";
import type { ExclusionReason, Ledger } from "./figma-ds-ledger.js";

/** One excluded item, named. */
export interface NamedExclusion { id: string; name: string; where?: string }

/** What was left out because the owner did not keep it, named. */
export interface DesignExclusions {
  collections: { name: string; count: number }[];
  pages: { name: string; count: number }[];
  /** Per owner-ruled reason, every excluded item with its id and name (the envelope lists them all). */
  items?: Partial<Record<ExclusionReason, NamedExclusion[]>>;
}

/** The hosts that write the sensed fields; the row says which scan supplies what a scan lacks. */
export const SENSING_HOSTS = "the Figma plugin scan (figma-agent scan-design-system) or the DESIGN:OS Studio scan";

/** How many names a text surface shows per reason before it points at the full list. */
export const NAMES_SHOWN_PER_REASON = 10;

function bindingLines(b: BindingReport): string[] {
  const parts = [`${b.sensed} sensed, ${b.notSensed} not-sensed`];
  if (b.sensed > 0) parts.push(`${b.linked} bound variable(s) linked to tokens`);
  const ex = [
    ...b.excluded.collections.map((c) => `${c.count} into the left-out collection ${c.name === "" ? "(no collection)" : c.name}`),
    ...(b.excluded.notWritten > 0 ? [`${b.excluded.notWritten} into variables that are not tokens`] : []),
    ...(b.excluded.outsideScan > 0 ? [`${b.excluded.outsideScan} into variables outside the scan (remote)`] : []),
    ...(b.excluded.unsafePath > 0 ? [`${b.excluded.unsafePath} onto token paths the registry cannot hold`] : []),
  ];
  return [
    `- **Component → token links:** ${parts.join("; ")}`,
    ...(ex.length > 0 ? [`- **Bindings left out:** ${ex.join("; ")}`] : []),
    ...(b.notSensed > 0 ? [`- **Not sensed:** the scan carries no \`boundVariables\` for ${b.notSensed} component(s); they come from ${SENSING_HOSTS}.`] : []),
  ];
}

/** `name, name, … +N more (full list with --json)`; every name when there are ten or fewer. */
export function namedList(items: readonly NamedExclusion[]): string {
  const shown = items.slice(0, NAMES_SHOWN_PER_REASON).map((i) => `\`${i.name}\`${i.where === undefined ? "" : ` (${i.where})`}`).join(", ");
  const more = items.length - NAMES_SHOWN_PER_REASON;
  return more > 0 ? `${shown}, +${more} more (full list with \`--json\`)` : shown;
}

/** The excluded items by owner-ruled reason, each reason on one line with at most ten names. */
export function leftOutLines(exclusions: DesignExclusions | undefined): string[] {
  return Object.entries(exclusions?.items ?? {}).filter(([, list]) => (list?.length ?? 0) > 0)
    .map(([reason, list]) => `${reason} (${list?.length ?? 0}): ${namedList(list ?? [])}`);
}

export interface LedgerBlockInput {
  ledger?: Ledger | undefined;
  exclusions?: DesignExclusions | undefined;
  frames?: ComponentFinal["frames"] | undefined;
  bindings?: BindingReport | undefined;
}

/** The closing section: the ledger and everything that was left out, by name. */
export function ledgerBlock(input: LedgerBlockInput): string[] {
  const { ledger, exclusions, frames, bindings } = input;
  if (ledger === undefined) return [];
  const out = ["## Ledger", "", ...ledgerLines(ledger).map((l) => `- ${l}`), ""];
  const byReason = leftOutLines(exclusions).map((l) => `- ${l}`);
  const left = [
    ...(exclusions?.collections ?? []).map((c) => `- Collection \`${c.name === "" ? "(no collection)" : c.name}\`: ${c.count} variable(s) left out`),
    ...(exclusions?.pages ?? []).map((p) => `- Page \`${p.name}\`: ${p.count} node(s) left out`),
    ...byReason,
  ];
  if (left.length > 0) out.push("### Left out, named", "", ...left, "");
  if (frames !== null && frames !== undefined) {
    out.push("### Existing screens (frames)", "", ...frames.pages.map((p) => `- \`${p.name}\`: ${p.frames} frame(s), ${p.instanceBuilt} built from instances${p.kept ? "" : " — left out"}`), "");
  }
  if (bindings !== undefined && bindings.sensed + bindings.notSensed > 0) out.push("### Component links", "", ...bindingLines(bindings), "");
  return out;
}
