/**
 * radius-sprawl (Consistency, warning > 4 distinct — warning-only) — taste-checks-radius.ts
 * Fixtures cover: a tripping fixture, a clean fixture, the pill exemption
 * (50%/9999px/rounded-full collapsing to one bucket), and the boundary
 * (4 clean, 5 warn, 8 still warn — never errors).
 */
import { describe, expect, it } from "vitest";
import { checkRadiusSprawl } from "../src/core/taste-checks-radius.js";
import { checkEqualNestedRadii } from "../src/core/taste-checks-concentric-radius.js";
import { lintTaste } from "../src/core/taste-lint.js";

/** Build markup with `n` distinct non-zero arbitrary Tailwind radii (2px, 4px, 6px, …). */
function nRadii(n: number): string {
  return Array.from({ length: n }, (_, i) => `<div class="rounded-[${2 + i * 2}px]">x</div>`).join("\n");
}

describe("radius-sprawl", () => {
  it("flags a document with a sprawl of distinct radii and reports the count + values", () => {
    const html = nRadii(6); // 2,4,6,8,10,12px -> 6 distinct, > 4 -> warning
    const f = checkRadiusSprawl(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("radius-sprawl");
    expect(f[0]?.axis).toBe("Consistency");
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("6 distinct");
    expect(f[0]?.message).toContain("2px");
    expect(f[0]?.message).toContain("12px");
  });

  it("does NOT flag a clean document using a small, consistent radius scale", () => {
    const html = '<div class="rounded-sm">a</div><div class="rounded-md">b</div><div class="rounded-lg">c</div>';
    expect(checkRadiusSprawl(html)).toHaveLength(0);
  });

  it("does NOT count a zero radius (rounded-none / border-radius:0)", () => {
    const html = '<div class="rounded-none">a</div><style>.b{border-radius:0}</style>';
    expect(checkRadiusSprawl(html)).toHaveLength(0);
  });

  it("dedupes the same magnitude expressed via CSS, inline, and Tailwind named steps", () => {
    // rounded-lg == 8px == border-radius:8px inline — one distinct value, not three.
    const html = [
      '<div class="rounded-lg">a</div>',
      '<div style="border-radius:8px">b</div>',
      "<style>.c{border-radius:0.5rem}</style>", // 0.5rem == 8px
      '<div class="rounded-sm">d</div>', // 2px, distinct
      '<div class="rounded-md">e</div>', // 6px, distinct
      '<div class="rounded-xl">f</div>', // 12px, distinct
    ].join("\n");
    expect(checkRadiusSprawl(html)).toHaveLength(0); // 4 distinct total (8, 2, 6, 12) — clean boundary
  });

  it("exemption: 50% / 9999px / rounded-full all collapse into ONE pill bucket", () => {
    const html = [
      '<div class="rounded-full">a</div>',
      '<div style="border-radius:50%">b</div>',
      '<div style="border-radius:9999px">c</div>',
      '<div class="rounded-sm">d</div>', // 2px
      '<div class="rounded-md">e</div>', // 6px
      '<div class="rounded-lg">f</div>', // 8px
      '<div class="rounded-xl">g</div>', // 12px
      // total distinct = pill, 2px, 6px, 8px, 12px = 5 -> warning, NOT more from the 3 pill forms
    ].join("\n");
    const f = checkRadiusSprawl(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("5 distinct");
    expect(f[0]?.message).toContain("pill");
  });

  it("boundary: exactly 4 distinct non-zero radii is clean", () => {
    expect(checkRadiusSprawl(nRadii(4))).toHaveLength(0);
  });

  it("boundary: exactly 5 distinct non-zero radii warns", () => {
    const f = checkRadiusSprawl(nRadii(5));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("warning");
  });

  it("boundary: 8 distinct non-zero radii still warns (warning-only, never errors)", () => {
    const f = checkRadiusSprawl(nRadii(8));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("warning");
  });
});

describe("lintTaste — radius-sprawl wired", () => {
  it("registers the check and keeps warning severity", () => {
    const r = lintTaste(nRadii(6));
    const finding = r.findings.find((f) => f.checkId === "radius-sprawl");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
    expect(r.warningCount).toBeGreaterThanOrEqual(1);
  });

  it("a clean document trips no radius-sprawl finding", () => {
    const r = lintTaste('<div class="rounded-sm">a</div><div class="rounded-md">b</div>');
    expect(r.findings.some((f) => f.checkId === "radius-sprawl")).toBe(false);
  });
});

// ─── equal-nested-radii (Spacing, warning) ──────────────────────────────────

describe("equal-nested-radii", () => {
  it("flags a padded parent and direct child sharing the same rounded step", () => {
    const f = checkEqualNestedRadii('<div class="rounded-xl p-4"><div class="rounded-xl">inner</div></div>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("equal-nested-radii");
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("padding");
  });
  it("flags equal arbitrary px values too", () => {
    expect(checkEqualNestedRadii('<div class="rounded-[12px] p-2"><img class="rounded-[12px]" src="x" alt=""></div>')).toHaveLength(1);
  });
  it("passes when the child steps down (concentric)", () => {
    expect(checkEqualNestedRadii('<div class="rounded-2xl p-2"><div class="rounded-lg">inner</div></div>')).toEqual([]);
  });
  it("passes when the parent has no padding (flush corners are legitimate)", () => {
    expect(checkEqualNestedRadii('<div class="rounded-xl"><div class="rounded-xl">flush</div></div>')).toEqual([]);
  });
  it("exempts the pill bucket (rounded-full in rounded-full)", () => {
    expect(checkEqualNestedRadii('<div class="rounded-full p-1"><span class="rounded-full">dot</span></div>')).toEqual([]);
  });
});

describe("equal-nested-radii — void/unclosed parents never wrap the document", () => {
  it("a void element (input/img) never becomes a parent scanning the rest of the document", () => {
    const html = '<input id="em" type="email" class="rounded-lg p-3 border">' +
      '<section><article class="rounded-lg">siblings, not nested</article></section>';
    expect(checkEqualNestedRadii(html)).toEqual([]);
    expect(checkEqualNestedRadii('<img class="rounded-2xl p-2" src="x" alt=""><div class="rounded-2xl">later</div>')).toEqual([]);
  });
  it("an unclosed padded container is skipped, not treated as wrapping everything after it", () => {
    expect(checkEqualNestedRadii('<li class="rounded-md p-2">open<div class="rounded-md">far away</div>')).toEqual([]);
  });
});
