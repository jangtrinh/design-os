/**
 * Per custom property: is it a token, and if not, for which one named reason (spec 009 P3, split out of
 * css-token-ingest.ts to keep that file under the Art IX budget). Pure, deterministic. A reference to another property
 * is settled afterwards, by the caller, once it is known which properties are written.
 */
import type { CustomPropertyObservation } from "./designmd-token-extractor.js";
import { classifySelector } from "./css-selector-mode.js";
import { parseVarRef, resolveValue } from "./css-token-paths.js";
import type { PathInfo } from "./css-token-paths.js";
import { LEFT_OUT } from "./css-token-ledger.js";
import type { LeftOutReason } from "./css-token-ledger.js";

export interface Planned {
  name: string;
  path: PathInfo;
  base: CustomPropertyObservation;
  /** The base value as the tree stores it: a literal, or an alias `{category.leaf}`. */
  baseValue: string | number;
  /** The property the base value names, when it is an alias. */
  aliasOf: string | null;
  /** One declaration per mode, the first met. */
  modes: Map<string, CustomPropertyObservation>;
}

export type Outcome =
  | { kind: "planned"; planned: Planned; notes: string[] }
  | { kind: "left-out"; reason: LeftOutReason; notes: string[]; message: string };

const selectorOf = (e: CustomPropertyObservation): string => e.selectors[0] ?? "";
const leftOut = (reason: LeftOutReason, notes: string[], message: string): Outcome => ({ kind: "left-out", reason, notes, message });

export function planProperty(
  name: string,
  entries: CustomPropertyObservation[],
  path: PathInfo | null,
  pathByName: Map<string, PathInfo | null>,
): Outcome {
  if (path === null) {
    // Every declaration is an alias whose chain ends at a value that is not one leaf, or a literal that is not one.
    const refs = entries.map((e) => parseVarRef(e.value));
    if (refs.every((r) => r !== null)) return leftOut(LEFT_OUT.aliasLeftOut, [], `alias names '${refs[0]}', which was left out`);
    return leftOut(LEFT_OUT.notOneLeaf, [], `unmappable value on every declaration (e.g. '${entries[0]?.value}')`);
  }

  const classified = entries.map((e) => ({ e, cls: classifySelector(selectorOf(e)) }));
  const notes = classified
    .filter(({ cls }) => cls.kind === "unmapped")
    .map(({ e }) => `declaration under unrecognized selector '${selectorOf(e) || "(none)"}' (${e.sources[0] ?? "?"}) — not a mode`);

  const base = classified.find((c) => c.cls.kind === "base")?.e;
  const modes = new Map<string, CustomPropertyObservation>();
  for (const { e, cls } of classified) {
    if (cls.kind === "modes") for (const m of cls.names) if (!modes.has(m)) modes.set(m, e);
  }

  if (base === undefined) {
    if (modes.size > 0) return leftOut(LEFT_OUT.noBase, notes, `declared only under mode(s) ${[...modes.keys()].join(", ")} — no base value; not promoted (D2)`);
    return leftOut(LEFT_OUT.unrecognisedSelector, notes, "no recognised base/mode selector for any declaration");
  }

  const aliasOf = parseVarRef(base.value);
  if (aliasOf !== null && !pathByName.has(aliasOf)) {
    return leftOut(LEFT_OUT.aliasNotInInput, notes, `alias names '${aliasOf}', which is not in the input`);
  }
  const baseValue = resolveValue(base.value, name.slice(2), pathByName);
  if (baseValue === null) {
    // A property in the input whose own value is not one leaf: the alias to it is left out with it.
    return aliasOf !== null
      ? leftOut(LEFT_OUT.aliasLeftOut, notes, `alias names '${aliasOf}', which was left out`)
      : leftOut(LEFT_OUT.notOneLeaf, notes, `could not resolve value '${base.value}'`);
  }
  return { kind: "planned", planned: { name, path, base, baseValue, aliasOf, modes }, notes };
}

/**
 * An alias is written only when the property it names is written: a planned token whose base value names a property
 * that is left out is itself left out, repeatedly, until nothing changes. Returns the names written.
 */
export function settleAliases(outcomes: Map<string, Outcome>): Set<string> {
  const written = new Set<string>();
  for (const [name, o] of outcomes) if (o.kind === "planned") written.add(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...written]) {
      const o = outcomes.get(name) as Extract<Outcome, { kind: "planned" }>;
      const target = o.planned.aliasOf;
      if (target === null || written.has(target)) continue;
      outcomes.set(name, leftOut(LEFT_OUT.aliasLeftOut, o.notes, `alias names '${target}', which was left out`));
      written.delete(name);
      changed = true;
    }
  }
  return written;
}
