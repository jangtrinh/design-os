/**
 * False positives measured on a real rendered page (a React + Tailwind v4 + shadcn-style kit
 * site, captured with Playwright `page.content()` from a Vite dev server). Each one fired on
 * every view of the site, so the gate could not tell real debt from noise. One regression per
 * rule; each was red before its fix.
 *
 * The fixtures mirror the shape of compiled Tailwind v4 output (`calc(var(--spacing) * N)`,
 * variant-prefixed utilities such as `[&_svg]:size-4` and `file:text-sm`), not the exact site.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { checkFontScaleSprawl } from "../src/core/taste-checks-font-scale.js";
import { checkTextInImage } from "../src/core/content-checks.js";
import { checkTapTargetUndersized } from "../src/core/taste-checks-tap-target.js";
import { checkInputFontBelow16 } from "../src/core/layout-checks-mobile.js";
import { checkNestedScrollContainer } from "../src/core/layout-checks.js";
import { checkIconControlUnnamed } from "../src/core/a11y-checks.js";

const page = (css: string, body: string): string =>
  `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>T</title><style>${css}</style></head><body><div id="root">${body}</div></body></html>`;

/** The slice of a compiled Tailwind v4 sheet these fixtures need. */
const TW = [
  ":root,:host{--spacing:0.25rem;--text-sm:0.875rem;--text-base:1rem}",
  ".size-4{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}",
  ".size-9{width:calc(var(--spacing) * 9);height:calc(var(--spacing) * 9)}",
  ".h-8{height:calc(var(--spacing) * 8)}",
  ".h-11{height:calc(var(--spacing) * 11)}",
  ".text-sm{font-size:var(--text-sm)}",
  ".text-base{font-size:var(--text-base)}",
  // A variant utility: compiled with native nesting, it styles the CHILD svg, never the element.
  ".\\[\\&_svg\\]\\:size-4{& svg{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}}",
  ".file\\:text-sm{&::file-selector-button{font-size:var(--text-sm)}}",
  ".md\\:text-sm{@media (width >= 48rem){font-size:var(--text-sm)}}",
  // An unused kit utility: compiled because a kit file mentions it, but no element carries it.
  ".overflow-auto{overflow:auto}",
].join("\n");

describe("taste/font-scale-sprawl skips custom-property declarations", () => {
  it("a type scale declared as --typography-*-font-size tokens is not hand-picked sizes", () => {
    const sizes = [13, 14, 16, 18, 22, 26, 32, 36, 40, 56, 72];
    const css = `:root{${sizes.map((s, i) => `--typography-step${i}-font-size:${s}px`).join(";")}}` +
      sizes.map((_, i) => `.t${i}{font-size:var(--typography-step${i}-font-size)}`).join("");
    expect(checkFontScaleSprawl(page(css, "<p class=\"t0\">x</p>"))).toEqual([]);
  });

  it("still counts real hand-picked font-size declarations", () => {
    const css = [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 27].map((s, i) => `.x${i}{font-size:${s}px}`).join("");
    expect(checkFontScaleSprawl(page(css, "<p>x</p>"))[0]?.severity).toBe("error");
  });
});

describe("content/text-in-image does not guess from the file name", () => {
  it("a photo named hero-*.jpg with a long DESCRIPTIVE alt is not text in an image", () => {
    const html = '<img src="/images/hero-home.jpg" alt="A team of engineers talking by an office window in daylight">';
    expect(checkTextInImage(html)).toEqual([]);
  });

  it("the same alt under another file name was already clean (the repro)", () => {
    expect(checkTextInImage('<img src="/images/team.jpg" alt="A team of engineers talking by an office window in daylight">')).toEqual([]);
  });

  it("an alt that reads as promotional headline copy still fires", () => {
    expect(checkTextInImage('<img src="/img/b1.jpg" alt="Get fifty percent off your first order today">')).toHaveLength(1);
    expect(checkTextInImage('<img src="/img/b2.jpg" alt="SUMMER SALE: up to 50% off everything">')).toHaveLength(1);
  });
});

describe("taste/tap-target-undersized reads the element's own computed size", () => {
  it("a 44px button whose class list carries a child-svg variant `[&_svg]:size-4` is not undersized", () => {
    const html = page(TW, '<button class="inline-flex h-11 [&_svg]:size-4"><svg></svg>Send</button>');
    expect(checkTapTargetUndersized(html)).toEqual([]);
  });

  it("without any stylesheet, a variant-prefixed size class is still not the element's size", () => {
    expect(checkTapTargetUndersized('<button class="h-11 [&_svg]:size-4 sm:h-8">Send</button>')).toEqual([]);
  });

  it("a button that COMPUTES to 32px still fires", () => {
    const html = page(TW, '<button class="inline-flex h-8">Send</button>');
    expect(checkTapTargetUndersized(html)).toHaveLength(1);
  });
});

describe("layout/input-font-below-16 reads the control's own computed font size", () => {
  it("`file:text-sm` (the file-button part) and `md:text-sm` do not make a 16px input small", () => {
    const html = page(TW, '<input type="text" class="h-11 text-base file:text-sm md:text-sm">');
    expect(checkInputFontBelow16(html)).toEqual([]);
  });

  it("an input that computes to 14px still fires", () => {
    expect(checkInputFontBelow16(page(TW, '<input type="email" class="h-11 text-sm">'))).toHaveLength(1);
  });
});

describe("layout/nested-scroll-container checks real nesting on the DOM", () => {
  it("an unused `.overflow-auto { overflow: auto }` rule in the stylesheet is not a scroll container", () => {
    expect(checkNestedScrollContainer(page(TW, "<main><p>Hello</p></main>"))).toEqual([]);
  });

  it("two SIBLING scroll containers are not nested", () => {
    const html = page(TW, '<div class="overflow-auto">a</div><div class="overflow-auto">b</div>');
    expect(checkNestedScrollContainer(html)).toEqual([]);
  });

  it("a scroll container inside another (computed from the stylesheet) still fires", () => {
    const html = page(TW, '<div class="overflow-auto"><div class="overflow-auto">b</div></div>');
    expect(checkNestedScrollContainer(html)).toHaveLength(1);
  });
});

describe("a11y/icon-control-unnamed accepts <label for>", () => {
  it("a custom checkbox button named by a <label for> is named", () => {
    const html = '<button type="button" role="checkbox" id="consent" aria-checked="false"><span></span></button><label for="consent">I agree to be contacted</label>';
    expect(checkIconControlUnnamed(html)).toEqual([]);
  });

  it("an empty <label for> does not name it", () => {
    const html = '<button type="button" role="checkbox" id="c2"><span></span></button><label for="c2"> </label>';
    expect(checkIconControlUnnamed(html)).toHaveLength(1);
  });
});

describe("taste/tap-target-undersized skips what nobody taps", () => {
  it("a visually hidden skip link (sr-only: absolute 1×1px) is not a touch target", () => {
    const css = ".sr-only{position:absolute;width:1px;height:1px;overflow:hidden}";
    expect(checkTapTargetUndersized(page(css, '<a class="sr-only" href="#main">Skip to content</a>'))).toEqual([]);
  });
});

describe("ds-usage/hardcoded-color reads the real declaration", () => {
  const dir = mkdtempSync(join(tmpdir(), "ease-fp-dsu-"));
  const tokens = join(dir, "tokens.json");
  writeFileSync(tokens, JSON.stringify({ color: { ink: { $type: "color", $value: "#0e1726" } } }), "utf8");
  const gateFindings = (css: string): Array<{ checkId: string; message: string }> => {
    const p = join(dir, `p${Math.random().toString(36).slice(2)}.html`);
    writeFileSync(p, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title><style>:root{--color-ink:#0e1726}${css}</style></head><body><main><h1>Alpha</h1><p>Welcome back.</p></main></body></html>`, "utf8");
    let out = "";
    const o = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = (c: any) => { out += String(c); return true; };
    try { run(["gate", p, "--tokens", tokens, "--json"]); } finally { process.stdout.write = o; }
    return JSON.parse(out).data.families["ds-usage"].findings;
  };

  it("a feature query `@supports (color: rgb(from red r g b))` is not a hardcoded colour", () => {
    const f = gateFindings("@supports (color: rgb(from red r g b)) { .x { color: var(--color-ink); } }");
    expect(f.filter((x) => x.checkId === "hardcoded-color")).toEqual([]);
  });

  it("a custom-property declaration is named as itself, not as `color`", () => {
    const f = gateFindings(".ring { --tw-ring-offset-color: #fff; }").filter((x) => x.checkId === "hardcoded-color");
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("'--tw-ring-offset-color'");
  });
});
