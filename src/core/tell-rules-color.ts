/**
 * Colour and light tells. Facts: `color`, `gradient`, `shadow`, `typography`.
 *
 * Thresholds here are deliberately tight. A wider purple net catches legitimate
 * navy and plum; a wider cream net catches every light background there is.
 * Precision over recall — a false positive on a good palette is the one thing
 * that makes a designer stop reading the output.
 *
 * Enforces knowledge/design-tells.md § Colour and light.
 */
import type { TellRule } from "./tell-rules.js";
import { finding, sameOwner, isAiPurple, isAiCyan, isCream, isGrey, isSaturated } from "./tell-rules.js";

const SECTION = "Colour and light";

export const aiColorPalette: TellRule = {
  id: "ai-color-palette",
  needs: ["color"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const colors = facts.by("color");
    const gradients = facts.by("gradient");
    const purple = colors.filter((c) => isAiPurple(c.hex));
    const gradientPurple = gradients.filter((g) => g.stops.some((s) => isAiPurple(s.hex)));
    const cyan = colors.filter((c) => isAiCyan(c.hex));
    const hits = [...purple, ...cyan];
    if (hits.length === 0 && gradientPurple.length === 0) return [];
    const swatches = [...new Set([
      ...purple.map((c) => `#${c.hex}`),
      ...cyan.map((c) => `#${c.hex}`),
      ...gradientPurple.flatMap((g) => g.stops.filter((s) => isAiPurple(s.hex)).map((s) => `#${s.hex}`)),
    ])];
    return [
      finding(aiColorPalette, {
        message: `purple/violet or cyan-on-dark accents (${swatches.slice(0, 4).join(", ")}) — the most recognisable palette tell`,
        line: (hits[0] ?? gradientPurple[0])?.at.line,
        expected: "a palette chosen for this product",
        actual: swatches.join(", "),
        fixHint: "pick a hue the brand can defend and derive the scale from it",
      }),
    ];
  },
};

export const creamPalette: TellRule = {
  id: "cream-palette",
  needs: ["color"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const cream = facts.by("color").filter((c) => c.role === "bg" && isCream(c.hex));
    if (cream.length === 0) return [];
    return [
      finding(creamPalette, {
        message: `warm cream surface #${cream[0]?.hex} — the reflex "tasteful" default, not a decision`,
        line: cream[0]?.at.line,
        expected: "a background that comes from the palette",
        actual: `#${cream[0]?.hex}`,
        fixHint: "tint the background toward the brand hue, or commit to true white",
      }),
    ];
  },
};

export const gradientText: TellRule = {
  id: "gradient-text",
  needs: ["gradient", "color"],
  severity: "error",
  section: SECTION,
  run: (facts) => {
    // Transparent (or near-transparent) text on the same line as a gradient is
    // the background-clip:text construction, whatever syntax produced it.
    const clipped = facts.by("color").filter((c) => c.role === "fg" && (c.alpha ?? 1) < 0.1);
    const gradients = facts.by("gradient");
    return clipped
      .filter((c) => gradients.some((g) => sameOwner(g, c)))
      .map((c) =>
        finding(gradientText, {
          message: "gradient clipped to text — decorative rather than meaningful, and it costs legibility at every size",
          line: c.at.line,
          expected: "a solid text colour",
          actual: "transparent text over a gradient",
          fixHint: "set a solid colour; move the gradient behind the block if it must stay",
        }),
      );
  },
};

export const darkGlow: TellRule = {
  id: "dark-glow",
  needs: ["shadow", "color"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const dark = facts.by("color").some(
      (c) => c.role === "bg" && Number.parseInt(c.hex.slice(0, 2), 16) < 60 &&
        Number.parseInt(c.hex.slice(2, 4), 16) < 60,
    );
    if (!dark) return [];
    const glows = facts.by("shadow").filter(
      (s) => s.hex !== undefined && isSaturated(s.hex) && s.blurPx >= 20 && s.inset !== true,
    );
    return glows.map((s) =>
      finding(darkGlow, {
        message: `saturated ${s.blurPx}px glow (#${s.hex}) on a dark surface — light simulated with no light source`,
        line: s.at.line,
        expected: "a shadow tinted toward the background",
        actual: `#${s.hex} blur ${s.blurPx}px`,
        fixHint: "tint the shadow toward the surface, or give the glow a real source",
      }),
    );
  },
};

export const radialHalo: TellRule = {
  id: "radial-halo",
  needs: ["gradient"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const radial = facts.by("gradient").filter((g) => g.gradientKind === "radial");
    if (radial.length === 0) return [];
    return [
      finding(radialHalo, {
        message: `${radial.length} radial gradient(s) used as ambient depth`,
        line: radial[0]?.at.line,
        expected: "depth from elevation and contrast",
        actual: `${radial.length} radial gradient(s)`,
        fixHint: "replace the halo with a real elevation step",
      }),
    ];
  },
};

export const repeatingStripesGradient: TellRule = {
  id: "repeating-stripes-gradient",
  needs: ["gradient"],
  severity: "advisory",
  section: SECTION,
  run: (facts) =>
    facts
      .by("gradient")
      // A stripe pattern is a gradient whose stops alternate between two colours
      // several times over — three or more stops from a two-colour set.
      .filter((g) => g.stops.length >= 4 && new Set(g.stops.map((s) => s.hex)).size <= 2)
      .map((g) =>
        finding(repeatingStripesGradient, {
          message: `${g.stops.length}-stop two-colour gradient used as stripe texture`,
          line: g.at.line,
          expected: "texture that carries meaning, or none",
          actual: `${g.stops.length} alternating stops`,
          fixHint: "drop the stripes; use a surface tint if separation is needed",
        }),
      ),
};

export const grayOnColor: TellRule = {
  id: "gray-on-color",
  needs: ["color"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const colors = facts.by("color");
    const out = [];
    for (const fg of colors) {
      if (fg.role !== "fg" || !isGrey(fg.hex)) continue;
      const bg = colors.find((c) => c.role === "bg" && sameOwner(c, fg) && isSaturated(c.hex));
      if (bg === undefined) continue;
      out.push(
        finding(grayOnColor, {
          message: `grey #${fg.hex} on saturated #${bg.hex} — it reads washed out even where it passes contrast`,
          line: fg.at.line,
          nodeRef: fg.at.nodeRef,
          expected: "a tint of the background, or near-white",
          actual: `#${fg.hex} on #${bg.hex}`,
          fixHint: "darken toward the background hue, or go near-white",
        }),
      );
    }
    return out;
  },
};

export const gptThinBorderWideShadow: TellRule = {
  id: "gpt-thin-border-wide-shadow",
  needs: ["border", "shadow"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const shadows = facts.by("shadow");
    return facts
      .by("border")
      .filter((b) => b.widthPx <= 1 && b.sides.length >= 4)
      .flatMap((b) => {
        const wide = shadows.find((s) => sameOwner(s, b) && s.blurPx >= 16);
        return wide === undefined
          ? []
          : [
              finding(gptThinBorderWideShadow, {
                message: `1px border paired with a ${wide.blurPx}px shadow — two competing edge treatments on one element`,
                line: b.at.line,
                expected: "one edge treatment",
                actual: `${b.widthPx}px border + ${wide.blurPx}px shadow`,
                fixHint: "keep the border or the shadow, not both",
              }),
            ];
      });
  },
};

export const codexGridBackground: TellRule = {
  id: "codex-grid-background",
  needs: ["gradient", "color"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    // A grid is a repeating linear gradient at a right angle, in two near-equal
    // low-contrast greys — the faint graph-paper backdrop.
    const grid = facts.by("gradient").filter(
      (g) =>
        g.gradientKind === "linear" &&
        (g.angleDeg === 90 || g.angleDeg === 0 || g.angleDeg === undefined) &&
        g.stops.length >= 2 &&
        g.stops.every((s) => isGrey(s.hex) || /^(f|e)/.test(s.hex)),
    );
    if (grid.length < 2) return [];
    return [
      finding(codexGridBackground, {
        message: `${grid.length} axis-aligned low-contrast gradients forming a grid backdrop`,
        line: grid[0]?.at.line,
        expected: "a plain surface, or texture that means something",
        actual: `${grid.length} grid gradients`,
        fixHint: "remove the graph paper",
      }),
    ];
  },
};

export const COLOR_RULES: readonly TellRule[] = [
  aiColorPalette,
  creamPalette,
  gradientText,
  darkGlow,
  radialHalo,
  repeatingStripesGradient,
  grayOnColor,
  gptThinBorderWideShadow,
  codexGridBackground,
];
