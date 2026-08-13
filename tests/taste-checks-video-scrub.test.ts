/**
 * Motion axis, scroll-scrub subset. Every case breaks one floor from
 * knowledge/scroll-cinema-direction.md on purpose and asserts the check fires,
 * then pairs it with the correct form and asserts silence — a check that never
 * goes red has not been shown to run, and one that never goes green is a tax.
 *
 * Pure content in / findings out; no tmpdir, no build artifact.
 */
import { describe, expect, it } from "vitest";

import { videoScrubChecks, usesScrollScrub } from "../src/core/taste-checks-video-scrub.js";

const ids = (html: string): string[] => videoScrubChecks(html).map((f) => f.checkId).sort();

/** A scrub page: scroll drives currentTime, and the video carries both iOS attributes. */
function doc(opts: {
  video?: string;
  script?: string;
  style?: string;
  meta?: string;
} = {}): string {
  const video = opts.video ?? '<video muted playsinline src="a.mp4"></video>';
  const script = opts.script ?? 'addEventListener("scroll", () => { v.currentTime = p * d; });';
  const meta = opts.meta ?? '<meta name="viewport" content="width=device-width, viewport-fit=cover">';
  const style = opts.style ? `<style>${opts.style}</style>` : "";
  return `<!doctype html><html><head>${meta}${style}</head><body>
${video}
<script>${script}</script></body></html>`;
}

/** The reduced-motion branch, so a case can isolate the floor it is testing. */
const RM = 'if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;';

describe("usesScrollScrub — the gate the motion checks sit behind", () => {
  it("needs BOTH a currentTime assignment and a scroll source", () => {
    expect(usesScrollScrub(doc())).toBe(true);
    // Seeking from a button is not a scrubbed flight.
    expect(usesScrollScrub(doc({ script: 'btn.onclick = () => { v.currentTime = 0; };' }))).toBe(false);
    // Scrolling without driving video time is not either.
    expect(usesScrollScrub(doc({ script: 'addEventListener("scroll", () => header.classList.add("on"));' }))).toBe(false);
  });

  it("stays silent on an ordinary page with a decorative video", () => {
    const html = doc({ video: "<video src=\"a.mp4\"></video>", script: "console.log('hi');" });
    expect(videoScrubChecks(html)).toEqual([]);
  });

  it("accepts a rect-driven scrub, not only a scroll listener", () => {
    expect(usesScrollScrub(doc({ script: 'const r = el.getBoundingClientRect(); v.currentTime = r.top;' }))).toBe(true);
  });
});

describe("video-scrub-no-reduced-motion", () => {
  it("fires when scroll drives currentTime with no reduce branch", () => {
    expect(ids(doc())).toContain("video-scrub-no-reduced-motion");
  });

  it("accepts a JS matchMedia guard", () => {
    expect(ids(doc({ script: `${RM} addEventListener("scroll", () => { v.currentTime = p; });` })))
      .not.toContain("video-scrub-no-reduced-motion");
  });

  it("accepts a CSS media query — the outcome is what is owed, not the API", () => {
    expect(ids(doc({ style: "@media (prefers-reduced-motion: reduce) { .sw { display: none; } }" })))
      .not.toContain("video-scrub-no-reduced-motion");
  });
});

describe("video-scrub-attrs", () => {
  it.each([
    ["muted", '<video playsinline src="a.mp4"></video>'],
    ["playsinline", '<video muted src="a.mp4"></video>'],
    ["both", '<video src="a.mp4"></video>'],
  ])("fires when %s is missing", (_label, video) => {
    expect(ids(doc({ video, script: `${RM} addEventListener("scroll", () => { v.currentTime = p; });` })))
      .toContain("video-scrub-attrs");
  });

  it("names which attribute is missing, so the fix is the message", () => {
    const f = videoScrubChecks(doc({ video: '<video playsinline src="a.mp4"></video>' }))
      .find((x) => x.checkId === "video-scrub-attrs");
    expect(f?.message).toContain("muted");
    expect(f?.message).not.toContain("and playsinline");
  });

  it("stays silent when both attributes are present", () => {
    expect(ids(doc({ script: `${RM} addEventListener("scroll", () => { v.currentTime = p; });` })))
      .not.toContain("video-scrub-attrs");
  });

  it("reports each offending video, not just the first", () => {
    const two = '<video src="a.mp4"></video>\n<video src="b.mp4"></video>';
    const f = videoScrubChecks(doc({ video: two })).filter((x) => x.checkId === "video-scrub-attrs");
    expect(f).toHaveLength(2);
  });
});

describe("safe-area-viewport-fit", () => {
  it("fires when safe-area insets are used without viewport-fit=cover", () => {
    const html = doc({
      meta: '<meta name="viewport" content="width=device-width, initial-scale=1">',
      style: ".copy { padding-bottom: env(safe-area-inset-bottom); }",
    });
    expect(ids(html)).toContain("safe-area-viewport-fit");
  });

  it("fires when the viewport meta is missing entirely", () => {
    const html = doc({ meta: "", style: ".copy { bottom: env(safe-area-inset-bottom); }" });
    expect(ids(html)).toContain("safe-area-viewport-fit");
  });

  it("stays silent once the meta opts in", () => {
    expect(ids(doc({ style: ".copy { padding-bottom: env(safe-area-inset-bottom); }" })))
      .not.toContain("safe-area-viewport-fit");
  });

  it("is not gated on scrub — the trap belongs to any page reaching for safe areas", () => {
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>.f { padding: env(safe-area-inset-top); }</style></head><body>hi</body></html>`;
    expect(ids(html)).toContain("safe-area-viewport-fit");
  });
});

describe("a correct scroll-cinema page trips nothing", () => {
  it("guards reduced motion, keeps both video attributes, opts into safe areas", () => {
    const html = doc({
      script: `${RM} addEventListener("scroll", () => { v.currentTime = progress * v.duration; });`,
      style: "@media (prefers-reduced-motion: reduce) { .sw-clip { display: none; } }\n.copy { padding-bottom: env(safe-area-inset-bottom); }",
    });
    expect(videoScrubChecks(html)).toEqual([]);
  });

  it("every finding is Motion axis and error severity", () => {
    const bad = doc({
      video: '<video src="a.mp4"></video>',
      meta: '<meta name="viewport" content="width=device-width">',
      style: ".copy { padding-bottom: env(safe-area-inset-bottom); }",
    });
    const findings = videoScrubChecks(bad);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.axis).toBe("Motion");
      expect(f.severity).toBe("error");
    }
  });
});
