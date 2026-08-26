/**
 * Label and ornament tells — the small repeated devices that stand in for
 * hierarchy. Facts: `text`, `structure`, `typography`, `radius`.
 *
 * All four fire on REPETITION, not on a single instance. One kicker is an
 * editorial choice; a kicker above every section is a template. Firing on the
 * first occurrence would flag good pages, which is the failure mode this family
 * can least afford.
 *
 * Enforces knowledge/design-tells.md § Surface and card.
 */
import type { TellRule } from "./tell-rules.js";
import { finding, sameOwner, nearestOwner } from "./tell-rules.js";

const SECTION = "Surface and card";

/** Repetition floor: below this it is a choice, not a habit. */
const REPEAT = 3;

/** A rounded-square tile holding an icon, repeated above headings. */
export const iconTileStack: TellRule = {
  id: "icon-tile-stack",
  needs: ["structure", "radius"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const icons = facts.by("structure").filter((s) => s.roles?.includes("icon"));
    if (icons.length < REPEAT) return [];
    const radii = facts.by("radius");
    // A TILE, not a bare glyph: the icon's own line carries a small radius.
    const tiled = icons.filter((i) => radii.some((r) => r.px > 0 && r.px <= 16 && sameOwner(r, i)));
    if (tiled.length < REPEAT) return [];
    return [
      finding(iconTileStack, {
        message: `${tiled.length} rounded icon tiles repeated as section ornament — decoration standing in for hierarchy`,
        line: tiled[0]?.at.line,
        nodeRef: tiled[0]?.ref,
        expected: "hierarchy carried by type and spacing",
        actual: `${tiled.length} icon tiles`,
        fixHint: "drop the tiles; let the headings rank themselves",
      }),
    ];
  },
};

/** All-caps micro-line above headings, repeated. */
export const kickerAboveHeading: TellRule = {
  id: "kicker-above-heading",
  needs: ["text", "typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const type = facts.by("typography");
    const kickers = facts.by("text").filter((t) => {
      if (t.role === "heading") return false;
      const content = t.content.trim();
      if (content.length === 0 || content.length > 32) return false;
      const styled = nearestOwner(type, t);
      const upperFromStyle = styled?.transform === "uppercase";
      const upperFromText = content === content.toUpperCase() && /[A-Z]/.test(content);
      const small = styled?.sizePx !== undefined && styled.sizePx <= 14;
      return (upperFromStyle || upperFromText) && (small || upperFromStyle);
    });
    if (kickers.length < REPEAT) return [];
    return [
      finding(kickerAboveHeading, {
        message: `${kickers.length} all-caps kicker lines — one is editorial, one per section is a template`,
        line: kickers[0]?.at.line,
        expected: "at most a couple of kickers, used deliberately",
        actual: `${kickers.length} kickers`,
        fixHint: "keep the kicker where it earns its place; delete the rest",
      }),
    ];
  },
};

/** A pill-shaped label floating above a hero headline. */
export const heroEyebrowChip: TellRule = {
  id: "hero-eyebrow-chip",
  needs: ["text", "radius", "typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const radii = facts.by("radius");
    const type = facts.by("typography");
    const h1 = facts.by("text").find((t) => t.role === "heading" && t.level === 1);
    if (h1 === undefined) return [];
    const chip = facts.by("text").find((t) => {
      if (t.role === "heading") return false;
      // Above the h1 in source order, short, pill-shaped, small type.
      if (t.at.line >= h1.at.line || h1.at.line - t.at.line > 6) return false;
      if (t.content.trim().length > 40) return false;
      const pill = radii.some((r) => r.px >= 999 || (r.px >= 12 && sameOwner(r, t)));
      const small = type.some((y) => sameOwner(y, t) && (y.sizePx ?? 99) <= 14);
      return pill && small;
    });
    if (chip === undefined) return [];
    return [
      finding(heroEyebrowChip, {
        message: "pill-shaped eyebrow chip above the hero headline — a launch-announcement device with nothing to announce",
        line: chip.at.line,
        expected: "a headline that opens the page on its own",
        actual: `chip "${chip.content.trim().slice(0, 30)}"`,
        fixHint: "delete the chip, or make it say something the headline does not",
      }),
    ];
  },
};

/** `01 / 02 / 03` before section titles where nothing is ordinal. */
export const numberedSectionLabels: TellRule = {
  id: "numbered-section-labels",
  needs: ["text"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const numbered = facts.by("text").filter((t) => /^0\d$/.test(t.content.trim()));
    if (numbered.length < REPEAT) return [];
    return [
      finding(numberedSectionLabels, {
        message: `${numbered.length} zero-padded section numbers (${numbered.map((t) => t.content.trim()).join(", ")}) — sequence implies steps, and sections rarely are`,
        line: numbered[0]?.at.line,
        expected: "numbers only where order is load-bearing",
        actual: `${numbered.length} ordinal labels`,
        fixHint: "drop the numbers unless the reader must follow them in order",
      }),
    ];
  },
};

export const LABEL_RULES: readonly TellRule[] = [
  iconTileStack,
  kickerAboveHeading,
  heroEyebrowChip,
  numberedSectionLabels,
];
