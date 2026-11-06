/**
 * The gate's autofix family: one `autofix-not-clean` error PER pending repair, each
 * naming what it would touch so origin attribution can judge it.
 *
 * Why: a single "the autofixer would still apply N repair(s)" error had no subject,
 * so origin mode always counted it as authored — even when the only pending repairs
 * were a `:hover` rule an unmodified kit wrote and the raw-HTML `<img>` fallback
 * convention, neither of which the author can fix in their source.
 *
 * Subjects per repair:
 *  - hover-media-guard → the selector chain of every unguarded `:hover` rule (the
 *    same mask the checker and the repair share), so a kit-only hover class is kit
 *    and an authored one is authored.
 *  - img-onerror → `@tool img-onerror`: inline `onerror` plus a picsum fallback is
 *    the raw-HTML template's convention; a component framework handles image errors
 *    in its own code and never serialises them into the DOM.
 *  - any other repair → no subject, so it stays authored (fails safe).
 */
import type { FloorFindingBase } from "./finding-schema.js";
import type { AutofixFinding } from "./html-autofix.js";
import { chainOf, cssStructure } from "./css-declaration-sites.js";
import { blankStringLiterals, stripHoverGuardedBlocks } from "./layout-checks-hover.js";

/** Selector chains of the `:hover` rules outside any `@media (hover: hover)` guard, in <style> order. */
export function unguardedHoverSelectors(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1] ?? "";
    const masked = stripHoverGuardedBlocks(blankStringLiterals(css.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length))));
    const { blocks } = cssStructure(css);
    for (const h of masked.matchAll(/:hover\b/gi)) {
      // The rule whose selector holds this `:hover` opens at the next `{`.
      const open = masked.indexOf("{", h.index ?? 0);
      const idx = blocks.findIndex((b) => b.start === open);
      if (idx !== -1) out.add(chainOf(blocks, idx).join(" "));
    }
  }
  return [...out];
}

function subjectsFor(ruleId: string, html: string): string[] | undefined {
  if (ruleId === "img-onerror") return [`@tool ${ruleId}`];
  if (ruleId === "hover-media-guard") {
    const sel = unguardedHoverSelectors(html);
    return sel.length > 0 ? sel : undefined;
  }
  return undefined;
}

export function autofixRepairFindings(html: string, repairs: readonly AutofixFinding[]): FloorFindingBase[] {
  return repairs.map((r) => {
    const subjects = subjectsFor(r.ruleId, html);
    return {
      checkId: "autofix-not-clean",
      severity: "error" as const,
      message: `the autofixer would still apply ${r.ruleId} — run \`ui autofix --write\` first, then gate`,
      repairScope: "global" as const,
      ...(subjects !== undefined && { subjects }),
    };
  });
}
