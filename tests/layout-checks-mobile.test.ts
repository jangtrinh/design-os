/**
 * The spec-003 P3 mobile machine floor:
 *   tap-spacing-cramped    (warning) — layout-checks-mobile.ts   (M2)
 *   input-font-below-16    (warning) — layout-checks-mobile.ts   (M4)
 *   edge-bar-no-safe-area  (warning) — layout-checks-mobile.ts   (M5)
 *   dvh-over-100vh         (warning) — layout-checks-viewport.ts (M6)
 * Fixtures fire each prong plus passing negatives, then a wiring block drives them
 * through lintLayout() to prove registration (all warnings — exit stays green).
 * M1 (tap-target-undersized) lives in taste-checks-tap-target.ts — not retested here.
 */
import { describe, expect, it } from "vitest";
import {
  checkTapSpacingCramped,
  checkInputFontBelow16,
  checkEdgeBarNoSafeArea,
} from "../src/core/layout-checks-mobile.js";
import { checkDvhOver100vh } from "../src/core/layout-checks-viewport.js";
import { lintLayout } from "../src/core/layout-lint.js";

// ─── M2 tap-spacing-cramped (warning) ────────────────────────────────────────────

describe("tap-spacing-cramped", () => {
  it("flags a flex row of 2+ controls with gap-1 (<8px)", () => {
    const f = checkTapSpacingCramped('<div class="flex gap-1"><button>A</button><button>B</button></div>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("tap-spacing-cramped");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags gap-0 and inline gap:4px too", () => {
    expect(checkTapSpacingCramped('<nav class="grid gap-0"><a href="#">1</a><a href="#">2</a></nav>')).toHaveLength(1);
    expect(checkTapSpacingCramped('<div class="flex" style="gap:4px"><button>1</button><button>2</button></div>')).toHaveLength(1);
  });

  it("does NOT flag gap-2 (8px, on the floor)", () => {
    expect(checkTapSpacingCramped('<div class="flex gap-2"><button>A</button><button>B</button></div>')).toHaveLength(0);
  });

  it("does NOT flag a small gap with only ONE control", () => {
    expect(checkTapSpacingCramped('<div class="flex gap-1"><button>A</button><span>label</span></div>')).toHaveLength(0);
  });

  it("does NOT flag a flex container with no declared gap", () => {
    expect(checkTapSpacingCramped('<div class="flex"><button>A</button><button>B</button></div>')).toHaveLength(0);
  });

  it("does NOT flag a non-flex/grid container", () => {
    expect(checkTapSpacingCramped('<div class="gap-1"><button>A</button><button>B</button></div>')).toHaveLength(0);
  });

  it("does NOT confuse gap-10 (40px) for gap-1", () => {
    expect(checkTapSpacingCramped('<div class="flex gap-10"><button>A</button><button>B</button></div>')).toHaveLength(0);
  });
});

// ─── M4 input-font-below-16 (warning) ────────────────────────────────────────────

describe("input-font-below-16", () => {
  it("flags text-sm on an <input>", () => {
    const f = checkInputFontBelow16('<input type="text" class="text-sm">');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("input-font-below-16");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags text-xs, an arbitrary sub-16px size, and a <textarea>/<select>", () => {
    expect(checkInputFontBelow16('<input class="text-xs">')).toHaveLength(1);
    expect(checkInputFontBelow16('<input class="text-[14px]">')).toHaveLength(1);
    expect(checkInputFontBelow16('<textarea style="font-size:13px"></textarea>')).toHaveLength(1);
    expect(checkInputFontBelow16('<select class="text-sm"></select>')).toHaveLength(1);
  });

  it("does NOT flag text-base (16px) or a ≥16px arbitrary size", () => {
    expect(checkInputFontBelow16('<input class="text-base">')).toHaveLength(0);
    expect(checkInputFontBelow16('<input class="text-[16px]">')).toHaveLength(0);
    expect(checkInputFontBelow16('<input class="text-[18px]">')).toHaveLength(0);
  });

  it("does NOT flag a non-text input (checkbox/submit) even with text-sm", () => {
    expect(checkInputFontBelow16('<input type="checkbox" class="text-sm">')).toHaveLength(0);
    expect(checkInputFontBelow16('<input type="submit" class="text-xs">')).toHaveLength(0);
  });

  it("does NOT flag an input with no declared font-size", () => {
    expect(checkInputFontBelow16('<input type="text" class="rounded border">')).toHaveLength(0);
  });
});

// ─── M5 edge-bar-no-safe-area (warning) ──────────────────────────────────────────

describe("edge-bar-no-safe-area", () => {
  it("flags a fixed bottom-0 bar with no safe-area padding", () => {
    const f = checkEdgeBarNoSafeArea('<nav class="fixed bottom-0 inset-x-0"><a href="#">Home</a></nav>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("edge-bar-no-safe-area");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags a named bottom tab-bar", () => {
    expect(checkEdgeBarNoSafeArea('<div class="fixed tab-bar">x</div>')).toHaveLength(1);
  });

  it("does NOT flag a sticky top-0 header (precision: top inset only bites in standalone/PWA)", () => {
    expect(checkEdgeBarNoSafeArea('<header class="sticky top-0">x</header>')).toHaveLength(0);
  });

  it("does NOT flag when the element pads for the safe area itself", () => {
    expect(checkEdgeBarNoSafeArea('<nav class="fixed bottom-0" style="padding-bottom:env(safe-area-inset-bottom)">x</nav>')).toHaveLength(0);
    expect(checkEdgeBarNoSafeArea('<nav class="fixed bottom-0 pb-safe">x</nav>')).toHaveLength(0);
  });

  it("does NOT flag when a CSS rule on the element's class handles the safe area", () => {
    const html = '<style>.tabbar{padding-bottom:env(safe-area-inset-bottom)}</style><nav class="fixed bottom-0 tabbar">x</nav>';
    expect(checkEdgeBarNoSafeArea(html)).toHaveLength(0);
  });

  it("does NOT flag a fixed element that is not at a viewport edge", () => {
    expect(checkEdgeBarNoSafeArea('<div class="fixed right-4 bottom-8">tooltip</div>')).toHaveLength(0);
  });

  it("does NOT flag a non-positioned bar", () => {
    expect(checkEdgeBarNoSafeArea('<nav class="flex bottom-0">x</nav>')).toHaveLength(0);
  });
});

// ─── M6 dvh-over-100vh (warning) ─────────────────────────────────────────────────

describe("dvh-over-100vh", () => {
  it("flags a CSS height:100vh declaration", () => {
    const f = checkDvhOver100vh("<style>.hero{min-height:100vh}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("dvh-over-100vh");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags h-screen / min-h-screen utilities", () => {
    expect(checkDvhOver100vh('<div class="h-screen"></div>')).toHaveLength(1);
    expect(checkDvhOver100vh('<section class="min-h-screen"></section>')).toHaveLength(1);
  });

  it("does NOT flag the dynamic-viewport equivalents", () => {
    expect(checkDvhOver100vh("<style>.hero{min-height:100dvh}</style>")).toHaveLength(0);
    expect(checkDvhOver100vh('<div class="min-h-dvh"></div>')).toHaveLength(0);
  });

  it("does NOT flag a non-full-viewport height (80vh)", () => {
    expect(checkDvhOver100vh('<div class="min-h-[80vh]"></div>')).toHaveLength(0);
    expect(checkDvhOver100vh("<style>.a{height:80vh}</style>")).toHaveLength(0);
  });
});

// ─── lintLayout wiring — all warnings, exit stays green ───────────────────────────

describe("lintLayout — P3 mobile floor wired as warnings", () => {
  it("registers all four and none bumps errorCount", () => {
    const html = [
      "<!doctype html><html><body>",
      '<div class="flex gap-1"><button>A</button><button>B</button></div>',
      '<input type="text" class="text-sm">',
      '<nav class="fixed bottom-0 inset-x-0"><a href="#">Home</a></nav>',
      '<section class="min-h-screen">hero</section>',
      "</body></html>",
    ].join("\n");
    const r = lintLayout(html);
    const found = new Set(r.findings.map((f) => f.checkId));
    for (const id of ["tap-spacing-cramped", "input-font-below-16", "edge-bar-no-safe-area", "dvh-over-100vh"]) {
      expect(found.has(id)).toBe(true);
    }
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBeGreaterThanOrEqual(4);
  });
});
