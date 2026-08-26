/**
 * Type tells. Facts: `typography`, `text`.
 *
 * `overused-font` deliberately does NOT flag platform system faces. SF on Apple
 * platforms is not a choice made badly. Flutter's default IS Roboto, so an app
 * declaring no family still trips this — correctly, and that asymmetry lives in
 * the extractor that knows the platform, not here.
 *
 * Enforces knowledge/design-tells.md § Type.
 */
import type { TellRule } from "./tell-rules.js";
import { finding, OVERUSED_FONTS } from "./tell-rules.js";

const SECTION = "Type";

export const overusedFont: TellRule = {
  id: "overused-font",
  needs: ["typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const hit = facts
      .by("typography")
      .find((t) => t.family !== undefined && OVERUSED_FONTS.has(t.family.trim().toLowerCase()));
    if (hit === undefined) return [];
    return [
      finding(overusedFont, {
        message: `${hit.family} is on so many surfaces it no longer carries personality`,
        line: hit.at.line,
        expected: "a face chosen for this product",
        actual: hit.family as string,
        fixHint: "pick a face with a point of view; keep the fallback stack",
      }),
    ];
  },
};

/** Sizes too close together to establish rank. */
export const flatTypeHierarchy: TellRule = {
  id: "flat-type-hierarchy",
  needs: ["typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const sizes = [...new Set(
      facts.by("typography").map((t) => t.sizePx).filter((n): n is number => n !== undefined && n > 0),
    )].sort((a, b) => a - b);
    // Fewer than three steps is not a hierarchy to judge.
    if (sizes.length < 3) return [];
    const ratios = sizes.slice(1).map((n, i) => n / (sizes[i] as number));
    const largest = Math.max(...ratios);
    if (largest >= 1.25) return [];
    return [
      finding(flatTypeHierarchy, {
        message: `${sizes.length} type sizes (${sizes.map((n) => `${n}px`).join(", ")}) with no step above ${largest.toFixed(2)}x — nothing ranks`,
        line: facts.by("typography")[0]?.at.line,
        expected: "at least a 1.25x step between levels",
        actual: `largest step ${largest.toFixed(2)}x`,
        fixHint: "use fewer sizes, further apart",
      }),
    ];
  },
};

export const oversizedH1: TellRule = {
  id: "oversized-h1",
  needs: ["typography", "text"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const type = facts.by("typography");
    const h1 = facts.by("text").find((t) => t.role === "heading" && t.level === 1);
    if (h1 === undefined) return [];
    const h1Size = type.find((t) => t.at.line === h1.at.line)?.sizePx;
    if (h1Size === undefined) return [];
    const others = type
      .map((t) => t.sizePx)
      .filter((n): n is number => n !== undefined && n > 0 && n !== h1Size)
      .sort((a, b) => b - a);
    const next = others[0];
    if (next === undefined || h1Size / next < 3) return [];
    return [
      finding(oversizedH1, {
        message: `h1 at ${h1Size}px with nothing between it and the next size (${next}px) — a ${(h1Size / next).toFixed(1)}x jump`,
        line: h1.at.line,
        expected: "a scale with a step between the headline and the rest",
        actual: `${h1Size}px then ${next}px`,
        fixHint: "add an intermediate step, or bring the headline down",
      }),
    ];
  },
};

export const headingRhythm: TellRule = {
  id: "heading-rhythm",
  needs: ["typography", "text"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const type = facts.by("typography");
    const byLevel = new Map<number, number>();
    for (const t of facts.by("text")) {
      if (t.role !== "heading" || t.level === undefined) continue;
      const size = type.find((y) => y.at.line === t.at.line)?.sizePx;
      if (size === undefined) continue;
      const seen = byLevel.get(t.level);
      if (seen === undefined || size > seen) byLevel.set(t.level, size);
    }
    const levels = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
    if (levels.length < 2) return [];
    const inversions = levels
      .slice(1)
      .map((cur, i) => ({ cur, prev: levels[i] as [number, number] }))
      .filter(({ cur, prev }) => cur[1] > prev[1]);
    if (inversions.length === 0) return [];
    const first = inversions[0] as { cur: [number, number]; prev: [number, number] };
    return [
      finding(headingRhythm, {
        message: `h${first.cur[0]} (${first.cur[1]}px) is larger than h${first.prev[0]} (${first.prev[1]}px) — the heading scale does not descend`,
        expected: "heading sizes that fall with level",
        actual: `h${first.prev[0]}=${first.prev[1]}px, h${first.cur[0]}=${first.cur[1]}px`,
        fixHint: "order the heading scale so level and size agree",
      }),
    ];
  },
};

export const tightLeading: TellRule = {
  id: "tight-leading",
  needs: ["typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) =>
    facts
      .by("typography")
      .filter((t) => t.lineHeight !== undefined && t.lineHeight < 1.2 && (t.sizePx ?? 16) <= 20)
      .map((t) =>
        finding(tightLeading, {
          message: `line-height ${(t.lineHeight as number).toFixed(2)} on ${t.sizePx ?? 16}px body copy`,
          line: t.at.line,
          expected: "line-height >= 1.4 for body copy",
          actual: String((t.lineHeight as number).toFixed(2)),
          fixHint: "open the leading to at least 1.4",
        }),
      ),
};

export const wideTracking: TellRule = {
  id: "wide-tracking",
  needs: ["typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) =>
    facts
      .by("typography")
      .filter((t) => t.letterSpacingEm !== undefined && t.letterSpacingEm > 0.18 && t.transform !== "uppercase")
      .map((t) =>
        finding(wideTracking, {
          message: `letter-spacing ${(t.letterSpacingEm as number).toFixed(2)}em on non-uppercase text`,
          line: t.at.line,
          expected: "wide tracking reserved for small all-caps",
          actual: `${(t.letterSpacingEm as number).toFixed(2)}em`,
          fixHint: "reduce the tracking, or make the run all-caps if it is a label",
        }),
      ),
};

export const extremeNegativeTracking: TellRule = {
  id: "extreme-negative-tracking",
  needs: ["typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) =>
    facts
      .by("typography")
      .filter((t) => t.letterSpacingEm !== undefined && t.letterSpacingEm < -0.05)
      .map((t) =>
        finding(extremeNegativeTracking, {
          message: `letter-spacing ${(t.letterSpacingEm as number).toFixed(3)}em — letters collide before the headline reads tighter`,
          line: t.at.line,
          expected: "tracking no tighter than -0.05em",
          actual: `${(t.letterSpacingEm as number).toFixed(3)}em`,
          fixHint: "back off the negative tracking",
        }),
      ),
};

export const lineLength: TellRule = {
  id: "line-length",
  needs: ["text", "typography"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    // No layout facts here, so measure is approximated from the copy itself: a
    // single unbroken run far past the comfortable measure. Deliberately
    // conservative — a real measure needs the rendered tier.
    const long = facts
      .by("text")
      .filter((t) => t.role === "body" && t.content.length > 400);
    if (long.length === 0) return [];
    return [
      finding(lineLength, {
        message: `${long.length} body run(s) over 400 characters with no container constraint visible to this tier`,
        line: long[0]?.at.line,
        expected: "a measure around 60-80 characters",
        actual: `${long[0]?.content.length} characters in one run`,
        fixHint: "cap the container measure, or break the copy",
      }),
    ];
  },
};

export const justifiedText: TellRule = {
  id: "justified-text",
  needs: ["typography"],
  severity: "error",
  section: SECTION,
  run: (facts) =>
    facts
      .by("typography")
      .filter((t) => t.align === "justify")
      .map((t) =>
        finding(justifiedText, {
          message: "justified body copy with no hyphenation engine — rivers and stretched spaces",
          line: t.at.line,
          expected: "text-align: start",
          actual: "text-align: justify",
          fixHint: "align to the start edge",
        }),
      ),
};

export const undersizedUiText: TellRule = {
  id: "undersized-ui-text",
  needs: ["typography", "text"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const type = facts.by("typography");
    return facts
      .by("text")
      .filter((t) => t.role === "label")
      .flatMap((t) => {
        const size = type.find((y) => y.at.line === t.at.line)?.sizePx;
        return size !== undefined && size < 12
          ? [
              finding(undersizedUiText, {
                message: `interface text at ${size}px — below the readable floor for controls`,
                line: t.at.line,
                expected: "interface text >= 12px",
                actual: `${size}px`,
                fixHint: "raise control and label text to at least 12px",
              }),
            ]
          : [];
      });
  },
};

export const TYPE_RULES: readonly TellRule[] = [
  overusedFont,
  flatTypeHierarchy,
  oversizedH1,
  headingRhythm,
  tightLeading,
  wideTracking,
  extremeNegativeTracking,
  lineLength,
  justifiedText,
  undersizedUiText,
];
