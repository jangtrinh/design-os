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
 * Nodes that are content in themselves, with no text underneath them.
 *
 * There is no `img` fact kind, so a picture is a `structure` fact whose node names
 * it. An inline `<svg>` is the one that matters most in practice: a partner-logo
 * marquee is a band of SVGs and not a word of copy, and it is the canonical thing
 * this rule exists to catch.
 */
const CONTENT_NODES = new Set(["img", "svg", "picture", "video", "canvas", "iframe", "object", "embed"]);

/**
 * Does anything a reader must READ or LOOK AT live under this node?
 *
 * The rule below claims "auto-scrolling CONTENT the reader cannot pause", so it
 * owes a check that content is what moves.
 *
 * REFUTATION, not a requirement: it answers false only when the facts positively
 * show a subtree with nothing in it. Every path where the evidence is missing or
 * unusable answers TRUE and the finding stands. That asymmetry is the whole design
 * — a rule must not go quiet because a reader was blind.
 *
 * `needs` stays `["motion"]` because that is what the rule REQUIRES to run;
 * structure and text are refutation evidence, not inputs. An earlier version of
 * this comment justified that by claiming `css-only`, `swiftui` and `flutter` would
 * lose findings if those kinds were promoted. **That justification was false** and
 * is recorded here so nobody rebuilds on it: `sfc-extractor` (which serves both
 * `sfc` and `css-only`) emits `repeatsForever` and never sets `durationMs`, and
 * `flutter` emits easing, duration and repeat as three DISJOINT motion facts — so
 * on all three, `repeatsForever && durationMs >= SLOW_LOOP_MIN_MS` cannot be true
 * of one fact, and none of them can fire this rule at all. In practice `marquee` is
 * html-cascade-only. The conclusion happened to be right; the reason was not.
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
  // An extractor that names nodes but not their parents gives a tree with no edges,
  // and a walk over it reaches exactly one node and reports "empty" for every
  // element on the page. That is blindness reported as a verdict. If nothing here
  // carries a parent link, refuse to refute.
  if (childrenOf.size === 0) return true;

  const carriesContent = new Set<string>();
  for (const t of facts.by("text")) {
    // Head metadata is not copy anyone reads; it cannot make a marquee.
    if (t.role !== "metadata" && t.at.nodeRef !== undefined) carriesContent.add(t.at.nodeRef);
  }
  for (const s of structures) if (CONTENT_NODES.has(s.node.toLowerCase())) carriesContent.add(s.ref);

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
