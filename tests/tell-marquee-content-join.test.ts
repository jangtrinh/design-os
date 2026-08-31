/**
 * `marquee` claims "auto-scrolling CONTENT the reader cannot pause", so it owes a
 * check that content is what moves.
 *
 * It did not have one. Any infinite animation past the slow-loop threshold matched,
 * and a real page's decorative scanline — `height: 1px`, a transparent-white-
 * transparent gradient, used as `<div class="scanline"></div>` with nothing inside
 * it — was reported as content the reader could not pause.
 *
 * The check is a REFUTATION, not a requirement, and the asymmetry is the whole
 * design. It answers false only when the facts positively show an empty subtree;
 * wherever the evidence is absent it answers true and the finding stands. That is
 * why `needs` stays `["motion"]`: `css-only` supplies motion with no structure and
 * no text, and `swiftui`/`flutter` supply motion and text with no structure.
 * Promoting those kinds into `needs` would turn this rule NOT-EVALUATED on three
 * extractors that run it today — silencing real findings under cover of a coverage
 * change, which is the mistake this repo has already paid for twice.
 *
 * Measured before shipping, across 747 real pages: 39 findings become 1, zero
 * created, and every silenced one is a childless decorative node (two more
 * `div.scanline` hairlines, a `div.orbit`, and a `<div id="ambient"
 * aria-hidden="true"></div>` whose own page declares it is not content).
 *
 * Red probe: delete the `subtreeHasReadableContent` filter and the two "does not
 * fire" cases fail. The three "still fires" cases are the controls and stay green
 * through that — they are what proves this is an exemption and not a mute button.
 */
import { describe, expect, it } from "vitest";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";

const HTML = extractorById("html-cascade");
if (HTML === undefined) throw new Error("html-cascade must be registered");

/** A page whose `.band` loops forever for 8s, wrapping whatever `inner` is given. */
const page = (inner: string): string => `<!doctype html>
<html><head><title>t</title><style>
.band { animation: slide 8s linear infinite; }
@keyframes slide { from { left: 0 } to { left: 100% } }
</style></head><body>
<div class="band">${inner}</div>
</body></html>`;

const marqueeOn = (html: string) =>
  lintTell(extractHtml(html, "page.html").collector.facts(), HTML).findings.filter((f) => f.checkId === "marquee");

describe("marquee fires only when content moves", () => {
  it("does not fire on an empty decorative band", () => {
    expect(marqueeOn(page(""))).toEqual([]);
  });

  it("does not fire when the subtree holds only more empty boxes", () => {
    // The scanline shape from the real page: nested wrappers, no copy anywhere.
    expect(marqueeOn(page(`<div class="a"><div class="b"></div></div>`))).toEqual([]);
  });

  it("still fires when the band carries text directly", () => {
    expect(marqueeOn(page(`Breaking news, forever`)).length).toBeGreaterThan(0);
  });

  it("still fires when the text is nested deeper in the subtree", () => {
    // The descendant walk is the point: content two levels down still counts.
    expect(marqueeOn(page(`<div class="a"><span>Breaking news</span></div>`)).length).toBeGreaterThan(0);
  });

  it("still fires when the band carries an image instead of text", () => {
    // There is no `img` fact kind; an image is a structure fact whose node is img.
    expect(marqueeOn(page(`<div class="a"><img src="x.png" alt="logo"></div>`)).length).toBeGreaterThan(0);
  });
});
