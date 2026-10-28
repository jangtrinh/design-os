/**
 * Two things stylesheets say that the shared cascade does not carry, both needed to
 * see every tint:
 *
 *  - `@apply a b c`: Tailwind utilities written inside a rule. The cascade reads
 *    declarations only, so a `border-white/10` applied through `.card { @apply … }`
 *    is invisible to it. Each selected element is handed those utilities as if they
 *    were on its `class` attribute.
 *  - `::before` / `::after` rules: the cascade matches elements, and a pseudo-element
 *    is not one. The rule's surface declarations are returned with the element that
 *    generates the box, which is where the box sits (over that element's own surface).
 *
 * Selector matching is the shared engine's (`selectMatching`). A rule no element
 * carries has no parent to composite over and yields nothing. `@media` blocks are
 * skipped, as in the cascade: a conditional rule is not the resting state.
 */
import parse from "css-tree/parser";
import walk from "css-tree/walker";
import generate from "css-tree/generator";
import type * as csstree from "css-tree";
import type { Document, Element } from "domhandler";
import type { Computed, ComputedStyle } from "./extractors/html/css-cascade.js";
import { selectMatching } from "./extractors/html/css-selector-match.js";
import type { EmbeddedSheet } from "./extractors/html/html-dom.js";

export interface AppliedClass { name: string; line: number }

export interface RuleExtras {
  /** Utilities `@apply`'d to an element by a rule that selects it. */
  applied: Map<Element, AppliedClass[]>;
  /** Surface declarations of `::before` / `::after` rules, with the element that generates the box. */
  overlays: Array<{ el: Element; style: ComputedStyle }>;
}

/** Cheap necessary condition, so the common page pays no second stylesheet parse. */
const HAS_EXTRAS = /@apply\b|:{1,2}(?:before|after)\b/i;
const TRAILING_PSEUDO_ELEMENT = /::?(?:before|after)\s*$/i;
const SURFACE_PROP = /^(?:background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|box-shadow|outline(?:-color)?)$/;

export function readRuleExtras(doc: Document, sheets: readonly EmbeddedSheet[], lineAt: (offset: number) => number): RuleExtras {
  const extras: RuleExtras = { applied: new Map(), overlays: [] };
  for (const sheet of sheets) {
    if (!HAS_EXTRAS.test(sheet.css)) continue;
    let ast: csstree.CssNode;
    try { ast = parse(sheet.css, { positions: true }) as csstree.CssNode; } catch { continue; }
    const lineOf = (node: csstree.CssNode): number =>
      lineAt(sheet.externalPath === undefined ? sheet.offset + (node.loc?.start.offset ?? 0) : sheet.offset);

    walk(ast, {
      visit: "Rule",
      enter(node) {
        const atrule = (this as unknown as { atrule?: csstree.Atrule | null }).atrule ?? null;
        if (atrule !== null && atrule.name === "media") return;
        const rule = node as csstree.Rule;
        if (rule.prelude.type !== "SelectorList") return;

        const applies: AppliedClass[] = [];
        const surface = new Map<string, Computed>();
        rule.block.children.forEach((child) => {
          if (child.type === "Atrule" && child.name === "apply" && child.prelude !== null) {
            const line = lineOf(child);
            for (const name of generate(child.prelude).split(/\s+/)) if (name !== "") applies.push({ name: name.replace(/!$/, ""), line });
          } else if (child.type === "Declaration" && SURFACE_PROP.test(child.property.toLowerCase())) {
            surface.set(child.property.toLowerCase(), { value: generate(child.value).trim(), line: lineOf(child), specificity: 0, important: child.important === true });
          }
        });
        if (applies.length === 0 && surface.size === 0) return;

        for (const selector of generate(rule.prelude).split(",").map((s) => s.trim())) {
          const pseudo = TRAILING_PSEUDO_ELEMENT.exec(selector);
          const base = pseudo === null ? selector : selector.slice(0, pseudo.index).trim();
          if (base === "" || (pseudo === null && applies.length === 0)) continue;
          let carriers: Element[];
          try { carriers = selectMatching(base, doc); } catch { continue; }
          for (const el of carriers) {
            if (pseudo === null) extras.applied.set(el, [...(extras.applied.get(el) ?? []), ...applies]);
            else if (surface.size > 0) extras.overlays.push({ el, style: surface });
          }
        }
      },
    });
  }
  return extras;
}
