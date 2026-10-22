/**
 * One slot row: rung validity, the per-rung rule for its Use, lifecycle-marked names,
 * rung-4 variant values, and rung-6 token paths. Returns the rung when the row parsed
 * into a valid 1-7 rung so the caller can count it.
 */
import type { PlanRow } from "./reuse-plan-parse.js";
import type { CheckContext, DsNewItem, Sink } from "./reuse-plan-types.js";
import { didYouMean, splitComposition, splitTokenPaths, splitVariantPairs, splitVariantUse, stripTicks } from "./reuse-plan-names.js";
import { checkNew, DS_NEW_RE } from "./reuse-plan-check-new.js";
import { isPlaceholderReason } from "./reuse-plan-reason.js";
import { lifecycleOf } from "./lifecycle-name.js";
import { tokenExistsInTree } from "./registry-token-check.js";

const VALID_VALUES_SHOWN = 20;

export function checkRow(row: PlanRow, screenName: string, ctx: CheckContext, sink: Sink, dsNew: DsNewItem[]): number | null {
  const slot = row.cells[0] ?? "";
  if (row.cells.length !== 4) {
    sink.error("BAD_ROW", row.line, slot || null, `slot row has ${row.cells.length} cell(s), expected 4 (Slot | Rung | Use | Reason)`);
    return null;
  }
  const [, rungRaw = "", useRaw = "", reasonRaw = ""] = row.cells;
  const rungText = stripTicks(rungRaw);
  const rung = /^[1-7]$/.test(rungText) ? Number(rungText) : null;
  if (rung === null) {
    sink.error("BAD_RUNG", row.line, slot, `rung '${rungText}' is not a ladder rung — use an integer 1-7`);
    return null;
  }
  const use = useRaw.trim();
  const flag = (code: string, message: string): void => sink.error(code, row.line, slot, message);
  const newMatch = DS_NEW_RE.exec(use);

  if (rung === 1) {
    if (isPlaceholderReason(reasonRaw, slot)) flag("SKIP_WITHOUT_REASON", "rung 1 (the UI need not exist) needs a real reason — say why this slot is dropped");
    return rung;
  }
  if (rung === 7) {
    checkNew(newMatch, use, reasonRaw, slot, ctx, flag, (item) => dsNew.push({ ...item, screen: screenName, slot, line: row.line }));
    return rung;
  }
  if (newMatch !== null) {
    flag("NEW_AT_WRONG_RUNG", `'ds-new:' belongs at rung 7, not rung ${rung} — a new component is the last rung`);
    return rung;
  }
  if (use.length === 0) { flag("EMPTY_USE", `rung ${rung} needs a Use — name what is reused`); return rung; }

  /** Membership + lifecycle for a registered name. Returns true when the name is registered. */
  const requireRegistered = (name: string): boolean => {
    if (!ctx.names.has(name)) {
      flag("UNKNOWN_COMPONENT", `'${name}' is not in the registry (exact name required)${didYouMean(ctx.names.suggest(name))}`);
      return false;
    }
    const life = lifecycleOf(name);
    if (life === "retired") flag("LIFECYCLE_NAME", `'${name}' is marked archived/deprecated in the registry — pick its replacement, not a retired component`);
    else if (life === "review") sink.warn("REVIEW_NAME", row.line, slot, `'${name}' is still marked [REVIEW] — confirm it is approved before building on it`);
    return true;
  };

  if (rung === 2) {
    const name = stripTicks(use);
    if (!ctx.names.hasTemplates) requireRegistered(name);
    else if (ctx.names.templateSource(name) === "design/patterns") return rung;
    else if (ctx.names.has(name) && ctx.names.templateSource(name) === null) {
      flag("RUNG2_NOT_TEMPLATE", `'${name}' is a registered component, not a screen or pattern template — rung 2 needs a Pattern/* entry or a design/patterns file; a component belongs at rung 3`);
    } else if (!ctx.names.has(name)) {
      flag("UNKNOWN_COMPONENT", `'${name}' is not a template (Pattern/* or design/patterns file)${didYouMean(ctx.names.suggest(name, "templates"))}`);
    } else requireRegistered(name);
  } else if (rung === 3) {
    requireRegistered(stripTicks(use));
  } else if (rung === 4) {
    const v = splitVariantUse(use);
    if (v === null) flag("BAD_VARIANT", "rung 4 needs 'Name (Axis=Value)' — a variant or state of a registered component");
    else if (requireRegistered(v.name)) checkVariantValues(v.name, v.variant, ctx, flag);
  } else if (rung === 5) {
    const members = splitComposition(use);
    if (members.length < 2 || members.some((m) => m.length === 0)) flag("BAD_COMPOSITION", "rung 5 needs two or more registered names joined by '+'");
    else members.forEach(requireRegistered);
  } else {
    checkTokens(use, ctx, flag);
  }
  return rung;
}

/** Each `Axis=Value` must be one the record declares; a record with no variants is syntax-only. */
function checkVariantValues(name: string, variant: string, ctx: CheckContext, flag: (code: string, message: string) => void): void {
  const valid = ctx.names.variantsOf(name);
  if (valid.length === 0) return;
  for (const pair of splitVariantPairs(variant)) {
    const bare = pair.includes("=") ? pair.slice(pair.indexOf("=") + 1).trim() : pair;
    if (valid.includes(pair) || valid.includes(bare)) continue;
    const shown = valid.slice(0, VALID_VALUES_SHOWN).join(", ") + (valid.length > VALID_VALUES_SHOWN ? `, … (+${valid.length - VALID_VALUES_SHOWN} more)` : "");
    flag("BAD_VARIANT_VALUE", `'${pair}' is not a variant of '${name}' — registered: ${shown}`);
  }
}

function checkTokens(use: string, ctx: CheckContext, flag: (code: string, message: string) => void): void {
  const paths = splitTokenPaths(use);
  if (paths.length === 0) { flag("EMPTY_USE", "rung 6 needs token paths, e.g. 'spacing.4, colors.surface'"); return; }
  const tree = ctx.tokens();
  for (const path of paths) {
    if (typeof tree === "string") flag("UNRESOLVED_TOKEN", `token '${path}' cannot be checked — ${tree}`);
    else if (!tokenExistsInTree(tree, path)) flag("UNRESOLVED_TOKEN", `token '${path}' does not exist in the design system tokens`);
  }
}
