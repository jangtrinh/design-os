/**
 * The three spec-003 P2 taste-lint craft checks:
 *   font-scale-sprawl      (Typography, warning>7 / error>10) — taste-checks-font-scale.ts
 *   mode-invisible-surface (Depth/Surface, error)            — taste-checks-invisible-surface.ts
 *   z-index-off-ladder     (Depth/Surface, warning)          — taste-checks-depth.ts
 * Fixtures fire every prong plus passing negatives, then a wiring block drives
 * them through lintTaste() to prove registration and the severity split.
 */
import { describe, expect, it } from "vitest";
import { checkFontScaleSprawl } from "../src/core/taste-checks-font-scale.js";
import { checkModeInvisibleSurface, inspectInvisibleSurface } from "../src/core/taste-checks-invisible-surface.js";
import { checkZIndexOffLadder } from "../src/core/taste-checks-depth.js";
import { lintTaste } from "../src/core/taste-lint.js";

// ─── font-scale-sprawl (Typography / warning→error) ─────────────────────────────

/** Build markup with `n` distinct arbitrary Tailwind font sizes (13px, 14px, …). */
function nSizes(n: number): string {
  return Array.from({ length: n }, (_, i) => `<p class="text-[${13 + i}px]">x</p>`).join("\n");
}

describe("font-scale-sprawl", () => {
  it("warns at 8 distinct arbitrary sizes (> 7)", () => {
    const f = checkFontScaleSprawl(nSizes(8));
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("font-scale-sprawl");
    expect(f[0]?.axis).toBe("Typography");
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("8 distinct");
  });

  it("errors at 11 distinct arbitrary sizes (> 10)", () => {
    const f = checkFontScaleSprawl(nSizes(11));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("error");
  });

  it("counts raw CSS font-size and dedupes equivalent units (16px == 1rem)", () => {
    const css = "<style>.a{font-size:16px}.b{font-size:1rem}</style>"; // one distinct size
    expect(checkFontScaleSprawl(css + nSizes(7))).toHaveLength(0); // 7 tw + 1 css = 8 → but 16px dup? 13..19 + 16 dup → 7
  });

  it("does NOT count named Tailwind steps or var() token sizes", () => {
    const html = '<p class="text-xs">a</p><p class="text-sm">b</p><p class="text-lg">c</p>' +
      '<p class="text-xl">d</p><p class="text-2xl">e</p><p class="text-3xl">f</p>' +
      '<p class="text-4xl">g</p><p class="text-5xl">h</p>' +
      "<style>.x{font-size:var(--step-1)}.y{font-size:var(--step-2)}</style>";
    expect(checkFontScaleSprawl(html)).toHaveLength(0);
  });

  it("does NOT flag a tight scale of 7 sizes", () => {
    expect(checkFontScaleSprawl(nSizes(7))).toHaveLength(0);
  });
});

// ─── mode-invisible-surface (Depth/Surface / error) ─────────────────────────────

describe("mode-invisible-surface", () => {
  it("flags border-white/10 on a light-mode document", () => {
    const f = checkModeInvisibleSurface('<body class="bg-white"><div class="border border-white/10">x</div></body>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("mode-invisible-surface");
    expect(f[0]?.axis).toBe("Depth/Surface");
    expect(f[0]?.severity).toBe("error");
    expect(f[0]?.message).toContain("light-mode");
  });

  it("flags bg-white/5 on a light (default) document", () => {
    expect(checkModeInvisibleSurface('<div class="bg-white/5">x</div>')).toHaveLength(1);
  });

  it("still reads a genuine root rule — `html, body { background: #0b0b0b }` is dark", () => {
    // The root scan now takes only rules whose SUBJECT is the root. This proves
    // "ignore descendants" did not degrade into "ignore everything": a real root
    // rule must still set the mode.
    const html = [
      "<style>html, body { background: #0b0b0b }</style>",
      '<body><div class="border border-black/10">x</div></body>',
    ].join("\n");
    const f = checkModeInvisibleSurface(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("dark-mode");
  });

  it("flags a literal rgba(255,255,255,0.08) background on a light document", () => {
    const f = checkModeInvisibleSurface('<div style="background:rgba(255,255,255,0.08)">x</div>');
    expect(f).toHaveLength(1);
  });

  it("flags the dark inverse — border-black/10 on a dark-mode document", () => {
    const f = checkModeInvisibleSurface('<body class="dark bg-slate-950"><div class="border-black/10">x</div></body>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("dark-mode");
  });

  it("does NOT flag border-white/10 on a DARK document (it is the correct hairline there)", () => {
    expect(checkModeInvisibleSurface('<body class="dark bg-black"><div class="border-white/10">x</div></body>')).toHaveLength(0);
  });

  it("does NOT flag a visible-alpha tint (border-white/20 ≥ 0.15)", () => {
    expect(checkModeInvisibleSurface('<body class="bg-white"><div class="border-white/20">x</div></body>')).toHaveLength(0);
  });

  it("does NOT flag a low-alpha WHITE text tint (text is not a surface boundary)", () => {
    expect(checkModeInvisibleSurface('<div class="text-white/10">x</div>')).toHaveLength(0);
  });
});

// ─── mode-invisible-surface — measured on the composite over the REAL parent ────
//
// A translucent tint is judged on the colour it actually lands on: the nearest
// concrete background of its own ancestors, with any translucent layers between
// them composited. The document's colour mode never decides on its behalf.

describe("mode-invisible-surface — composites over the real parent background", () => {
  /** A light beige page: the FIRST `background` hex in the document is light. */
  const LIGHT_PAGE = "html, body { background: #e6e4df }";

  it("does NOT flag a translucent white pill on a dark card whose hex is not the first one in the document", () => {
    const html = [
      "<style>",
      LIGHT_PAGE,
      ".card { background: #18181b }",
      ".pill { background: rgba(255,255,255,0.08) }",
      "</style>",
      '<body><div class="card"><span class="pill">x</span></div></body>',
    ].join("\n");
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("does NOT flag a translucent pill on a dark card declared with rgb(), not a hex — rule form", () => {
    const html = [
      "<style>.card { background: rgb(11, 11, 11) } .pill { background: rgba(255,255,255,0.08) }</style>",
      '<body class="bg-white"><div class="card"><span class="pill">x</span></div></body>',
    ].join("\n");
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("does NOT flag a translucent pill on a dark card declared with rgb() — inline-style form", () => {
    const html =
      '<body class="bg-white"><div style="background:rgb(11,11,11);">' +
      '<span style="background:rgba(255,255,255,0.08)">x</span></div></body>';
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("does NOT flag bg-white/10 on a mid-dark Tailwind card inside a light page", () => {
    const html = '<body class="bg-white"><div class="bg-slate-700 p-4"><span class="bg-white/10">x</span></div></body>';
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("composites nested translucency — a bg-black/60 scrim darkens the page under a white/10 pill", () => {
    const html = [
      `<style>${LIGHT_PAGE} .scrim { background: rgba(0,0,0,0.6) } .pill { background: rgba(255,255,255,0.1) }</style>`,
      '<body><div class="scrim"><span class="pill">x</span></div></body>',
    ].join("\n");
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("still flags a white pill that sits DIRECTLY on the light page — even with an undetected dark card elsewhere", () => {
    const html = [
      "<style>",
      LIGHT_PAGE,
      ".card { background: #18181b }",
      ".pill-on-card { background: rgba(255,255,255,0.06) }",
      ".pill-on-page { background: rgba(255,255,255,0.08) }",
      "</style>",
      '<body><div class="card"><span class="pill-on-card">a</span></div><span class="pill-on-page">b</span></body>',
    ].join("\n");
    const f = checkModeInvisibleSurface(html);
    expect(f).toHaveLength(1); // the root-level pill only; the on-card pill is visible
    expect(f[0]?.message).toContain("~8%");
    expect(f[0]?.message).toContain("light-mode");
  });

  it("still flags a Tailwind white tint on a light page that also carries a detected dark section", () => {
    // A dark section used to silence the whole document. The pill in the LIGHT
    // section is still invisible, and now says so; the one in the dark section is fine.
    const html = [
      '<body class="bg-white">',
      '<section class="bg-slate-900"><span class="bg-white/10">on dark</span></section>',
      '<section><div class="border border-white/10">on light</div></section>',
      "</body>",
    ].join("\n");
    const f = checkModeInvisibleSurface(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("border-white/10");
  });

  it("still flags a white pill inside a LIGHT card — an ancestor with a background is not automatically a dark one", () => {
    const html = [
      `<style>${LIGHT_PAGE} .card { background: #fafafa } .pill { background: rgba(255,255,255,0.08) }</style>`,
      '<body><div class="card"><span class="pill">x</span></div></body>',
    ].join("\n");
    expect(checkModeInvisibleSurface(html)).toHaveLength(1);
  });

  it("measures an edge tint against the element's OWN surface — a dark card's white hairline is visible", () => {
    const html = '<body class="bg-white"><div class="bg-slate-900 border border-white/10">x</div></body>';
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("applies the same rule to the dark inverse — a white card on a dark page makes white/10 invisible there", () => {
    const html = '<body class="dark bg-black"><div class="bg-white p-4"><span class="border border-white/10">x</span></div></body>';
    const f = checkModeInvisibleSurface(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("light-mode");
  });

  it("keeps the alpha floor — a visible-alpha tint is never flagged, whatever it sits on", () => {
    expect(checkModeInvisibleSurface('<body class="bg-white"><div class="bg-white/20">x</div></body>')).toHaveLength(0);
  });

  describe("bails (precision over recall) when the parent background cannot be resolved from text", () => {
    it("a var() background on an ancestor", () => {
      const html = [
        `<style>${LIGHT_PAGE} .card { background: var(--surface) } .pill { background: rgba(255,255,255,0.08) }</style>`,
        '<body><div class="card"><span class="pill">x</span></div></body>',
      ].join("\n");
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("a gradient background on an ancestor", () => {
      const html =
        '<body class="bg-white"><div style="background:linear-gradient(#111,#000)">' +
        '<span style="background:rgba(255,255,255,0.08)">x</span></div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("an unknown theme colour utility on an ancestor (bg-card could be any colour)", () => {
      const html = '<body class="bg-white"><div class="bg-card"><span class="bg-white/10">x</span></div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("an undefined theme accent on an ancestor (a theme may make bg-accent brand orange)", () => {
      const html = '<body class="bg-white"><div class="bg-accent"><span class="bg-white/10">x</span></div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("a theme colour utility that is not a surface token on an ancestor (bg-primary could be any colour)", () => {
      const html = '<body class="bg-white"><div class="bg-primary"><span class="bg-white/10">x</span></div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("a rule no element carries — a detached declaration has no parent to composite over", () => {
      const html = [
        `<style>${LIGHT_PAGE} .ghost { background: rgba(255,255,255,0.08) }</style>`,
        '<body><div class="other">x</div></body>',
      ].join("\n");
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("a custom property — its consumer, not its declaration, owns the parent background", () => {
      const html = "<style>:root { --card-border: rgba(255,255,255,0.1) }</style><body><div>x</div></body>";
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("rules that disagree about an ancestor's background (a theme switch the scan cannot evaluate)", () => {
      const html = [
        `<style>${LIGHT_PAGE} .card { background: #ffffff } .dark-scheme .card { background: #111111 }`,
        ".pill { background: rgba(255,255,255,0.08) }</style>",
        '<body class="dark-scheme"><div class="card"><span class="pill">x</span></div></body>',
      ].join("\n");
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });
  });

  // A page that states its surfaces as tokens or in other colour syntaxes is still readable.
  // `PILL` is a white 8% fill on `.card`; the verdict depends only on what `.card` paints.
  const PILL = ".pill { background: rgba(255,255,255,0.08) }";
  const onCard = (css: string): string =>
    `<style>${LIGHT_PAGE} ${css} ${PILL}</style>\n<body><div class="card"><span class="pill">x</span></div></body>`;

  const withClass = (html: string, extra: string): string => html.replace('class="card"', `class="card ${extra}"`);
  it.each([
    { name: "a var() that resolves to a dark colour", expected: 0, html: onCard(":root { --card: #18181b } .card { background: var(--card) }") },
    { name: "a var() that resolves to a LIGHT colour is still judged (resolved, not bailed)", expected: 1, html: onCard(":root { --card: #fafafa } .card { background: var(--card) }") },
    { name: "a var() resolved through another var()", expected: 0, html: onCard(":root { --ink: #111; --card: var(--ink) } .card { background: var(--card) }") },
    { name: "a var() used through its fallback because nothing defines it", expected: 0, html: onCard(".card { background: var(--nope, #18181b) }") },
    { name: "a var() a theme redefines under a class no element carries still resolves to the root value", expected: 1, html: onCard(":root { --card: #fafafa } .night { --card: #111 } .card { background: var(--card) }") },
    { name: "a var() nothing defines, with no fallback, bails", expected: 0, html: onCard(".card { background: var(--nope) }") },
    { name: "hsl() with space syntax", expected: 0, html: onCard(".card { background: hsl(240 10% 4%) }") },
    { name: "#rrggbbaa with a full alpha", expected: 0, html: onCard(".card { background: #0b0b0bff }") },
    { name: "rgb() with a slash alpha", expected: 0, html: onCard(".card { background: rgb(11 11 11 / 100%) }") },
    { name: "a translucent dark card still composites over the page (rgba .92 over beige stays dark)", expected: 0, html: onCard(".card { background: rgba(24,30,37,0.92) }") },
    { name: "a Tailwind arbitrary dark colour", expected: 0, html: withClass(onCard(""), "bg-[#0b0b0b]") },
    { name: "a Tailwind arbitrary LIGHT colour is still judged (resolved, not bailed)", expected: 1, html: withClass(onCard(""), "bg-[#fafafa]") },
  ])("$name → $expected finding(s)", ({ html, expected }) => {
    expect(checkModeInvisibleSurface(html)).toHaveLength(expected);
  });

  it("a theme the page switches on resolves through the element that carries it", () => {
    const css = ":root { --card: #fafafa } .night { --card: #111 } .card { background: var(--card) } .pill { background: rgba(255,255,255,0.08) }";
    const html = (cls: string): string =>
      `<style>${LIGHT_PAGE} ${css}</style><body class="${cls}"><div class="card"><span class="pill">x</span></div></body>`;
    expect(checkModeInvisibleSurface(html(""))).toHaveLength(1); // light theme: the pill is invisible
    expect(checkModeInvisibleSurface(html("night"))).toHaveLength(0); // night theme: a dark card, the pill shows
  });

  it.each(["bg-background", "bg-card", "bg-popover", "bg-muted", "bg-secondary", "bg-accent", "bg-primary", "bg-brand"])(
    "a theme token the document does not define (%s) is an unknown surface, not the page's polarity",
    (token) => {
      const pill = '<span class="bg-white/10">x</span>';
      expect(inspectInvisibleSurface(`<body class="bg-white"><div class="${token}">${pill}</div></body>`)).toEqual({
        findings: [], stats: { invisible: 0, visible: 0, undecided: 1 },
      });
    },
  );

  it("a theme token the document DOES define is read through its own variable", () => {
    const page = (vars: string): string =>
      `<style>:root { ${vars} }</style><body class="bg-white"><div class="bg-card"><span class="bg-white/10">x</span></div></body>`;
    expect(checkModeInvisibleSurface(page("--card: #18181b"))).toHaveLength(0); // a dark card: the pill shows
    expect(checkModeInvisibleSurface(page("--card: 0 0% 98%"))).toHaveLength(1); // shadcn HSL parts, a near-white card
  });

  it("a page background the document cannot resolve is not assumed white", () => {
    const html = `<style>body { background: var(--missing) } ${PILL}</style><body><span class="pill">x</span></body>`;
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  it("reads a page background through a var() and still judges the pill on it", () => {
    const html = `<style>:root { --bg: #fafafa } body { background: var(--bg) } ${PILL}</style><body><span class="pill">x</span></body>`;
    expect(checkModeInvisibleSurface(html)).toHaveLength(1);
  });

  it("skips an @import whose URL contains semicolons — the body rule after it still sets the page dark", () => {
    const html = [
      "<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');",
      "body { background: #050505 } .glass { background: rgba(255,255,255,0.02) }</style>",
      '<body><div class="glass">x</div></body>',
    ].join("\n");
    expect(checkModeInvisibleSurface(html)).toHaveLength(0);
  });

  describe("reads the markup and selectors the way a browser would", () => {
    it("closes optional-close siblings — the second <li> is not inside the dark first one", () => {
      const html = '<body class="bg-white"><ul><li class="bg-slate-900">a<li><span class="bg-white/10">b</span></ul></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(1);
    });

    it("an attribute selector applies only where the attribute value matches (dark root)", () => {
      const css = `html[data-theme="dark"] { background: #0b0b0b } ${PILL}`;
      expect(checkModeInvisibleSurface(`<style>${css}</style><html data-theme="dark"><body><span class="pill">x</span></body></html>`)).toHaveLength(0);
    });

    it("an attribute selector does NOT apply where the value differs (light root keeps the white canvas)", () => {
      const css = `html[data-theme="dark"] { background: #0b0b0b } ${PILL}`;
      expect(checkModeInvisibleSurface(`<style>${css}</style><html data-theme="light"><body><span class="pill">x</span></body></html>`)).toHaveLength(1);
    });

    it("judges a ::before overlay on its element's own surface — light card flags, dark card does not", () => {
      const overlay = (card: string): string =>
        `<style>${LIGHT_PAGE} .card { background: ${card} } .card::before { background: rgba(255,255,255,0.05) }</style><body><div class="card">x</div></body>`;
      expect(checkModeInvisibleSurface(overlay("#fafafa"))).toHaveLength(1);
      expect(checkModeInvisibleSurface(overlay("#111111"))).toHaveLength(0);
    });

    it("skips a state-only background — a :hover fill does not repaint the resting card", () => {
      // Resting card is light, so the pill is invisible. Counting the hover rule would make the two
      // backgrounds disagree and silence this finding; skipping it keeps the resting verdict.
      const html = onCard(".card { background: #fafafa } .card:hover { background: #18181b }");
      expect(checkModeInvisibleSurface(html)).toHaveLength(1);
    });

    it("a sibling-combinator rule reaches the element it selects, and only that one", () => {
      const css = `<style>${LIGHT_PAGE} .a + .b { background: rgba(255,255,255,0.05) }</style>`;
      expect(checkModeInvisibleSurface(`${css}<body><div class="a"></div><div class="b">x</div></body>`)).toHaveLength(1);
      expect(checkModeInvisibleSurface(`${css}<body><div class="b">x</div><div class="a"></div></body>`)).toHaveLength(0);
    });

    it("a child combinator must be a real parent — a rule scoped to .card > .pill reaches only a direct child", () => {
      const css = `${LIGHT_PAGE} .card { background: #fafafa } .card > .pill { background: rgba(255,255,255,0.08) }`;
      const direct = `<style>${css}</style><body><div class="card"><span class="pill">x</span></div></body>`;
      const nested = `<style>${css}</style><body><div class="card"><div><span class="pill">x</span></div></div></body>`;
      expect(checkModeInvisibleSurface(direct)).toHaveLength(1); // the rule reaches it, on a light card
      expect(checkModeInvisibleSurface(nested)).toHaveLength(0); // the rule never reaches it: nothing to judge
    });
  });

  describe("Tailwind variants", () => {
    it("does not judge a dark: utility against the light resting state (border-black/10 dark:border-white/10)", () => {
      const html = '<body class="bg-white"><div class="border border-black/10 dark:border-white/10">x</div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("does not judge a dark: utility chained behind another variant", () => {
      expect(checkModeInvisibleSurface('<body class="bg-white"><div class="dark:hover:border-white/10">x</div></body>')).toHaveLength(0);
    });

    it("judges a hover: utility on the resting backdrop (only dark: is a different state)", () => {
      expect(checkModeInvisibleSurface('<body class="bg-white"><div class="hover:bg-white/10">x</div></body>')).toHaveLength(1);
    });

    it("under a dark root, an unprefixed utility with a dark: counterpart is the inactive half of the pair", () => {
      const html = '<html class="dark"><body class="bg-black"><div class="ring-1 ring-black/10 dark:ring-white/10">x</div></body></html>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("under a dark root, an unpaired black hairline is still the invisible one", () => {
      const html = '<html class="dark"><body class="bg-black"><div class="ring-1 ring-black/10">x</div></body></html>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(1);
    });

    it("a utility named in prose or a code sample is documentation, not a surface", () => {
      const html = '<body class="bg-white"><p>Use <code>border-white/10</code> only on dark surfaces.</p></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("an ancestor repainted by a dark: variant leaves the pill unjudged", () => {
      const html = '<body class="bg-white"><div class="bg-white dark:bg-slate-900"><span class="bg-white/10">x</span></div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });

    it("an ancestor repainted by a breakpoint variant leaves the pill unjudged, even when the variant is light", () => {
      const html = '<body class="bg-white"><div class="md:bg-white"><span class="bg-white/10">x</span></div></body>';
      expect(checkModeInvisibleSurface(html)).toHaveLength(0);
    });
  });

  describe("only a tint of the backdrop's own polarity is an invisible boundary", () => {
    const tintOn = (card: string, tint: string): string =>
      `<style>${LIGHT_PAGE} .card { background: ${card} } .pill { background: ${tint} }</style><body><div class="card"><span class="pill">x</span></div></body>`;

    it("white 2% on a dark card is the deliberate glass layer — not flagged", () => {
      expect(checkModeInvisibleSurface(tintOn("#18181b", "rgba(255,255,255,0.02)"))).toHaveLength(0);
    });

    it("black 2% on a light card is the usual soft hairline — not flagged", () => {
      expect(checkModeInvisibleSurface(tintOn("#fafafa", "rgba(0,0,0,0.02)"))).toHaveLength(0);
    });

    it("black 8% on a dark card is the dark-mode mirror of white-on-white — flagged", () => {
      expect(checkModeInvisibleSurface(tintOn("#18181b", "rgba(0,0,0,0.08)"))).toHaveLength(1);
    });
  });
});

// ─── z-index-off-ladder (Depth/Surface / warning) ───────────────────────────────

describe("z-index-off-ladder", () => {
  it("flags an off-ladder value (z-index: 47)", () => {
    const f = checkZIndexOffLadder("<style>.m{z-index:47}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("z-index-off-ladder");
    expect(f[0]?.axis).toBe("Depth/Surface");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags 275 but NOT 100 / 1000 (base-10 ladder steps pass)", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:275}</style>")).toHaveLength(1);
    expect(checkZIndexOffLadder("<style>.a{z-index:100}.b{z-index:1000}</style>")).toHaveLength(0);
  });

  it("does NOT flag single-digit local stacking (z-index 1–9)", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:1}.b{z-index:9}</style>")).toHaveLength(0);
  });

  it("does NOT flag a clean 10/20/30/40/50 ladder", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:10}.b{z-index:20}.c{z-index:50}</style>")).toHaveLength(0);
  });

  it("does NOT double-report all-nines (that is z-index-inflation's error)", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:9999}</style>")).toHaveLength(0);
  });
});

// ─── lintTaste wiring — registration + severity split ───────────────────────────

describe("lintTaste — P2 web-craft lints wired", () => {
  it("registers all three and keeps the severity split (invisible-surface error, off-ladder warning)", () => {
    const html = [
      '<body class="bg-white">',
      '<div class="border-white/10">x</div>',
      "<style>.m{z-index:47}</style>",
      nSizes(8),
      "</body>",
    ].join("\n");
    const r = lintTaste(html);
    const ids = new Set(r.findings.map((f) => f.checkId));
    expect(ids.has("mode-invisible-surface")).toBe(true);
    expect(ids.has("z-index-off-ladder")).toBe(true);
    expect(ids.has("font-scale-sprawl")).toBe(true);
    expect(r.errorCount).toBeGreaterThanOrEqual(1); // mode-invisible-surface
    expect(r.warningCount).toBeGreaterThanOrEqual(2); // off-ladder + font-scale
  });

  it("clean DS-faithful markup trips none of the three", () => {
    const clean = '<body class="bg-white"><div class="border border-slate-200"><p class="text-sm">Hi</p></div></body>';
    const r = lintTaste(clean);
    const ids = new Set(r.findings.map((f) => f.checkId));
    expect(ids.has("mode-invisible-surface")).toBe(false);
    expect(ids.has("z-index-off-ladder")).toBe(false);
    expect(ids.has("font-scale-sprawl")).toBe(false);
  });
});
