/**
 * window-alert, seo-meta-missing, favicon-missing. Each case is a pair: an input the check
 * MUST report next to the nearest input it must not. Assertions read findings (ids, lines,
 * the names of what is missing), never the source of the check, so commentary in the
 * check cannot satisfy them.
 */
import { describe, expect, it } from "vitest";
import { runGate } from "../src/core/gate.js";
import { allContentChecks } from "../src/core/content-checks.js";
import { checkFaviconMissing, checkSeoMetaMissing, checkWindowAlert } from "../src/core/content-checks-landing.js";

const script = (js: string): string => `<!doctype html><html><head><title>t</title></head><body><script>${js}</script></body></html>`;
const alerts = (js: string): number => checkWindowAlert(script(js)).length;

describe("window-alert", () => {
  it("flags alert( and window.alert( in an inline script, as warnings", () => {
    for (const js of ['alert("Saved");', 'window.alert("Saved");', 'window . alert ( "Saved" )', "if (bad) { alert(msg) }"]) {
      const f = checkWindowAlert(script(js));
      expect(f, js).toHaveLength(1);
      expect(f[0]).toMatchObject({ checkId: "window-alert", severity: "warning" });
    }
  });

  it("reports the line of the call inside the document", () => {
    const html = "<!doctype html>\n<html>\n<body>\n<script>\nconst a = 1;\nalert(a);\n</script>\n</body></html>";
    expect(checkWindowAlert(html).map((f) => f.line)).toEqual([6]);
  });

  it("flags every call, not only the first", () => {
    expect(alerts('alert("a"); window.alert("b");')).toBe(2);
  });

  it("ignores alert( in line comments, block comments and HTML comments", () => {
    expect(alerts('// alert("x")\nready();')).toBe(0);
    expect(alerts('/* alert("x") */ ready();')).toBe(0);
    expect(checkWindowAlert('<!-- <script>alert("x")</script> -->')).toEqual([]);
  });

  it("still finds a call after a comment that contains an apostrophe or a URL in a string", () => {
    expect(alerts("// don't\nalert(1);")).toBe(1);
    expect(alerts('fetch("http://x.test/a"); alert(1);')).toBe(1);
  });

  it("ignores alert( inside a string or template literal", () => {
    expect(alerts('console.log("call alert(x) here");')).toBe(0);
    expect(alerts("const t = `alert(1)`;")).toBe(0);
  });

  it("ignores .alert( on any object other than window, and names that merely contain alert", () => {
    for (const js of ['toast.alert("x");', '$.alert("x");', 'dialog.alert("x")', 'myalert("x")', 'showAlert("x")', 'a$alert("x")', "alerts(1)", "alert.show()"]) {
      expect(alerts(js), js).toBe(0);
    }
  });

  it("ignores a function declared with the name", () => {
    expect(alerts("function alert(m) { return m; }")).toBe(0);
  });

  it("ignores alert( outside script content and in data scripts", () => {
    expect(checkWindowAlert("<p>alert(now) when the sale ends</p>")).toEqual([]);
    expect(checkWindowAlert('<script type="application/ld+json">{"a":"alert(1)"}</script>')).toEqual([]);
    expect(checkWindowAlert('<script src="/a.js"></script>')).toEqual([]);
  });

  it("reads module scripts", () => {
    expect(checkWindowAlert('<script type="module">alert(1)</script>')).toHaveLength(1);
  });
});

const FULL = (head: string): string => `<!doctype html>\n<html lang="en">\n<head>\n<title>Atlas page</title>${head}\n</head><body></body></html>`;
const DESC = '<meta name="description" content="What it does.">';
const OGT = '<meta property="og:title" content="Title">';
const OGI = '<meta property="og:image" content="https://x.test/og.png">';
const seo = (html: string): ReturnType<typeof checkSeoMetaMissing> => checkSeoMetaMissing(html);

describe("seo-meta-missing", () => {
  it("emits one warning for a bare document, naming all three missing items, at the html line", () => {
    const f = seo(FULL(""));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ checkId: "seo-meta-missing", severity: "warning", line: 2 });
    expect(f[0]?.message).toContain('name="description"');
    expect(f[0]?.message).toContain('property="og:title"');
    expect(f[0]?.message).toContain('property="og:image"');
  });

  it("is silent when description, og:title and og:image are all present", () => {
    expect(seo(FULL(DESC + OGT + OGI))).toEqual([]);
  });

  it("names only what is missing", () => {
    const m = seo(FULL(DESC + OGT))[0]?.message ?? "";
    expect(m).toContain("og:image");
    expect(m).not.toContain("og:title");
    expect(m).not.toContain('name="description"');
  });

  it.each([
    ["description", OGT + OGI, 'name="description"'],
    ["og:title", DESC + OGI, "og:title"],
    ["og:image", DESC + OGT, "og:image"],
  ])("fires when only %s is missing", (_n, head, named) => {
    const f = seo(FULL(head));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain(named);
  });

  it("skips a page marked noindex, whatever the attribute order or extra directives", () => {
    expect(seo(FULL('<meta name="robots" content="noindex">'))).toEqual([]);
    expect(seo(FULL('<meta content="noindex, nofollow" name="robots">'))).toEqual([]);
    expect(seo(FULL("<meta name='ROBOTS' content='NoIndex'>"))).toEqual([]);
  });

  it("does not skip for a robots tag that allows indexing, or a noindex on another meta", () => {
    expect(seo(FULL('<meta name="robots" content="index, follow">'))).toHaveLength(1);
    expect(seo(FULL('<meta name="description" content="noindex">'))).toHaveLength(1);
  });

  it("counts an empty content attribute as absent", () => {
    expect(seo(FULL('<meta name="description" content="">' + OGT + OGI))).toHaveLength(1);
  });

  it("accepts og tags written with name= as well as property=", () => {
    expect(seo(FULL(DESC + '<meta name="og:title" content="T"><meta name="og:image" content="i.png">'))).toEqual([]);
  });

  it("reads meta tags outside comments only", () => {
    expect(seo(FULL(`<!-- ${DESC}${OGT}${OGI} -->`))).toHaveLength(1);
  });

  it("is silent on a fragment with no html or head", () => {
    expect(seo('<section><h1>Hero</h1><a href="/x">Go</a></section>')).toEqual([]);
  });

  it("recognises a head-only document as a full document", () => {
    expect(seo("<head><title>t</title></head><body></body>")).toHaveLength(1);
  });
});

const fav = (html: string): number => checkFaviconMissing(html).length;

describe("favicon-missing", () => {
  it("emits one warning for a document with no icon link, at the html line", () => {
    const f = checkFaviconMissing(FULL(""));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ checkId: "favicon-missing", severity: "warning", line: 2 });
  });

  it.each([
    ["rel=icon", '<link rel="icon" href="/f.ico">'],
    ["shortcut icon", '<link rel="shortcut icon" href="/f.ico">'],
    ["icon with a type", '<link rel="icon" type="image/svg+xml" href="/f.svg">'],
    ["href before rel", '<link href="/f.png" rel="icon">'],
    ["uppercase rel", '<link rel="ICON" href="/f.png">'],
    ["single quotes", "<link rel='icon' href='/f.png'>"],
    ["an inline data URI", '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E">'],
  ])("is satisfied by %s", (_n, link) => {
    expect(fav(FULL(link))).toBe(0);
  });

  it.each([
    ["only an apple-touch-icon", '<link rel="apple-touch-icon" href="/a.png">'],
    ["only a stylesheet", '<link rel="stylesheet" href="/a.css">'],
    ["a link with no rel", '<link href="/icon.png">'],
    ["a mask-icon", '<link rel="mask-icon" href="/m.svg">'],
  ])("still fires for %s", (_n, link) => {
    expect(fav(FULL(link))).toBe(1);
  });

  it("ignores an icon link inside a comment", () => {
    expect(fav(FULL('<!-- <link rel="icon" href="/f.ico"> -->'))).toBe(1);
  });

  it("is silent on a fragment", () => {
    expect(fav("<section>Hero</section>")).toBe(0);
  });
});

describe("wiring", () => {
  it("allContentChecks carries all three, so content-lint and the gate both run them", () => {
    const html = FULL("").replace("</body>", '<script>alert(1)</script></body>');
    const ids = new Set(allContentChecks.flatMap((c) => c(html)).map((f) => f.checkId));
    expect(ids).toEqual(new Set(["window-alert", "seo-meta-missing", "favicon-missing"]));
  });

  it("ui gate reports them as content warnings and the verdict is unchanged", () => {
    const base = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gate</title></head><body><main><h1>Hi</h1></main></body></html>';
    const r = runGate(base);
    const ids = (r.families.content?.findings ?? []).map((f) => f.checkId);
    expect(ids).toContain("seo-meta-missing");
    expect(ids).toContain("favicon-missing");
    expect(r.families.content?.errorCount).toBe(0);
    expect(r.pass).toBe(true);
    const fixed = base.replace("</head>", `<link rel="icon" href="data:,">${DESC}${OGT}${OGI}</head>`);
    expect((runGate(fixed).families.content?.findings ?? []).map((f) => f.checkId)).not.toContain("seo-meta-missing");
  });
});
