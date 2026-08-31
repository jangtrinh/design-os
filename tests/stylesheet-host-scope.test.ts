/**
 * The unresolved-stylesheet caveat, scoped by host.
 *
 * The binary never fetches remote CSS, so any remote `<link>` makes a run an
 * undercount. True, and it became noise: on 123 real pages 27% reported UNDERCOUNT
 * and roughly a third of those were a webfont loader and nothing else. A caveat
 * that fires on almost every page is one the reader learns to skip, and then it is
 * protecting nothing.
 *
 * The tempting shortcut was to classify by URL SHAPE — treat protocol-relative
 * `//…` as benign. That trades the old noise for a NEW blind spot, because `//`
 * says nothing at all about content: a protocol-relative layout sheet would be
 * waved through. The two "protocol-relative" cases below are the ones that would
 * have caught that, and they pull in opposite directions on purpose.
 */
import { describe, expect, it } from "vitest";
import { isFontCdnHref, splitUnresolvedSheets } from "../src/core/stylesheet-host-scope.js";

describe("a font CDN can cost a family name, not a layout", () => {
  it("recognises the known webfont hosts", () => {
    expect(isFontCdnHref("https://fonts.googleapis.com/css2?family=Inter")).toBe(true);
    expect(isFontCdnHref("https://fonts.gstatic.com/s/inter/v12/x.woff2")).toBe(true);
    expect(isFontCdnHref("https://use.typekit.net/abc.css")).toBe(true);
    expect(isFontCdnHref("https://fonts.bunny.net/css?family=inter")).toBe(true);
  });

  it("reads the host through a protocol-relative href", () => {
    expect(isFontCdnHref("//fonts.googleapis.com/css2?family=Inter")).toBe(true);
  });

  it("does NOT wave through a protocol-relative sheet from anywhere else", () => {
    // The whole reason classification is by host and not by URL shape.
    expect(isFontCdnHref("//cdn.example.com/layout.css")).toBe(false);
  });

  it("treats an unresolved LOCAL sheet as a real gap", () => {
    // A relative href that failed to resolve hides whatever it contained.
    expect(isFontCdnHref("./styles/base.css")).toBe(false);
    expect(isFontCdnHref("../shared/theme.css")).toBe(false);
  });

  it("scopes a shared CDN by path, not by host alone", () => {
    // jsDelivr serves everything; only its fontsource paths are fonts.
    expect(isFontCdnHref("https://cdn.jsdelivr.net/npm/@fontsource/inter/index.css")).toBe(true);
    expect(isFontCdnHref("https://cdn.jsdelivr.net/npm/bootstrap/dist/css/bootstrap.min.css")).toBe(false);
  });

  it("refuses an icon CDN, because an icon CDN is a layout CDN", () => {
    // `use.fontawesome.com` was on the allowlist and had to come off. Its all.css
    // ships border, border-radius, padding, margin, float, position, width and
    // line-height — and `.fa-spin { animation: fa-spin 2s linear infinite }`,
    // which is a `marquee` input. Checked against the served file rather than
    // assumed from the name, which is exactly how it got on the list.
    expect(isFontCdnHref("https://use.fontawesome.com/releases/v5.15.4/css/all.css")).toBe(false);
  });

  it("does not crash on an unparseable href", () => {
    expect(isFontCdnHref("")).toBe(false);
    expect(isFontCdnHref("http://[not a url")).toBe(false);
  });
});

describe("splitting keeps both halves — nothing vanishes", () => {
  it("separates font sheets from everything else, losing none", () => {
    const hrefs = [
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://cdn.example.com/layout.css",
      "//fonts.gstatic.com/s/x.woff2",
      "./styles/base.css",
    ];
    const { strict, fontOnly } = splitUnresolvedSheets(hrefs);
    expect(fontOnly).toEqual(["https://fonts.googleapis.com/css2?family=Inter", "//fonts.gstatic.com/s/x.woff2"]);
    expect(strict).toEqual(["https://cdn.example.com/layout.css", "./styles/base.css"]);
    // The count is the contract: a page's caveat must still add up to what it had.
    expect(strict.length + fontOnly.length).toBe(hrefs.length);
  });

  it("handles the empty case without inventing a caveat", () => {
    expect(splitUnresolvedSheets([])).toEqual({ strict: [], fontOnly: [] });
  });
});
