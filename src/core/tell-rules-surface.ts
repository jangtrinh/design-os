/**
 * Surface and card tells. Facts: `border`, `radius`, `spacing`, `structure`.
 *
 * Everything here that talks about NESTING or RHYTHM requires the `structure`
 * fact and says so. The prototype that inspired these rules fired `nested-cards`
 * on any two radii in one file and printed "radius 16 inside 12" — inner larger
 * than outer, no nesting proven. Every real file has two radii; without
 * structure this class of rule is a false-positive machine.
 *
 * Enforces knowledge/design-tells.md § Surface and card.
 */
import type { TellRule, FactIndex } from "./tell-rules.js";
import { finding, sameOwner } from "./tell-rules.js";
import { hasDistinctSurface } from "./design-facts/role-synthesis.js";

const SECTION = "Surface and card";

/** A border painted on exactly one side, thick enough to read as an accent. */
export const sideTab: TellRule = {
  id: "side-tab",
  needs: ["border", "radius"],
  severity: "error",
  section: SECTION,
  run: (facts) => {
    const out = [];
    const radii = facts.by("radius");
    for (const b of facts.by("border")) {
      if (b.sides.length !== 1 || b.widthPx < 3) continue;
      // Only on a rounded surface: a one-sided rule on a square block is a
      // legitimate divider, not a category stripe.
      const rounded = radii.some((r) => r.px >= 4 && sameOwner(r, b));
      if (!rounded) continue;
      out.push(
        finding(sideTab, {
          message: `${b.widthPx}px accent border on the ${b.sides[0]} side of a rounded surface — the most recognisable generated-UI tell`,
          line: b.at.line,
          nodeRef: b.at.nodeRef,
          expected: "no single-side accent border, or no border-radius",
          actual: `border-${b.sides[0]}: ${b.widthPx}px on a rounded element`,
          fixHint: "drop the edge bar, or drop the radius",
        }),
      );
    }
    return out;
  },
};

export const borderAccentOnRounded: TellRule = {
  id: "border-accent-on-rounded",
  needs: ["border", "radius"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const out = [];
    const radii = facts.by("radius");
    for (const b of facts.by("border")) {
      if (b.sides.length < 4 || b.widthPx < 3) continue;
      const r = radii.find((x) => x.px >= 8 && sameOwner(x, b));
      if (r === undefined) continue;
      out.push(
        finding(borderAccentOnRounded, {
          message: `${b.widthPx}px border meeting a ${r.px}px radius — the border fights the corner`,
          line: b.at.line,
          nodeRef: b.at.nodeRef,
          expected: "a thin border, or a smaller radius",
          actual: `${b.widthPx}px border with ${r.px}px radius`,
          fixHint: "thin the border or reduce the radius; keep one of the two",
        }),
      );
    }
    return out;
  },
};

/**
 * A card with a card ANCESTOR. Structure is what makes this provable.
 *
 * Ancestor, not direct parent. Measured against the reference implementation on
 * a real page: it found 7 nested cards where this rule found 0, and the reason
 * was that every card sat inside a layout wrapper — `div.flex > div.flex >
 * div.preview-card` inside another `preview-card`. A wrapper between two cards
 * does not stop them reading as cards inside cards; visually the nesting is
 * exactly what the reader sees.
 *
 * The chain is still REQUIRED. What the prototype got wrong was calling any two
 * radii nesting; what the first implementation got wrong was demanding direct
 * parenthood. Containment proved through refs is the middle that is true.
 */
export const nestedCards: TellRule = {
  id: "nested-cards",
  needs: ["structure"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const structures = facts.by("structure");
    // Both surfaces must be visually DISTINCT — own background or a shadow.
    // Role detection is deliberately generous because a Tailwind card and an
    // ordinary bordered div carry identical facts; the discrimination lives
    // here. Measured on a real checkout page: 520 findings became 5, with no
    // cost to the Tailwind case and none to the card-title case.
    const cards = structures.filter(
      (s) => s.roles?.includes("card") && hasDistinctSurface(facts.all, s.ref),
    );
    const cardRefs = cards.map((c) => c.ref);
    return cards
      .map((c) => {
        // The nearest card ancestor: a ref is an ancestor when this ref extends
        // it by a path separator, which is exactly how nodeRef is built.
        const ancestors = cardRefs.filter((o) => o !== c.ref && c.ref.startsWith(`${o} > `));
        if (ancestors.length === 0) return undefined;
        const nearest = ancestors.reduce((a, b) => (b.length > a.length ? b : a));
        return finding(nestedCards, {
          message: `card nested inside another card (${nearest.split(" > ").slice(-1)[0]})`,
          line: c.at.line,
          nodeRef: c.ref,
          expected: "one level of card",
          actual: `card at depth ${c.depth} inside ${nearest.split(" > ").slice(-1)[0]}`,
          fixHint: "flatten: use spacing and type, not a second container",
        });
      })
      .filter((f): f is NonNullable<typeof f> => f !== undefined);
  },
};

/** One spacing value used everywhere — grouping that carries no meaning. */
export const monotonousSpacing: TellRule = {
  id: "monotonous-spacing",
  needs: ["spacing", "structure"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const spacings = facts.by("spacing").filter((s) => s.px > 0);
    // Below this a page has not made enough spacing decisions to have a rhythm
    // to lack. Firing on three paddings is how a small component reads as slop.
    if (spacings.length < 8) return [];
    const values = new Set(spacings.map((s) => s.px));
    if (values.size > 1) return [];
    const px = [...values][0] as number;
    return [
      finding(monotonousSpacing, {
        message: `every one of ${spacings.length} spacing values is ${px}px — no rhythm separates related items from unrelated sections`,
        line: spacings[0]?.at.line,
        expected: "a spacing scale with at least two steps in use",
        actual: `${spacings.length}x ${px}px`,
        fixHint: "tighten within groups and widen between sections",
      }),
    ];
  },
};

/** Padding too small to breathe, on a surface big enough to need it. */
export const crampedPadding: TellRule = {
  id: "cramped-padding",
  needs: ["spacing", "radius"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const radii = facts.by("radius");
    // Padding is a property of the ELEMENT, not of each side. Emitting per side
    // printed the same sentence four times per element (eight for two cards on
    // one stylesheet line) — technically accurate, practically a reason to
    // switch the linter off.
    const byNode = new Map<string, { props: string[]; px: number; line: number; radius?: number }>();
    for (const s of facts.by("spacing")) {
      if (!s.prop.startsWith("padding-") || s.px <= 0 || s.px >= 8) continue;
      // Only on something that presents as a SURFACE. A chip legitimately has
      // 4px — and so does a pill: `rounded-full` (999px) IS the chip case, which
      // the first threshold missed by only exempting SMALL radii. Measured on a
      // real React app: most hits were 4-6px padding on 999px-radius pills.
      const PILL_RADIUS = 100;
      const radius = radii.find((r) => r.px >= 12 && r.px < PILL_RADIUS && sameOwner(r, s));
      if (radius === undefined) continue;
      const key = s.at.nodeRef ?? `line:${s.at.line}`;
      const cur = byNode.get(key);
      if (cur === undefined) byNode.set(key, { props: [s.prop], px: s.px, line: s.at.line, radius: radius.px });
      else if (!cur.props.includes(s.prop)) cur.props.push(s.prop);
    }
    return [...byNode.entries()].map(([node, v]) =>
      finding(crampedPadding, {
        message: `${v.px}px padding (${v.props.map((p) => p.replace("padding-", "")).sort().join(", ")}) on a ${v.radius}px-radius surface`,
        line: v.line,
        nodeRef: node.startsWith("line:") ? undefined : node,
        expected: "padding proportional to the surface (>= 8px)",
        actual: `${v.px}px on ${v.props.length} side(s)`,
        fixHint: "raise the padding to the next step on the spacing scale",
      }),
    );
  },
};

export const edgeFlushCards: TellRule = {
  id: "edge-flush-cards",
  needs: ["structure", "spacing", "radius"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const structures = facts.by("structure");
    const spacings = facts.by("spacing");
    const cards = structures.filter((s) => s.roles?.includes("card"));
    if (cards.length < 2) return [];
    // Top-level cards (depth <= 2) with no horizontal margin anywhere.
    const shallow = cards.filter((c) => c.depth <= 2);
    if (shallow.length < 2) return [];
    const hasGutter = spacings.some(
      (s) => (s.prop === "margin-left" || s.prop === "margin-right" || s.prop === "padding-left") && s.px > 0,
    );
    if (hasGutter) return [];
    return [
      finding(edgeFlushCards, {
        message: `${shallow.length} top-level cards with no horizontal gutter anywhere on the page`,
        line: shallow[0]?.at.line,
        nodeRef: shallow[0]?.ref,
        expected: "a container gutter",
        actual: "no horizontal margin or padding declared",
        fixHint: "give the container a horizontal gutter",
      }),
    ];
  },
};

export const repeatedContainerText: TellRule = {
  id: "repeated-container-text",
  needs: ["text", "structure"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const counts = new Map<string, { n: number; line?: number }>();
    for (const t of facts.by("text")) {
      const key = t.content.trim().toLowerCase();
      // Short strings repeat legitimately ("Save", "Cancel", "1").
      if (key.length < 24) continue;
      const cur = counts.get(key);
      if (cur === undefined) counts.set(key, { n: 1, line: t.at.line });
      else cur.n++;
    }
    return [...counts.entries()]
      .filter(([, v]) => v.n >= 3)
      .map(([text, v]) =>
        finding(repeatedContainerText, {
          message: `the same ${text.length}-character string appears in ${v.n} containers — placeholder copy that shipped`,
          line: v.line,
          expected: "distinct copy per container",
          actual: `"${text.slice(0, 40)}..." x${v.n}`,
          fixHint: "write the real copy, or cut the duplicated containers",
        }),
      );
  },
};

export const SURFACE_RULES: readonly TellRule[] = [
  sideTab,
  borderAccentOnRounded,
  nestedCards,
  monotonousSpacing,
  crampedPadding,
  edgeFlushCards,
  repeatedContainerText,
];

/** Re-export for the barrel's convenience. */
export type { FactIndex };
