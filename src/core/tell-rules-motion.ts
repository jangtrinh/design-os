/**
 * Motion and decoration tells. Facts: `motion`, `structure`, `gradient`, `radius`.
 *
 * These describe motion that SIMULATES something — liveness, typing, light —
 * where nothing is actually happening. `taste`'s motion checks own the rubric
 * violations (linear easing, transition: all, missing reduced-motion); this
 * family owns the habits.
 *
 * Enforces knowledge/design-tells.md § Motion and decoration.
 */
import type { TellRule } from "./tell-rules.js";
import { finding, sameOwner } from "./tell-rules.js";
import { thr } from "./tell-thresholds.js";

const SECTION = "Motion and decoration";

/** An infinitely repeating animation on a small round element. */
export const pulsingDot: TellRule = {
  id: "pulsing-dot",
  needs: ["motion", "radius"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const radii = facts.by("radius");
    return facts
      .by("motion")
      .filter((m) => m.repeatsForever === true)
      .flatMap((m) => {
        // A dot: fully rounded on the same line as the looping animation.
        const dot = radii.find((r) => sameOwner(r, m) && r.px >= thr("PILL_RADIUS_PX"));
        return dot === undefined
          ? []
          : [
              finding(pulsingDot, {
                message: "a pulsing round indicator looping forever — liveness simulated, not reported",
                line: m.at.line,
                expected: "pulse reserved for genuinely changing data",
                actual: "infinite animation on a fully-rounded element",
                fixHint: "make it static and label the state, or drive the pulse from real updates",
              }),
            ];
      });
  },
};

export const blinkingCursor: TellRule = {
  id: "blinking-cursor",
  needs: ["motion", "structure"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const inputs = new Set(["input", "textarea"]);
    const hasRealInput = facts.by("structure").some((s) => inputs.has(s.node.toLowerCase()));
    if (hasRealInput) return [];
    const blinkers = facts
      .by("motion")
      .filter((m) => m.repeatsForever === true && (m.durationMs ?? 9999) <= thr("FAST_LOOP_MAX_MS"));
    if (blinkers.length === 0) return [];
    return [
      finding(blinkingCursor, {
        message: "a fast looping animation reading as a blinking caret, with no editable field on the page",
        line: blinkers[0]?.at.line,
        expected: "a caret only where there is input",
        actual: `${blinkers[0]?.durationMs ?? "?"}ms infinite loop`,
        fixHint: "delete the fake prompt; let the composition hold attention",
      }),
    ];
  },
};

/**
 * Does anything a reader must READ live under this node?
 *
 * The rule below claims "auto-scrolling CONTENT the reader cannot pause", so it
 * owes a check that content is what moves. Content means a text run or an image —
 * there is no `img` fact kind, so an image is a `structure` fact whose node is `img`.
 *
 * REFUTATION, not a requirement. It answers false only when the facts positively
 * show an empty subtree; every path where the evidence is missing answers TRUE and
 * the finding stands. That asymmetry is deliberate and it is why `needs` stays
 * `["motion"]`: `css-only` supplies motion with no structure and no text, and
 * `swiftui`/`flutter` supply motion and text with no structure. Adding those kinds
 * to `needs` would turn this rule NOT-EVALUATED on three extractors that run it
 * today — silencing real findings under the cover of a coverage change, which is
 * exactly the mistake this repo has already paid for twice.
 */
function subtreeHasReadableContent(facts: Parameters<TellRule["run"]>[0], ownerRef: string | undefined): boolean {
  if (ownerRef === undefined) return true; // the extractor cannot name the owner
  const structures = facts.by("structure");
  if (structures.length === 0) return true; // no tree to walk: not evidence of emptiness

  const childrenOf = new Map<string, string[]>();
  for (const s of structures) {
    if (s.parentRef === undefined) continue;
    const list = childrenOf.get(s.parentRef);
    if (list === undefined) childrenOf.set(s.parentRef, [s.ref]);
    else list.push(s.ref);
  }

  const carriesContent = new Set<string>();
  for (const t of facts.by("text")) {
    // Head metadata is not copy anyone reads; it cannot make a marquee.
    if (t.role !== "metadata" && t.at.nodeRef !== undefined) carriesContent.add(t.at.nodeRef);
  }
  for (const s of structures) if (s.node.toLowerCase() === "img") carriesContent.add(s.ref);

  const seen = new Set<string>([ownerRef]);
  const queue = [ownerRef];
  while (queue.length > 0) {
    const ref = queue.shift() as string;
    if (carriesContent.has(ref)) return true;
    for (const child of childrenOf.get(ref) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return false;
}

export const marquee: TellRule = {
  id: "marquee",
  needs: ["motion"],
  severity: "advisory",
  section: SECTION,
  run: (facts) =>
    facts
      .by("motion")
      // Long, infinite, and not a micro-interaction: an auto-scrolling band.
      .filter((m) => m.repeatsForever === true && (m.durationMs ?? 0) >= thr("SLOW_LOOP_MIN_MS"))
      // ...and carrying something to read. A decorative scanline sweeping an empty
      // overlay loops forever too, and nothing the reader needs is moving.
      .filter((m) => subtreeHasReadableContent(facts, m.at.nodeRef))
      .map((m) =>
        finding(marquee, {
          message: `auto-scrolling content on a ${Math.round((m.durationMs as number) / 1000)}s infinite loop the reader cannot pause`,
          line: m.at.line,
          expected: "content the reader controls",
          actual: `${m.durationMs}ms infinite`,
          fixHint: "make it static, or give it a pause control",
        }),
      ),
};

export const imageHoverTransform: TellRule = {
  id: "image-hover-transform",
  needs: ["motion", "structure"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const images = facts.by("structure").filter((s) => s.node.toLowerCase() === "img");
    if (images.length < 3) return [];
    const transforms = facts
      .by("motion")
      .filter((m) => m.motionKind === "transition" && (m.props ?? []).some((p) => /transform|scale|rotate/i.test(p)));
    if (transforms.length === 0) return [];
    return [
      finding(imageHoverTransform, {
        message: `a transform transition applied across ${images.length} images — motion by default rather than by intent`,
        line: transforms[0]?.at.line,
        expected: "motion where it carries meaning",
        actual: `${transforms.length} transform transitions over ${images.length} images`,
        fixHint: "keep the effect where it says something; drop the rest",
      }),
    ];
  },
};

export const shapeAssembledIllustration: TellRule = {
  id: "shape-assembled-illustration",
  needs: ["structure", "radius"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const structures = facts.by("structure");
    const radii = facts.by("radius");
    // A cluster of sibling leaf elements, all rounded, none carrying text —
    // primitive shapes stacked where a drawing belongs.
    const byParent = new Map<string, number>();
    const texted = new Set(facts.by("text").map((t) => t.at.line));
    for (const s of structures) {
      if (s.parentRef === undefined) continue;
      if (texted.has(s.at.line)) continue;
      if (!radii.some((r) => r.px > 0 && sameOwner(r, s))) continue;
      byParent.set(s.parentRef, (byParent.get(s.parentRef) ?? 0) + 1);
    }
    const worst = [...byParent.entries()].filter(([, n]) => n >= thr("ICON_TILE_MIN_COUNT")).sort((a, b) => b[1] - a[1])[0];
    if (worst === undefined) return [];
    return [
      finding(shapeAssembledIllustration, {
        message: `${worst[1]} rounded, textless sibling shapes under ${worst[0]} — an illustration assembled from primitives`,
        expected: "a drawn asset, or no illustration",
        actual: `${worst[1]} stacked shapes`,
        fixHint: "use a real illustration or icon, or drop the decoration",
      }),
    ];
  },
};

export const radialSpotlightGlow: TellRule = {
  id: "radial-spotlight-glow",
  needs: ["gradient", "text"],
  severity: "advisory",
  section: SECTION,
  run: (facts) => {
    const h1 = facts.by("text").find((t) => t.role === "heading" && t.level === 1);
    if (h1 === undefined) return [];
    const near = facts
      .by("gradient")
      .filter((g) => g.gradientKind === "radial" && Math.abs(g.at.line - h1.at.line) <= thr("HALO_MAX_LINE_GAP"));
    if (near.length === 0) return [];
    return [
      finding(radialSpotlightGlow, {
        message: "a radial spotlight behind the hero headline — depth borrowed rather than built",
        line: near[0]?.at.line,
        expected: "hierarchy from type and space",
        actual: "radial gradient behind the h1",
        fixHint: "remove the spotlight; let the headline carry the section",
      }),
    ];
  },
};

export const MOTION_RULES: readonly TellRule[] = [
  pulsingDot,
  blinkingCursor,
  marquee,
  imageHoverTransform,
  shapeAssembledIllustration,
  radialSpotlightGlow,
];
