import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, mkdtempSync } from "node:fs";
import { lintA11y } from "../src/core/a11y-lint.js";
import {
  checkImgAlt, checkHtmlLang, checkDocumentTitle, checkPositiveTabindex,
  checkViewportZoom, checkIconControlUnnamed, checkHeadingHierarchy,
  isRedirectStub,
} from "../src/core/a11y-checks.js";
import { run } from "../src/cli.js";

const ids = (fs: { checkId: string }[]): string[] => fs.map((f) => f.checkId);

describe("a11y-checks — per rule", () => {
  it("img-missing-alt fires without alt, not with alt (incl. empty)", () => {
    expect(checkImgAlt('<img src="a">')).toHaveLength(1);
    expect(checkImgAlt('<img src="a" alt="">')).toHaveLength(0);
    expect(checkImgAlt('<img src="a" alt="cat">')).toHaveLength(0);
  });
  it("html-lang fires when missing/empty", () => {
    expect(checkHtmlLang("<html>")).toHaveLength(1);
    expect(checkHtmlLang('<html lang="">')).toHaveLength(1);
    expect(checkHtmlLang('<html lang="en">')).toHaveLength(0);
  });
  it("document-title fires when missing/empty", () => {
    expect(checkDocumentTitle("<head></head>")).toHaveLength(1);
    expect(checkDocumentTitle("<title>  </title>")).toHaveLength(1);
    expect(checkDocumentTitle("<title>Page</title>")).toHaveLength(0);
  });
  it("positive-tabindex fires only for > 0", () => {
    expect(checkPositiveTabindex('<div tabindex="3">')).toHaveLength(1);
    expect(checkPositiveTabindex('<div tabindex="0">')).toHaveLength(0);
    expect(checkPositiveTabindex('<div tabindex="-1">')).toHaveLength(0);
  });
  it("viewport-zoom-blocked fires for user-scalable=no / maximum-scale<2", () => {
    expect(checkViewportZoom('<meta name="viewport" content="width=device-width, user-scalable=no">')).toHaveLength(1);
    expect(checkViewportZoom('<meta name="viewport" content="width=device-width, maximum-scale=1">')).toHaveLength(1);
    expect(checkViewportZoom('<meta name="viewport" content="width=device-width, initial-scale=1">')).toHaveLength(0);
  });
  it("icon-control-unnamed catches emoji/glyph and icon-only controls, exempts named ones", () => {
    expect(checkIconControlUnnamed("<button>☰</button>")).toHaveLength(1); // emoji-as-control (the dogfood)
    expect(checkIconControlUnnamed('<a href="#"><svg></svg></a>')).toHaveLength(1); // icon-only, no name
    expect(checkIconControlUnnamed('<button aria-label="Menu">☰</button>')).toHaveLength(0); // named
    expect(checkIconControlUnnamed('<button title="Close">✕</button>')).toHaveLength(0);
    expect(checkIconControlUnnamed('<a href="#"><img src="i.svg" alt="Home"></a>')).toHaveLength(0);
    expect(checkIconControlUnnamed("<button>Save changes</button>")).toHaveLength(0); // real text
  });
  it("heading-hierarchy warns on skipped level, empty heading, and headings-without-h1", () => {
    expect(ids(checkHeadingHierarchy("<h1>a</h1><h3>b</h3>"))).toContain("heading-skip");
    expect(ids(checkHeadingHierarchy("<h2>x</h2>"))).toContain("heading-no-h1");
    expect(ids(checkHeadingHierarchy("<h1></h1>"))).toContain("heading-empty");
    expect(checkHeadingHierarchy("<h1>a</h1><h2>b</h2>")).toHaveLength(0);
  });
});

describe("isRedirectStub — L1 dogfood exemption", () => {
  it("true for a bare meta-refresh stub with no real body copy", () => {
    expect(isRedirectStub('<!doctype html><meta http-equiv="refresh" content="0; url=overview.html">')).toBe(true);
  });
  it("false for a normal page with a real <body> of content, even with meta-refresh", () => {
    const html = [
      '<!doctype html><meta http-equiv="refresh" content="0; url=overview.html">',
      "<body><h1>Welcome</h1><p>This page has substantial body copy describing the product in detail.</p></body>",
    ].join("");
    expect(isRedirectStub(html)).toBe(false);
  });
  it("false for a doc with NO meta-refresh even if short", () => {
    expect(isRedirectStub("<html><body>hi</body></html>")).toBe(false);
  });
});

describe("checkHtmlLang / checkDocumentTitle — redirect-stub exemption (L1)", () => {
  const STUB = '<!doctype html><meta http-equiv="refresh" content="0; url=overview.html">';

  it("checkHtmlLang returns [] on the redirect stub", () => {
    expect(checkHtmlLang(STUB)).toHaveLength(0);
  });
  it("checkDocumentTitle returns [] on the redirect stub", () => {
    expect(checkDocumentTitle(STUB)).toHaveLength(0);
  });

  it("REGRESSION: a normal full page with no <title>/no lang still flags both", () => {
    const normal = "<!doctype html><html><head></head><body><h1>Hi</h1><p>Some real page content that is not a redirect stub at all, plenty of body text here.</p></body></html>";
    expect(checkHtmlLang(normal)).toHaveLength(1);
    expect(checkDocumentTitle(normal)).toHaveLength(1);
  });
});

describe("lintA11y — orchestration", () => {
  it("orders errors before warnings and counts them", () => {
    const r = lintA11y('<html><body><img src="x"><h1>a</h1><h3>b</h3></body></html>');
    expect(r.errorCount).toBeGreaterThan(0);
    expect(r.warningCount).toBeGreaterThan(0);
    // errors sort before warnings
    expect(r.findings[0]!.severity).toBe("error");
    expect(r.findings[r.findings.length - 1]!.severity).toBe("warning");
  });
});

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

describe("ui a11y-lint (command)", () => {
  it("exit 1 on errors; never claims 'accessible'", () => {
    const p = join(mkdtempSync(join(tmpdir(), "ease-al-")), "bad.html");
    writeFileSync(p, "<html><body><button>☰</button></body></html>");
    const r = capture(["a11y-lint", p]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("icon-control-unnamed");
    expect(r.out).toContain("not a conformance claim");
    // The honesty rule bans CLAIMING the page is accessible/conformant — the technical
    // term "accessible name" (an ARIA concept) is fine.
    expect(r.out.toLowerCase()).not.toMatch(/\bis accessible\b|conformant|wcag aa compliant/);
  });
  it("clean page → exit 0 with the honesty note", () => {
    const p = join(mkdtempSync(join(tmpdir(), "ease-al-")), "ok.html");
    writeFileSync(p, '<!doctype html><html lang="en"><head><title>Ok</title></head><body><h1>Hi</h1><button>Go</button></body></html>');
    const r = capture(["a11y-lint", p]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("not a conformance claim");
  });
  it("--json envelope; missing positional → BAD_ARG; missing file → FILE_NOT_FOUND", () => {
    const p = join(mkdtempSync(join(tmpdir(), "ease-al-")), "bad.html");
    writeFileSync(p, "<button>☰</button>");
    const j = JSON.parse(capture(["a11y-lint", p, "--json"]).out).data as { errorCount: number };
    expect(j.errorCount).toBeGreaterThan(0);
    expect(JSON.parse(capture(["a11y-lint", "--json"]).out).error.code).toBe("BAD_ARG");
    expect(JSON.parse(capture(["a11y-lint", "/no/such.html", "--json"]).out).error.code).toBe("FILE_NOT_FOUND");
  });
});
