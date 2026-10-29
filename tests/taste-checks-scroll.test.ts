/**
 * scroll-listener-unthrottled. Each case pairs a page that must warn with the nearest page
 * that must stay silent: the listener with and without a frame scheduler, in code and in
 * comments, inline and external.
 */
import { describe, expect, it } from "vitest";
import { lintTaste } from "../src/core/taste-lint.js";
import { checkScrollListenerUnthrottled } from "../src/core/taste-checks-scroll.js";

const page = (...scripts: string[]): string =>
  `<!doctype html><html><head><title>t</title></head><body>\n${scripts.map((s) => `<script>${s}</script>`).join("\n")}\n</body></html>`;
const hits = (html: string): number => checkScrollListenerUnthrottled(html).length;

describe("scroll-listener-unthrottled", () => {
  it("warns on a scroll listener with no requestAnimationFrame, as a Motion warning", () => {
    const f = checkScrollListenerUnthrottled(page('window.addEventListener("scroll", () => update());'));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ checkId: "scroll-listener-unthrottled", axis: "Motion", severity: "warning", line: 2 });
  });

  it.each([
    ["double quotes", 'addEventListener("scroll", f)'],
    ["single quotes", "addEventListener('scroll', f)"],
    ["a template literal", "addEventListener(`scroll`, f)"],
    ["options argument", 'addEventListener("scroll", f, { passive: true })'],
    ["whitespace in the call", 'addEventListener (  "scroll" , f)'],
    ["onscroll assignment", "window.onscroll = update;"],
    ["onscroll without a receiver", "onscroll = update;"],
  ])("warns for %s", (_n, js) => {
    expect(hits(page(js))).toBe(1);
  });

  it("is silent when requestAnimationFrame appears in the same script", () => {
    expect(hits(page('addEventListener("scroll", () => requestAnimationFrame(update));'))).toBe(0);
  });

  it("is silent when requestAnimationFrame appears in a different inline script", () => {
    expect(hits(page('addEventListener("scroll", f);', "function tick(){ window.requestAnimationFrame(tick); }"))).toBe(0);
  });

  it("is not satisfied by requestAnimationFrame mentioned only in a comment", () => {
    expect(hits(page('// TODO: wrap in requestAnimationFrame\naddEventListener("scroll", f);'))).toBe(1);
    expect(hits(page('/* requestAnimationFrame */ addEventListener("scroll", f);'))).toBe(1);
  });

  it("is silent when the listener is only in a comment", () => {
    expect(hits(page('// addEventListener("scroll", f)\n/* window.onscroll = f */'))).toBe(0);
  });

  it("is silent for events that are not scroll", () => {
    for (const js of ['addEventListener("resize", f)', 'addEventListener("scrollend", f)', 'addEventListener("scrolled", f)', "if (a.onscroll == null) {}"]) {
      expect(hits(page(js)), js).toBe(0);
    }
  });

  it("is silent for an IntersectionObserver page with no scroll listener", () => {
    expect(hits(page("new IntersectionObserver(cb).observe(el);"))).toBe(0);
  });

  it("reads inline scripts only: an attribute handler, an external script and JSON data do not count", () => {
    expect(hits('<body onscroll="update()"></body>')).toBe(0);
    expect(hits('<script src="/app.js"></script>')).toBe(0);
    expect(hits('<script type="application/json">{"on":"addEventListener(\\"scroll\\")"}</script>')).toBe(0);
  });

  it("reports one finding per document, at the first listener", () => {
    const f = checkScrollListenerUnthrottled(page('addEventListener("scroll", a);', 'addEventListener("scroll", b);'));
    expect(f).toHaveLength(1);
    expect(f[0]?.line).toBe(2);
  });

  it("adds a warning to lintTaste and no error, so the verdict is unchanged", () => {
    const quiet = lintTaste(page("go();"));
    const loud = lintTaste(page('addEventListener("scroll", f);'));
    expect(loud.findings.map((f) => f.checkId)).toContain("scroll-listener-unthrottled");
    expect(quiet.findings.map((f) => f.checkId)).not.toContain("scroll-listener-unthrottled");
    expect(loud.errorCount).toBe(quiet.errorCount);
    expect(loud.warningCount).toBe(quiet.warningCount + 1);
  });
});
