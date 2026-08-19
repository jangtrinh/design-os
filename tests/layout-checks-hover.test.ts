/**
 * sticky-hover-unguarded (warning) — layout-checks-hover.ts. A raw CSS `:hover`
 * rule on a mobile-intent document, outside any `@media (hover: hover)` guard:
 * on touch, `:hover` styling sticks after a tap and reads as selected. Positive
 * fixture, guard/intent/Tailwind negatives, then a lintLayout() wiring probe.
 */
import { describe, expect, it } from "vitest";
import { checkStickyHoverUnguarded } from "../src/core/layout-checks-hover.js";
import { lintLayout } from "../src/core/layout-lint.js";

/** A viewport meta marks the document as mobile-intent. */
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';

describe("sticky-hover-unguarded", () => {
  it("flags an unguarded :hover rule on a mobile-intent document", () => {
    const f = checkStickyHoverUnguarded(`${VIEWPORT}<style>.btn:hover{background:#eee}</style>`);
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("sticky-hover-unguarded");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags when mobile intent comes from a width media query instead of the meta", () => {
    const html = "<style>@media (max-width: 640px){.nav{display:none}} .btn:hover{color:red}</style>";
    expect(checkStickyHoverUnguarded(html)).toHaveLength(1);
  });

  it("passes when every :hover rule sits inside @media (hover: hover)", () => {
    const html = `${VIEWPORT}<style>@media (hover: hover){.btn:hover{background:#eee}.link:hover{color:red}}</style>`;
    expect(checkStickyHoverUnguarded(html)).toEqual([]);
  });

  it("accepts the (any-hover: hover) and space-free (hover:hover) forms too", () => {
    expect(checkStickyHoverUnguarded(`${VIEWPORT}<style>@media (any-hover: hover){.a:hover{opacity:.8}}</style>`)).toEqual([]);
    expect(checkStickyHoverUnguarded(`${VIEWPORT}<style>@media(hover:hover){.a:hover{opacity:.8}}</style>`)).toEqual([]);
  });

  it("still flags an unguarded :hover inside an unrelated media query", () => {
    const html = `${VIEWPORT}<style>@media (min-width: 768px){.btn:hover{background:#eee}}</style>`;
    expect(checkStickyHoverUnguarded(html)).toHaveLength(1);
  });

  it("passes on a document with no mobile intent (desktop-only page)", () => {
    expect(checkStickyHoverUnguarded("<style>.btn:hover{background:#eee}</style>")).toEqual([]);
  });

  it("does not count a :hover mentioned inside a CSS comment", () => {
    const html = `${VIEWPORT}<style>/* real :hover only where hover exists */ @media (hover: hover){.a:hover{opacity:.8}}</style>`;
    expect(checkStickyHoverUnguarded(html)).toEqual([]);
  });

  it("does not fire on Tailwind hover: utility classes (guarded by the framework)", () => {
    expect(checkStickyHoverUnguarded(`${VIEWPORT}<button class="hover:bg-gray-100">Go</button>`)).toEqual([]);
  });

  it("is wired into lintLayout as a warning (exit stays green)", () => {
    const res = lintLayout(`<!doctype html><html lang="en"><head>${VIEWPORT}<title>t</title><style>.b:hover{color:red}</style></head><body><p>hi</p></body></html>`);
    expect(res.findings.map((f) => f.checkId)).toContain("sticky-hover-unguarded");
    expect(res.errorCount).toBe(0);
  });
});
