/**
 * Rung 7 — `ds-new: <Name>`. A new component is allowed and never blocks, but it must be
 * marked, reasoned, and genuinely absent from the registry. The dodges that make a registered
 * component look new are all folded away first: separators and case (`Button / Primary`), a
 * variant suffix (`Button/Primary (State=Hover)`), and a composition of registered names.
 * A name merely close to a registered one gets a hint on its item, never a finding.
 */
import type { CheckContext, DsNewItem } from "./reuse-plan-types.js";
import { splitComposition, splitVariantUse, stripTicks } from "./reuse-plan-names.js";
import { isPlaceholderReason } from "./reuse-plan-reason.js";

type Flag = (code: string, message: string) => void;

export const DS_NEW_RE = /^ds-new\s*:\s*(.*)$/i;

export function checkNew(
  match: RegExpExecArray | null, use: string, reason: string, slot: string,
  ctx: CheckContext, flag: Flag, record: (item: Pick<DsNewItem, "name" | "reason" | "hint">) => void,
): void {
  if (match === null) {
    flag("NEW_MISSING_PREFIX", `rung 7 is a new component: write 'ds-new: ${stripTicks(use) || "<Name>"}' so it is listed for the owner`);
    return;
  }
  const name = stripTicks(match[1] ?? "");
  if (name.length === 0) { flag("NEW_WITHOUT_NAME", "'ds-new:' has no component name after it"); return; }

  const base = splitVariantUse(name)?.name ?? name;
  const wholeIsRegistered = ctx.names.has(base) || ctx.names.foldedMatch(base) !== undefined;
  const members = base.includes("+") && !wholeIsRegistered ? splitComposition(base) : [base];
  const found = members.map((m) => (ctx.names.has(m) ? m : ctx.names.foldedMatch(m)));
  if (found.every((f): f is string => f !== undefined)) {
    const via = members.map((m, i) => (m === found[i] ? `'${m}'` : `'${m}' as '${found[i]}'`)).join(", ");
    flag("NOT_NEW", `${via} ${members.length > 1 ? "are all" : "is"} already registered — rung ${members.length > 1 ? "5 (a composition)" : "3"}, not a new component`);
    return;
  }
  if (isPlaceholderReason(reason, slot)) {
    flag("NEW_WITHOUT_REASON", `new component '${name}' needs a real reason — say why nothing in the registry fits (empty and placeholder reasons do not count)`);
    return;
  }
  const near = members.length === 1 ? ctx.names.nearIdentical(base).slice(0, 2) : [];
  record({
    name, reason: reason.trim(),
    ...(near.length > 0 ? { hint: `close to registered ${near.map((n) => `'${n}'`).join(", ")} — check rung 3 first` } : {}),
  });
}
