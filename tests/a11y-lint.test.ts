import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, mkdtempSync } from "node:fs";
import { lintA11y } from "../src/core/a11y-lint.js";
import {
  checkImgAlt, checkHtmlLang, checkDocumentTitle, checkPositiveTabindex,
  checkViewportZoom, checkViewportMetaPresent, checkIconControlUnnamed, checkHeadingHierarchy,
  checkPasteBlocked, checkInputUnlabeled, checkFocusOutlineRemoved, isRedirectStub,
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
  it("viewport-meta-missing fires on a responsive doc with no viewport meta (M3)", () => {
    // Responsive-intent signal (a breakpoint class) but no viewport meta → fires.
    expect(ids(checkViewportMetaPresent('<html><body><div class="md:flex">x</div></body></html>'))).toContain("viewport-meta-missing");
    // A width-based media query is also mobile intent.
    expect(checkViewportMetaPresent("<style>@media (max-width:640px){.a{display:none}}</style>")).toHaveLength(1);
    // Present viewport meta → never fires (checkViewportZoom owns the bad-content case).
    expect(checkViewportMetaPresent('<meta name="viewport" content="width=device-width, initial-scale=1"><div class="md:flex"></div>')).toHaveLength(0);
    // No mobile intent → not nagged (precision-first: print/desktop-only page).
    expect(checkViewportMetaPresent("<html><body><h1>Static doc</h1></body></html>")).toHaveLength(0);
    // A redirect stub is exempt.
    expect(checkViewportMetaPresent('<!doctype html><meta http-equiv="refresh" content="0; url=x.html">')).toHaveLength(0);
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

describe("paste-blocked (3.3.8)", () => {
  it("fires on onpaste=\"return false\"", () => {
    const f = checkPasteBlocked('<input type="password" onpaste="return false">');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("paste-blocked");
    expect(f[0]?.severity).toBe("error");
  });
  it("fires on onpaste calling preventDefault", () => {
    expect(ids(checkPasteBlocked('<input onpaste="event.preventDefault()">'))).toEqual(["paste-blocked"]);
  });
  it("fires on a script paste listener that calls preventDefault", () => {
    const html = "<script>el.addEventListener('paste', (e) => e.preventDefault());</script>";
    expect(ids(checkPasteBlocked(html))).toEqual(["paste-blocked"]);
  });
  it("does not fire on a paste handler that merely observes", () => {
    expect(checkPasteBlocked('<input onpaste="trackPaste()">')).toEqual([]);
    expect(checkPasteBlocked("<script>el.addEventListener('paste', track);</script>")).toEqual([]);
  });
  it("does not fire when an unrelated listener calls preventDefault nearby", () => {
    const html = "<script>notes.addEventListener('paste', (e) => { analytics.track('pasted'); });\n" +
      "f.addEventListener('submit', (e) => { e.preventDefault(); send(); });</script>";
    expect(checkPasteBlocked(html)).toEqual([]);
  });
  it("does not fire on the paste-as-plain-text idiom (preventDefault + re-insert)", () => {
    const html = "<script>ed.addEventListener('paste', (e) => { e.preventDefault();\n" +
      "  const t = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t); });</script>";
    expect(checkPasteBlocked(html)).toEqual([]);
  });
  it("the scripted-listener form is a warning (regex cannot prove runtime semantics)", () => {
    const f = checkPasteBlocked("<script>el.addEventListener('paste', (e) => e.preventDefault());</script>");
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("warning");
  });
  it("lintA11y ignores commented-out markup (onpaste and img alike)", () => {
    const html = '<!doctype html><html lang="en"><head><title>t</title></head><body>' +
      '<!-- <input onpaste="return false"> legacy --><!-- <img src="x"> --><p>hi</p></body></html>';
    const res = lintA11y(html);
    expect(res.findings.map((f) => f.checkId)).toEqual([]);
  });
});

describe("input-unlabeled (3.3.2)", () => {
  it("fires on a text input with no label association", () => {
    const f = checkInputUnlabeled('<input type="email" id="em">');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("input-unlabeled");
    expect(f[0]?.severity).toBe("error");
  });
  it("fires on select/textarea too, and a placeholder is not a label", () => {
    expect(ids(checkInputUnlabeled("<select><option>A</option></select>"))).toEqual(["input-unlabeled"]);
    expect(ids(checkInputUnlabeled('<input type="text" placeholder="Email">'))).toEqual(["input-unlabeled"]);
  });
  it("passes with label[for], a wrapping label, aria-label, or aria-labelledby", () => {
    expect(checkInputUnlabeled('<label for="em">Email</label><input id="em" type="email">')).toEqual([]);
    expect(checkInputUnlabeled('<label><input type="checkbox"> Send me updates</label>')).toEqual([]);
    expect(checkInputUnlabeled('<input type="search" aria-label="Search">')).toEqual([]);
    expect(checkInputUnlabeled('<span id="t">Amount</span><input aria-labelledby="t">')).toEqual([]);
  });
  it("skips non-text input types (hidden, submit, button, reset, image)", () => {
    expect(checkInputUnlabeled('<input type="hidden" name="csrf"><input type="submit" value="Save draft">')).toEqual([]);
  });
});

describe("focus-outline-removed (2.4.7)", () => {
  it("fires when a :focus rule kills the outline with no replacement anywhere", () => {
    const f = checkFocusOutlineRemoved("<style>button:focus { outline: none; }</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("focus-outline-removed");
    expect(f[0]?.severity).toBe("error");
  });
  it("fires on outline: 0 and on the Tailwind focus:outline-none class form", () => {
    expect(ids(checkFocusOutlineRemoved("<style>a:focus-visible { outline: 0; }</style>"))).toEqual(["focus-outline-removed"]);
    expect(ids(checkFocusOutlineRemoved('<button class="focus:outline-none">Go</button>'))).toEqual(["focus-outline-removed"]);
  });
  it("passes when the same or another focus rule provides a visible replacement", () => {
    expect(checkFocusOutlineRemoved("<style>button:focus { outline: none; box-shadow: 0 0 0 2px var(--ring); }</style>")).toEqual([]);
    expect(checkFocusOutlineRemoved("<style>button:focus { outline: none; } button:focus-visible { outline: 2px solid var(--ring); }</style>")).toEqual([]);
    expect(checkFocusOutlineRemoved('<button class="focus:outline-none focus-visible:ring-2">Go</button>')).toEqual([]);
  });
  it("does not fire when no focus rule removes the outline", () => {
    expect(checkFocusOutlineRemoved("<style>button:focus-visible { outline-offset: 2px; }</style>")).toEqual([]);
  });
});

describe("focus/label precision — mention vs use, hidden controls, focus targets", () => {
  it("a page merely MENTIONING focus:outline-none (prose/code/script) never fires", () => {
    expect(checkFocusOutlineRemoved("<article><p>Never write <code>focus:outline-none</code> without a ring.</p></article>")).toEqual([]);
    expect(checkFocusOutlineRemoved("<script>const cls = 'focus:outline-none';</script>")).toEqual([]);
    expect(checkFocusOutlineRemoved('<pre>class="focus:outline-none"</pre>')).toEqual([]);
  });
  it("the class-attribute form still fires", () => {
    expect(ids(checkFocusOutlineRemoved('<button class="focus:outline-none">Go</button>'))).toEqual(["focus-outline-removed"]);
  });
  it("outline removal on a tabindex=-1 programmatic focus target is not a removal", () => {
    const html = '<style>#main:focus { outline: none; }</style><main id="main" tabindex="-1">content</main>';
    expect(checkFocusOutlineRemoved(html)).toEqual([]);
    const attrForm = '<style>[tabindex="-1"]:focus { outline: none; }</style><div tabindex="-1"></div>';
    expect(checkFocusOutlineRemoved(attrForm)).toEqual([]);
  });
  it("Tailwind focus:shadow-* and focus:border-* count as visible replacements", () => {
    expect(checkFocusOutlineRemoved('<button class="focus:outline-none focus:shadow-outline">Go</button>')).toEqual([]);
    expect(checkFocusOutlineRemoved('<button class="focus:outline-none focus:border-2 focus:border-indigo-600">Go</button>')).toEqual([]);
  });
  it("outline: 0px and outline: none !important are removals, never replacements", () => {
    const f = checkFocusOutlineRemoved("<style>a:focus { outline: 0px; } button:focus { outline: none !important; }</style>");
    expect(ids(f)).toEqual(["focus-outline-removed"]);
  });
  it("a hidden or aria-hidden control needs no label (out of the a11y tree)", () => {
    expect(checkInputUnlabeled('<input id="meal-file" type="file" accept="image/*" hidden>')).toEqual([]);
    expect(checkInputUnlabeled('<input type="text" aria-hidden="true">')).toEqual([]);
  });
  it("an input inside a script template string never fires", () => {
    expect(checkInputUnlabeled("<script>const tpl = `<input type=\"text\">`;</script>")).toEqual([]);
  });
});
