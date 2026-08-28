/**
 * The seven rules that need a real render. Facts: a RuntimeCapture.
 *
 * These are pure functions of the capture JSON — no browser in the room, so they
 * are testable on fixtures in a hostless run. All the nondeterminism lives in
 * capture-page.ts, exactly where `ui vr` puts it.
 *
 * `content-hidden-at-rest` is the rule that justifies the whole tier: an
 * entrance animation that starts at `opacity: 0` and never fires ships a blank
 * page, static analysis provably cannot see it, and generators produce it
 * routinely.
 *
 * Enforces knowledge/design-tells.md — a "Rendered" section is added there
 * alongside these.
 */
import type { RuntimeCapture, CapturedNode } from "./rendered/runtime-capture.js";
import type { FloorFindingBase, FloorSeverity } from "./finding-schema.js";

export type RenderedFinding = FloorFindingBase & {
  /** Engine identity, so a finding is never read as universal. */
  engine: string;
};

export interface RenderedRule {
  id: string;
  severity: FloorSeverity;
  run: (capture: RuntimeCapture) => RenderedFinding[];
}

function make(
  rule: Pick<RenderedRule, "id" | "severity">,
  engine: string,
  parts: { message: string; nodeRef?: string; expected?: string; actual?: string; fixHint: string },
): RenderedFinding {
  const base = {
    checkId: rule.id,
    severity: rule.severity,
    engine,
    message: parts.message,
    expected: parts.expected,
    actual: parts.actual,
    fixHint: parts.fixHint,
  };
  return parts.nodeRef !== undefined ? { ...base, repairScope: "nodes", nodeRef: parts.nodeRef } : base;
}

const num = (raw: string | undefined): number => {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : Number.NaN;
};

const hasText = (n: CapturedNode): boolean => (n.text ?? "").length > 0;

/**
 * Content that is still invisible after the page has settled.
 *
 * The blank-page bug. An entrance animation whose start state is `opacity: 0`
 * and whose trigger never fires leaves real copy in the DOM and nothing on the
 * screen. Only a settled render can tell the difference between "animating in"
 * and "never arrived".
 */
export const contentHiddenAtRest: RenderedRule = {
  id: "content-hidden-at-rest",
  severity: "error",
  run: (capture) =>
    capture.nodes
      .filter((n) => {
        if (!hasText(n)) return false;
        if (n.computed["display"] === "none" || n.computed["visibility"] === "hidden") return false;
        // display:none and visibility:hidden are DELIBERATE hiding; opacity 0 on
        // a laid-out box with real text is the accident this rule exists for.
        const opacity = num(n.computed["opacity"]);
        const box = n.box;
        return opacity === 0 && box !== undefined && box.width > 0 && box.height > 0;
      })
      .map((n) =>
        make(contentHiddenAtRest, capture.engine.browser, {
          message: `"${(n.text ?? "").slice(0, 48)}" is still at opacity 0 after ${capture.engine.settleMs}ms — it is in the DOM and not on the screen`,
          nodeRef: n.ref,
          expected: "visible after the page settles",
          actual: "opacity: 0",
          fixHint: "fire the entrance animation, or remove the start state",
        }),
      ),
};

/** Text clipped by its own container. */
export const textOverflow: RenderedRule = {
  id: "text-overflow",
  severity: "advisory",
  run: (capture) =>
    capture.nodes
      .filter((n) => {
        if (!hasText(n) || n.scroll === undefined) return false;
        const clipped = n.computed["overflow"] === "hidden" || n.computed["overflow-x"] === "hidden";
        return clipped && n.scroll.scrollWidth > n.scroll.clientWidth + 1;
      })
      .map((n) =>
        make(textOverflow, capture.engine.browser, {
          message: `text overflows its clipped container by ${Math.round((n.scroll?.scrollWidth ?? 0) - (n.scroll?.clientWidth ?? 0))}px`,
          nodeRef: n.ref,
          expected: "text that fits, or an explicit ellipsis",
          actual: `${n.scroll?.scrollWidth}px in a ${n.scroll?.clientWidth}px box`,
          fixHint: "let the box grow, wrap the text, or truncate deliberately",
        }),
      ),
};

/** An element sitting on top of text with an opaque background. */
export const textOcclusion: RenderedRule = {
  id: "text-occlusion",
  severity: "advisory",
  run: (capture) => {
    const out: RenderedFinding[] = [];
    const texts = capture.nodes.filter((n) => hasText(n) && n.box !== undefined && num(n.computed["opacity"]) !== 0);
    const covers = capture.nodes.filter(
      (n) =>
        n.box !== undefined &&
        !hasText(n) &&
        n.computed["background-color"] !== "rgba(0, 0, 0, 0)" &&
        (n.computed["background-color"] ?? "") !== "",
    );
    for (const t of texts) {
      const tb = t.box as NonNullable<CapturedNode["box"]>;
      for (const c of covers) {
        if (c.ref === t.ref || c.ref.startsWith(t.ref)) continue;
        const cb = c.box as NonNullable<CapturedNode["box"]>;
        // Fully contained AND large enough to matter: a 2px accent overlapping a
        // heading is a design, not an occlusion.
        const contains = cb.x <= tb.x && cb.y <= tb.y &&
          cb.x + cb.width >= tb.x + tb.width && cb.y + cb.height >= tb.y + tb.height;
        if (contains && cb.width * cb.height > 0 && tb.width * tb.height > 100) {
          out.push(
            make(textOcclusion, capture.engine.browser, {
              message: `"${(t.text ?? "").slice(0, 32)}" is fully covered by an opaque ${c.tag}`,
              nodeRef: t.ref,
              expected: "text that is visible where it is drawn",
              actual: `covered by ${c.ref}`,
              fixHint: "restack, or move the text out from under the overlay",
            }),
          );
          break;
        }
      }
    }
    return out;
  },
};

/** An image element that did not load. */
export const brokenImage: RenderedRule = {
  id: "broken-image",
  severity: "error",
  run: (capture) =>
    capture.nodes
      .filter((n) => n.image !== undefined && (!n.image.complete || n.image.naturalWidth === 0))
      .map((n) =>
        make(brokenImage, capture.engine.browser, {
          message: "an <img> did not load — the page renders a broken-image box",
          nodeRef: n.ref,
          expected: "an image that loads",
          actual: `complete: ${n.image?.complete}, naturalWidth: ${n.image?.naturalWidth}`,
          fixHint: "fix the src, or remove the element",
        }),
      ),
};

/** A page whose script threw. */
export const scriptError: RenderedRule = {
  id: "script-error",
  severity: "error",
  run: (capture) =>
    capture.consoleErrors.slice(0, 5).map((err) =>
      make(scriptError, capture.engine.browser, {
        message: `the page threw: ${err.slice(0, 120)}`,
        expected: "a page that loads without throwing",
        actual: err.slice(0, 120),
        fixHint: "fix the error; anything after it did not run",
      }),
    ),
};

/** Content pushed outside the viewport's first column. */
export const firstViewportColumnOverflow: RenderedRule = {
  id: "first-viewport-column-overflow",
  severity: "advisory",
  run: (capture) => {
    const width = capture.engine.viewport.width;
    const offenders = capture.nodes.filter((n) => {
      const b = n.box;
      return b !== undefined && b.width > 0 && b.x + b.width > width + 2 && b.y < capture.engine.viewport.height;
    });
    if (offenders.length === 0) return [];
    const worst = offenders.reduce((a, b) =>
      (b.box as NonNullable<CapturedNode["box"]>).x + (b.box as NonNullable<CapturedNode["box"]>).width >
      (a.box as NonNullable<CapturedNode["box"]>).x + (a.box as NonNullable<CapturedNode["box"]>).width ? b : a,
    );
    const box = worst.box as NonNullable<CapturedNode["box"]>;
    return [
      make(firstViewportColumnOverflow, capture.engine.browser, {
        message: `${offenders.length} element(s) extend past the ${width}px viewport in the first screen, the widest by ${Math.round(box.x + box.width - width)}px`,
        nodeRef: worst.ref,
        expected: `content within ${width}px`,
        actual: `${Math.round(box.x + box.width)}px`,
        fixHint: "constrain the widest element; check for a fixed width or a negative margin",
      }),
    ];
  },
};

/** Body copy touching the viewport edge. */
export const bodyTextViewportEdge: RenderedRule = {
  id: "body-text-viewport-edge",
  severity: "advisory",
  run: (capture) => {
    const width = capture.engine.viewport.width;
    const offenders = capture.nodes.filter((n) => {
      const b = n.box;
      if (b === undefined || !hasText(n)) return false;
      const size = num(n.computed["font-size"]);
      if (!Number.isFinite(size) || size > 20) return false; // headings may bleed on purpose
      return b.x < 8 || b.x + b.width > width - 8;
    });
    if (offenders.length === 0) return [];
    return [
      make(bodyTextViewportEdge, capture.engine.browser, {
        message: `${offenders.length} run(s) of body copy sit within 8px of the viewport edge`,
        nodeRef: offenders[0]?.ref,
        expected: "a gutter between copy and the viewport",
        actual: `x = ${Math.round(offenders[0]?.box?.x ?? 0)}px`,
        fixHint: "give the container a horizontal gutter",
      }),
    ];
  },
};

export const RENDERED_RULES: readonly RenderedRule[] = [
  contentHiddenAtRest,
  textOverflow,
  textOcclusion,
  brokenImage,
  scriptError,
  firstViewportColumnOverflow,
  bodyTextViewportEdge,
];

/** Judge a capture. Pure: same capture in, same findings out. */
export function lintRendered(capture: RuntimeCapture): RenderedFinding[] {
  const out: RenderedFinding[] = [];
  for (const rule of RENDERED_RULES) out.push(...rule.run(capture));
  return out.sort((a, b) => a.checkId.localeCompare(b.checkId) || (a.nodeRef ?? "").localeCompare(b.nodeRef ?? ""));
}
