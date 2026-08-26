/**
 * Resolve the CSS cascade into per-element computed declarations.
 *
 * This is what the raw-string linters could never do. `LAYOUT_PROP_RE` scoped
 * inside `@keyframes` once let `transition: width` through across 22 files in
 * four products, because a regex over the source cannot know which rule wins for
 * which element. Here, selectors are matched against the real DOM and ordered by
 * specificity and document position, so the value a rule reads is the value that
 * will render.
 *
 * Deliberate limits, each stated rather than silently approximated:
 *  - Only same-document `<style>` sheets are read; a remote `<link>` is reported
 *    unresolved by html-dom, never fetched.
 *  - `@media` blocks are collected under their condition and applied only when
 *    the caller asks for that condition — an unconditional apply would report
 *    mobile-only rules as if they were always on.
 *  - Shorthands are NOT expanded. A rule asking for `padding-left` will not see
 *    a `padding: 16px` shorthand; callers that need both ask for both.
 */
import * as csstree from "css-tree";
import { selectAll } from "css-select";
import type { Document, Element } from "domhandler";
import { lineOfOffset } from "./html-dom.js";
import type { EmbeddedSheet } from "./html-dom.js";
import { expandShorthand, isExpandableShorthand } from "./css-shorthands.js";

/** One winning declaration for one element. */
export interface Computed {
  value: string;
  /** 1-based line in the HTML source where the declaration was written. */
  line: number;
  specificity: number;
  important: boolean;
  /** The `@media` condition this came from, when it was inside one. */
  media?: string;
}

/** prop → winning declaration. */
export type ComputedStyle = Map<string, Computed>;

export interface CascadeResult {
  /** Element → its computed declarations. Elements with no rules are absent. */
  byElement: Map<Element, ComputedStyle>;
  /** Selectors css-select could not handle, so the caller can say so. */
  unsupportedSelectors: string[];
  /** Declarations seen inside `@media`, kept out of the default cascade. */
  mediaConditions: string[];
}

/**
 * a/b/c specificity, packed into one comparable number.
 *
 * Computed from the selector text rather than the AST: the three counts are all
 * that matter for ordering, and the text form keeps this readable. Pseudo
 * ELEMENTS (`::before`) count as type; pseudo CLASSES (`:hover`) as class.
 */
export function specificityOf(selector: string): number {
  const cleaned = selector.replace(/\s*[>+~]\s*/g, " ");
  const ids = (cleaned.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (cleaned.match(/\.[\w-]+/g) ?? []).length +
    (cleaned.match(/\[[^\]]+\]/g) ?? []).length +
    (cleaned.match(/(?<!:):(?!:)[\w-]+/g) ?? []).length;
  const types =
    (cleaned.match(/(?:^|[\s(])([a-z][\w-]*)/gi) ?? []).length + (cleaned.match(/::[\w-]+/g) ?? []).length;
  return ids * 10000 + classes * 100 + types;
}

/** Inline `style=""` beats every stylesheet rule that is not `!important`. */
const INLINE_SPECIFICITY = 1000000;

interface RawDecl {
  selector: string;
  prop: string;
  value: string;
  important: boolean;
  specificity: number;
  order: number;
  line: number;
  media?: string;
}

/** Walk one stylesheet into a flat declaration list. */
function declarationsOf(sheet: EmbeddedSheet, source: string, startOrder: number): {
  decls: RawDecl[];
  media: string[];
} {
  const decls: RawDecl[] = [];
  const media: string[] = [];
  let order = startOrder;

  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(sheet.css, { positions: true });
  } catch {
    return { decls, media };
  }

  csstree.walk(ast, {
    visit: "Rule",
    enter(node, item, list) {
      void item;
      void list;
      const rule = node as csstree.Rule;
      if (rule.prelude.type !== "SelectorList") return;
      const selectorText = csstree.generate(rule.prelude);
      // The nearest enclosing at-rule, if any. `this.atrule` is provided by the walker.
      // css-tree sets `this.atrule` to NULL outside an at-rule, not undefined —
      // an `!== undefined` guard throws on the very first top-level rule.
      const atrule = (this as unknown as { atrule?: csstree.Atrule | null }).atrule ?? null;
      const mediaCond =
        atrule !== null && atrule.name === "media" && atrule.prelude !== null
          ? csstree.generate(atrule.prelude)
          : undefined;
      if (mediaCond !== undefined && !media.includes(mediaCond)) media.push(mediaCond);

      for (const selector of selectorText.split(",").map((s) => s.trim())) {
        if (selector === "") continue;
        const spec = specificityOf(selector);
        rule.block.children.forEach((child) => {
          if (child.type !== "Declaration") return;
          const offsetInSheet = child.loc?.start.offset ?? 0;
          const prop = child.property.toLowerCase();
          const value = csstree.generate(child.value).trim();
          const base = {
            selector,
            important: child.important === true,
            specificity: spec,
            // An external sheet's offsets index THAT file; reporting them
            // against the HTML would point at a line that says something else.
            line: sheet.externalPath === undefined
              ? lineOfOffset(source, sheet.offset + offsetInSheet)
              : lineOfOffset(source, sheet.offset),
            media: mediaCond,
          };
          decls.push({ ...base, prop, value, order: order++ });
          // A shorthand also declares its longhands. Without this, `padding: 16px`
          // is invisible to every rule that reads `padding-left`, and the tells
          // that depend on spacing report a clean page for most real stylesheets.
          if (isExpandableShorthand(prop)) {
            for (const [longProp, longValue] of expandShorthand(prop, value)) {
              decls.push({ ...base, prop: longProp, value: longValue, order: order++ });
            }
          }
        });
      }
    },
  });

  return { decls, media };
}

/** True when the challenger should replace the incumbent. */
function wins(challenger: RawDecl, incumbent: Computed & { order: number; important: boolean }): boolean {
  if (challenger.important !== incumbent.important) return challenger.important;
  if (challenger.specificity !== incumbent.specificity) return challenger.specificity > incumbent.specificity;
  return challenger.order > incumbent.order;
}

/**
 * Build the cascade.
 *
 * `mediaConditions` are collected but NOT applied: only unconditional rules and
 * inline styles enter `byElement`. A caller wanting a mobile pass re-runs with
 * the condition it cares about rather than being handed a blend of viewports.
 */
export function buildCascade(doc: Document, sheets: EmbeddedSheet[], source: string): CascadeResult {
  const byElement = new Map<Element, ComputedStyle>();
  const unsupportedSelectors: string[] = [];
  const mediaConditions: string[] = [];
  const winners = new Map<Element, Map<string, Computed & { order: number }>>();

  let order = 0;
  for (const sheet of sheets) {
    const { decls, media } = declarationsOf(sheet, source, order);
    for (const m of media) if (!mediaConditions.includes(m)) mediaConditions.push(m);
    order += decls.length + 1;

    for (const decl of decls) {
      if (decl.media !== undefined) continue; // conditional: not in the default cascade
      let matched: Element[];
      try {
        matched = selectAll<Element, Element>(decl.selector, doc as unknown as Element);
      } catch {
        if (!unsupportedSelectors.includes(decl.selector)) unsupportedSelectors.push(decl.selector);
        continue;
      }
      for (const el of matched) {
        let props = winners.get(el);
        if (props === undefined) {
          props = new Map();
          winners.set(el, props);
        }
        const incumbent = props.get(decl.prop);
        if (
          incumbent === undefined ||
          wins(decl, incumbent)
        ) {
          props.set(decl.prop, {
            value: decl.value,
            line: decl.line,
            specificity: decl.specificity,
            important: decl.important,
            order: decl.order,
          });
        }
      }
    }
  }

  // Inline styles last: they outrank stylesheet rules that are not !important.
  for (const [el, props] of collectInline(doc, source)) {
    let target = winners.get(el);
    if (target === undefined) {
      target = new Map();
      winners.set(el, target);
    }
    for (const [prop, computed] of props) {
      const incumbent = target.get(prop);
      if (incumbent === undefined || !incumbent.important) target.set(prop, computed);
    }
  }

  for (const [el, props] of winners) {
    const out: ComputedStyle = new Map();
    for (const [prop, c] of props) {
      out.set(prop, { value: c.value, line: c.line, specificity: c.specificity, important: c.important });
    }
    byElement.set(el, out);
  }

  return { byElement, unsupportedSelectors, mediaConditions };
}

/** Parse every `style=""` attribute in the document. */
function collectInline(
  doc: Document,
  source: string,
): Map<Element, Map<string, Computed & { order: number }>> {
  const out = new Map<Element, Map<string, Computed & { order: number }>>();
  const walk = (nodes: readonly unknown[]): void => {
    for (const raw of nodes) {
      const node = raw as Element;
      if (node.type === "tag" || node.type === "script" || node.type === "style") {
        const style = node.attribs?.["style"];
        if (style !== undefined && style.trim() !== "") {
          const props = new Map<string, Computed & { order: number }>();
          const line = lineOfOffset(source, node.startIndex ?? 0);
          for (const part of style.split(";")) {
            const i = part.indexOf(":");
            if (i < 0) continue;
            const prop = part.slice(0, i).trim().toLowerCase();
            const rawValue = part.slice(i + 1).trim();
            if (prop === "" || rawValue === "") continue;
            const important = /!important\s*$/i.test(rawValue);
            props.set(prop, {
              value: rawValue.replace(/\s*!important\s*$/i, ""),
              line,
              specificity: INLINE_SPECIFICITY,
              important,
              order: Number.MAX_SAFE_INTEGER,
            });
          }
          if (props.size > 0) out.set(node, props);
        }
        if (node.children !== undefined) walk(node.children);
      }
    }
  };
  walk(doc.children);
  return out;
}
