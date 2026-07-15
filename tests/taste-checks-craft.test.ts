/**
 * The two spec-003 P1 craft lints:
 *   tap-target-undersized (Spacing, warning) — taste-checks-tap-target.ts
 *   ai-cliche-gradient    (Depth/Surface, error) — taste-checks-gradient.ts
 * Each check gets fixtures that fire every prong plus passing negatives, then a
 * final block drives them through lintTaste() to prove wiring, severity split,
 * and that the warning never bumps errorCount.
 */
import { describe, expect, it } from "vitest";
import { checkTapTargetUndersized } from "../src/core/taste-checks-tap-target.js";
import { checkAiClicheGradient } from "../src/core/taste-checks-gradient.js";
import { lintTaste } from "../src/core/taste-lint.js";

// ─── tap-target-undersized (Spacing / warning) ──────────────────────────────────

describe("tap-target-undersized", () => {
  it("Prong A: flags a fixed Tailwind height below 44px (h-10 = 40px)", () => {
    const f = checkTapTargetUndersized('<button class="w-10 h-10 rounded-full">x</button>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("tap-target-undersized");
    expect(f[0]?.axis).toBe("Spacing");
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("40px");
  });

  it("Prong A: flags an arbitrary-px fixed height (h-[36px]) and inline height", () => {
    expect(checkTapTargetUndersized('<a href="#" class="h-[36px]">go</a>')).toHaveLength(1);
    expect(checkTapTargetUndersized('<button style="height:32px">go</button>')).toHaveLength(1);
  });

  it("Prong B: flags a min-height floor below 44px with no vertical padding", () => {
    const f = checkTapTargetUndersized('<button class="min-h-[32px]">Go</button>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("min-height 32px");
  });

  it("Prong C: flags an icon-only button with ≤8px padding and no height", () => {
    expect(checkTapTargetUndersized('<button class="p-1"><svg></svg></button>')).toHaveLength(1);
    expect(checkTapTargetUndersized('<button class="p-2" aria-label="menu"><i data-lucide="menu"></i></button>')).toHaveLength(1);
  });

  it("flags [role=button] and [onclick] carriers too", () => {
    expect(checkTapTargetUndersized('<div role="button" class="h-8">x</div>')).toHaveLength(1);
    expect(checkTapTargetUndersized('<div onclick="go()" class="h-[20px]">x</div>')).toHaveLength(1);
  });

  it("does NOT flag an adequately sized control (h-11 = 44px, px-4)", () => {
    expect(checkTapTargetUndersized('<button class="h-11 px-4">Save</button>')).toHaveLength(0);
  });

  it("does NOT flag a plain text link with no size utilities", () => {
    expect(checkTapTargetUndersized('<a href="/about">About us</a>')).toHaveLength(0);
  });

  it("does NOT flag a min-height floor that carries compensating padding", () => {
    expect(checkTapTargetUndersized('<button class="min-h-[36px] py-3">Go</button>')).toHaveLength(0);
  });

  it("does NOT flag an icon button with enough padding (p-3 = 12px)", () => {
    expect(checkTapTargetUndersized('<button class="p-3"><svg></svg></button>')).toHaveLength(0);
  });

  it("does NOT double-count a sized icon button (scan-1 wins, scan-2 skips)", () => {
    expect(checkTapTargetUndersized('<button class="h-8 p-1"><svg></svg></button>')).toHaveLength(1);
  });
});

// ─── ai-cliche-gradient (Depth/Surface / error) ─────────────────────────────────

describe("ai-cliche-gradient", () => {
  it("flags a large-surface hex gradient in the violet band (indigo→purple)", () => {
    const f = checkAiClicheGradient('<section style="background:linear-gradient(135deg,#6366f1,#a855f7)">hi</section>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("ai-cliche-gradient");
    expect(f[0]?.axis).toBe("Depth/Surface");
    expect(f[0]?.severity).toBe("error");
  });

  it("flags an rgb() violet radial glow on a full-bleed inset overlay", () => {
    const f = checkAiClicheGradient('<div class="absolute inset-0" style="background:radial-gradient(circle,rgba(123,66,246,0.3),transparent)"></div>');
    expect(f).toHaveLength(1);
  });

  it("flags a named Tailwind gradient (from-indigo via-purple to-pink) on a large surface", () => {
    expect(checkAiClicheGradient('<div class="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500"></div>')).toHaveLength(1);
  });

  it("flags a <style>-rule gradient on a hero selector (no line number)", () => {
    const f = checkAiClicheGradient('<style>.hero-bg{background:linear-gradient(#8b5cf6,#d946ef)}</style>');
    expect(f).toHaveLength(1);
    expect(f[0]?.line).toBeUndefined();
  });

  it("does NOT flag a violet gradient on a small accent (a button)", () => {
    expect(checkAiClicheGradient('<button class="rounded-full" style="background:linear-gradient(#6366f1,#a855f7)">x</button>')).toHaveLength(0);
  });

  it("does NOT flag a blue gradient (hue below the band)", () => {
    expect(checkAiClicheGradient('<section style="background:linear-gradient(#3b82f6,#60a5fa)">x</section>')).toHaveLength(0);
  });

  it("does NOT flag a warm/brand gradient (orange)", () => {
    expect(checkAiClicheGradient('<section style="background:linear-gradient(#ff3e00,#ff8a3d)">x</section>')).toHaveLength(0);
  });

  it("exempts the whole doc when a brand token itself declares a violet hue", () => {
    const html = '<style>:root{--color-primary:#8b5cf6}</style><section style="background:linear-gradient(#6366f1,#a855f7)">x</section>';
    expect(checkAiClicheGradient(html)).toHaveLength(0);
  });

  it("does NOT flag a desaturated blue-grey glow (chroma below the floor)", () => {
    expect(checkAiClicheGradient('<div class="absolute inset-0" style="background:radial-gradient(circle,rgba(60,70,90,0.35),transparent)"></div>')).toHaveLength(0);
  });
});

// ─── lintTaste wiring — severity split ──────────────────────────────────────────

describe("lintTaste — craft lints wired with correct severity", () => {
  it("counts ai-cliche as an error and tap-target as a warning", () => {
    const bad = [
      '<section style="background:linear-gradient(135deg,#6366f1,#a855f7)">',
      '<button class="h-10">x</button>',
      "</section>",
    ].join("\n");
    const r = lintTaste(bad);
    const ids = new Set(r.findings.map((f) => f.checkId));
    expect(ids.has("ai-cliche-gradient")).toBe(true);
    expect(ids.has("tap-target-undersized")).toBe(true);
    expect(r.errorCount).toBeGreaterThanOrEqual(1); // ai-cliche
    expect(r.warningCount).toBeGreaterThanOrEqual(1); // tap-target
    expect(r.axesAffected).toContain("Depth/Surface");
    expect(r.axesAffected).toContain("Spacing");
  });

  it("a warning-only document keeps errorCount 0 (exit stays green)", () => {
    const r = lintTaste('<button class="h-9">x</button>');
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(1);
  });

  it("clean DS-faithful markup trips neither craft lint", () => {
    const clean = '<section class="hero"><button class="h-11 px-4">Save</button></section>';
    const r = lintTaste(clean);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
  });
});
