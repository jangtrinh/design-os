/**
 * Roles derived from FACTS, not from class names.
 *
 * Name matching failed in both directions, measured on real pages:
 *  - `/(^|-)card($|-)/i` matches `card-title` and `card-desc`, so a card's own
 *    title counted as a nested card — 16 false positives on one page;
 *  - a Tailwind surface written `rounded-xl border p-4` carries no "card" in any
 *    name, so a page with 9 rounded containers yielded 0 cards and every rule
 *    depending on the role went silently inert.
 *
 * A card is a thing that LOOKS like a card: it lifts off the page (a shadow or a
 * border) and it is a surface (a radius or its own background). That predicate
 * is what the reference implementation uses, and it is true in every language
 * because it reads facts the extractors already emit.
 *
 * This is the repo's own architecture applied to roles. Rules were written once
 * over the IR; roles were not, and lived as a regex inside one extractor. Now
 * they are a shared derived pass, so every language gets them at once.
 *
 * A name match still counts — as a BOOSTER, never as the source. `class="card"`
 * on something with no surface properties at all is a naming convention, not a
 * card, and the facts are what decide.
 */
import type { DesignFact } from "./fact-kinds.js";
import type { Confidence } from "./fact-model.js";

/** What one element's facts say about it. */
export interface Surface {
  hasShadow: boolean;
  hasBorder: boolean;
  hasRadius: boolean;
  hasOwnBackground: boolean;
  /** A name that CLAIMS a role, from the extractor's own heuristic pass. */
  claimed: Set<string>;
  /** Weakest confidence among the facts the decision rests on. */
  confidence: Confidence;
  /** The element's own tag, lower-cased. */
  tag: string;
}

const WEAKER: Record<Confidence, number> = { rendered: 0, resolved: 1, literal: 2, heuristic: 3 };
const ORDER: Confidence[] = ["rendered", "resolved", "literal", "heuristic"];

function weaken(a: Confidence, b: Confidence): Confidence {
  return ORDER[Math.max(WEAKER[a], WEAKER[b])] as Confidence;
}

/**
 * Recompute every structure fact's roles from the surrounding facts.
 *
 * Pure: same facts in, same facts out. Structure facts are replaced with copies
 * carrying derived roles; every other fact passes through untouched.
 */
export function synthesizeRoles(facts: readonly DesignFact[]): DesignFact[] {
  const surfaces = new Map<string, Surface>();

  const ensure = (ref: string, confidence: Confidence): Surface => {
    const existing = surfaces.get(ref);
    if (existing !== undefined) {
      existing.confidence = weaken(existing.confidence, confidence);
      return existing;
    }
    const fresh: Surface = {
      hasShadow: false, hasBorder: false, hasRadius: false, hasOwnBackground: false,
      claimed: new Set(), confidence, tag: "",
    };
    surfaces.set(ref, fresh);
    return fresh;
  };

  for (const f of facts) {
    const ref = f.at.nodeRef ?? (f.kind === "structure" ? f.ref : undefined);
    if (ref === undefined) continue;
    const s = ensure(ref, f.at.confidence);
    switch (f.kind) {
      case "shadow":
        // An inset shadow does not lift anything off the page.
        if (f.inset !== true) s.hasShadow = true;
        break;
      case "border":
        // A hairline on one side is a divider, not a card edge.
        if (f.widthPx >= 1 && f.sides.length >= 3) s.hasBorder = true;
        break;
      case "radius":
        if (f.px > 0) s.hasRadius = true;
        break;
      case "color":
        if (f.role === "bg" && (f.alpha ?? 1) >= 0.5) s.hasOwnBackground = true;
        break;
      case "structure":
        for (const role of f.roles ?? []) s.claimed.add(role);
        s.tag = f.node.toLowerCase();
        break;
      default:
        break;
    }
  }

  return facts.map((f) => {
    if (f.kind !== "structure") return f;
    const s = surfaces.get(f.ref);
    const roles = rolesFor(f.node, s);
    return roles.length > 0 ? { ...f, roles } : { ...f, roles: undefined };
  });
}

/**
 * Controls and inline chrome. They carry a border and a radius and are not cards.
 *
 * Measured: without this, one real page produced 562 "cards" — `button.btn`,
 * `kbd.inline-flex`, badges — and 259 nested-cards findings from them. A button
 * is a control, a `kbd` is a keycap; neither is a surface holding content.
 *
 * `<a>` is deliberately ABSENT: a link-wrapped card is a real and common
 * pattern, and the container test below is what separates `a.card` (holds a
 * title and a description) from `a.btn` (holds a word).
 */
const CONTROL_TAGS = new Set([
  "button", "input", "select", "textarea", "kbd", "code", "label",
  "summary", "option", "progress", "meter", "img", "svg", "video",
]);

/**
 * The predicate: lifts off the page AND is a surface, and is not a control.
 *
 * Deliberately GENEROUS, and the tuning history says why. Three stricter
 * variants were measured on three real pages:
 *
 *   variant                      checkout   tailwind   card-title
 *   (shadow|border)&(radius|bg)       558          7           29
 *   shadow|(border&bg)                 38          0           29
 *   (shadow|border)&radius&bg          16          0           29
 *
 * Every variant that tamed the checkout page also took the Tailwind page to
 * zero — because a Tailwind card (`rounded-xl border p-4`) and an ordinary
 * bordered div carry the SAME facts. They are not separable at this fidelity,
 * and pretending otherwise just moves the error.
 *
 * So role stays generous and the RULES carry the discrimination. `nested-cards`
 * requires both surfaces to be visually distinct, which took that page from 520
 * findings to 5 without costing the Tailwind case anything.
 *
 * A container clause ("a card holds something") was tried and dropped: it fixed
 * 558 → 537 and took Tailwind to 0. Bad trade.
 */
export function looksLikeCard(s: Surface | undefined): boolean {
  if (s === undefined) return false;
  if (CONTROL_TAGS.has(s.tag)) return false;
  return (s.hasShadow || s.hasBorder) && (s.hasRadius || s.hasOwnBackground);
}

/**
 * A surface a reader can SEE as separate: its own background, or a shadow.
 *
 * A bordered transparent div inside another bordered transparent div does not
 * read as cards inside cards — it reads as layout. Nesting is only a tell when
 * the two surfaces are distinguishable.
 */
export function hasDistinctSurface(facts: readonly DesignFact[], ref: string): boolean {
  return facts.some(
    (f) =>
      f.at.nodeRef === ref &&
      ((f.kind === "shadow" && f.inset !== true) ||
        (f.kind === "color" && f.role === "bg" && (f.alpha ?? 1) >= 0.5)),
  );
}

/** Structural tags that carry their role in the markup itself. */
const SECTION_TAGS = new Set(["section", "article", "aside", "main", "header", "footer", "nav"]);
const ICON_TAGS = new Set(["svg", "use", "symbol"]);

function rolesFor(node: string, s: Surface | undefined): string[] {
  const tag = node.toLowerCase();
  const roles: string[] = [];

  if (looksLikeCard(s)) roles.push("card");

  // Icons are the one role a TAG proves outright. A name claim alone is kept,
  // because an icon font renders through a <span> and there is no fact for it.
  if (ICON_TAGS.has(tag) || s?.claimed.has("icon") === true) roles.push("icon");

  if (SECTION_TAGS.has(tag) || s?.claimed.has("section") === true) roles.push("section");

  return roles;
}
