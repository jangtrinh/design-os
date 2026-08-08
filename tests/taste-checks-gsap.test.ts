/**
 * Motion axis, GSAP subset. Every case here breaks one rule from
 * knowledge/gsap-motion-direction.md on purpose and asserts the check fires,
 * then pairs it with the correct form and asserts silence — a check that only
 * ever goes green has not been shown to run, and one that never goes green is
 * a tax rather than a gate.
 *
 * Pure content in / findings out; no tmpdir, no build artifact.
 */
import { describe, expect, it } from "vitest";

import { gsapChecks, usesGsap } from "../src/core/taste-checks-gsap.js";

const ids = (html: string): string[] => gsapChecks(html).map((f) => f.checkId).sort();

/** Wrap a script body in the minimum document the checks read. */
function doc(script: string, style = ""): string {
  return `<!doctype html><html><head>${style ? `<style>${style}</style>` : ""}</head><body>
<script>${script}</script></body></html>`;
}

/** A reduced-motion branch, so cases can isolate the rule they are testing. */
const RM = `if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }`;

describe("usesGsap — the gate every check sits behind", () => {
  it("is false for a document with no GSAP, so none of these checks speak", () => {
    const html = doc(`document.querySelector(".x").classList.add("on");`, `.x { will-change: transform; }`);
    expect(usesGsap(html)).toBe(false);
    expect(gsapChecks(html)).toEqual([]);
  });

  it("is true once a tween or a ScrollTrigger appears", () => {
    expect(usesGsap(doc(`gsap.to(".x", { opacity: 1 });`))).toBe(true);
    expect(usesGsap(doc(`ScrollTrigger.create({ trigger: ".x" });`))).toBe(true);
  });
});

describe("gsap-dev-markers-shipped", () => {
  it("fires on markers: true", () => {
    expect(ids(doc(`${RM} gsap.to(".x", { scrollTrigger: { trigger: ".x", markers: true } });`)))
      .toContain("gsap-dev-markers-shipped");
  });

  it("fires on GSDevTools", () => {
    expect(ids(doc(`${RM} GSDevTools.create(); gsap.to(".x", { y: 10 });`)))
      .toContain("gsap-dev-markers-shipped");
  });

  it("stays silent on markers: false — the switch in its off position", () => {
    expect(ids(doc(`${RM} gsap.to(".x", { scrollTrigger: { trigger: ".x", markers: false } });`)))
      .not.toContain("gsap-dev-markers-shipped");
  });
});

describe("gsap-scrub-and-toggle", () => {
  it("fires when one trigger sets both", () => {
    expect(ids(doc(`${RM} gsap.to(".x", { scrollTrigger: { trigger: ".x", scrub: 1, toggleActions: "play none none reverse" } });`)))
      .toContain("gsap-scrub-and-toggle");
  });

  it("allows two separate triggers, one scrubbed and one toggled", () => {
    const html = doc(`${RM}
      gsap.to(".a", { scrollTrigger: { trigger: ".a", scrub: 1 } });
      gsap.to(".b", { scrollTrigger: { trigger: ".b", toggleActions: "play none none reverse" } });`);
    expect(ids(html)).not.toContain("gsap-scrub-and-toggle");
  });
});

describe("gsap-plugin-unregistered", () => {
  it("fires when ScrollTrigger is used with no registerPlugin", () => {
    expect(ids(doc(`${RM} ScrollTrigger.create({ trigger: ".x" });`)))
      .toContain("gsap-plugin-unregistered");
  });

  it("stays silent once the plugin is registered", () => {
    expect(ids(doc(`${RM} gsap.registerPlugin(ScrollTrigger); ScrollTrigger.create({ trigger: ".x" });`)))
      .not.toContain("gsap-plugin-unregistered");
  });

  it("reads a multi-plugin registration", () => {
    expect(ids(doc(`${RM} gsap.registerPlugin(ScrollTrigger, Flip); Flip.from(s); ScrollTrigger.create({ trigger: ".x" });`)))
      .not.toContain("gsap-plugin-unregistered");
  });
});

describe("gsap-transforms-pinned-el", () => {
  it("fires when the pinned selector is itself transformed", () => {
    expect(ids(doc(`${RM} gsap.registerPlugin(ScrollTrigger);
      gsap.to(".scene", { yPercent: -50, scrollTrigger: { trigger: ".scene", pin: ".scene" } });`)))
      .toContain("gsap-transforms-pinned-el");
  });

  it("allows pinning a wrapper and animating a child — the prescribed shape", () => {
    expect(ids(doc(`${RM} gsap.registerPlugin(ScrollTrigger);
      gsap.to(".scene__inner", { yPercent: -50, scrollTrigger: { trigger: ".scene", pin: ".scene" } });`)))
      .not.toContain("gsap-transforms-pinned-el");
  });

  it("ignores a non-transform tween on the pinned element", () => {
    expect(ids(doc(`${RM} gsap.registerPlugin(ScrollTrigger);
      gsap.to(".scene", { opacity: 0.5, scrollTrigger: { trigger: ".scene", pin: ".scene" } });`)))
      .not.toContain("gsap-transforms-pinned-el");
  });
});

describe("gsap-no-reduced-motion", () => {
  it("fires when GSAP animates with no reduced-motion branch anywhere", () => {
    expect(ids(doc(`gsap.to(".x", { y: 40 });`))).toContain("gsap-no-reduced-motion");
  });

  it("accepts gsap.matchMedia with the reduce query", () => {
    expect(ids(doc(`gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {});
      gsap.to(".x", { y: 40 });`))).not.toContain("gsap-no-reduced-motion");
  });

  it("accepts a CSS media query — the outcome is what is owed, not the API", () => {
    expect(ids(doc(`gsap.to(".x", { y: 40 });`, `@media (prefers-reduced-motion: reduce) { * { animation: none; } }`)))
      .not.toContain("gsap-no-reduced-motion");
  });
});

describe("gsap-permanent-will-change", () => {
  it("fires on will-change parked in a static rule", () => {
    expect(ids(doc(`${RM} gsap.to(".x", { y: 40 });`, `.x { will-change: transform; }`)))
      .toContain("gsap-permanent-will-change");
  });

  it("accepts will-change: auto, which is the release value", () => {
    expect(ids(doc(`${RM} gsap.to(".x", { y: 40 });`, `.x { will-change: auto; }`)))
      .not.toContain("gsap-permanent-will-change");
  });

  it("accepts it being set from script as the animation starts", () => {
    expect(ids(doc(`${RM} gsap.to(".x", { y: 40, onStart() { el.style.willChange = "transform"; },
      onComplete() { el.style.willChange = "auto"; } });`))).not.toContain("gsap-permanent-will-change");
  });
});

describe("a correct GSAP scene trips nothing", () => {
  it("registers its plugin, branches on reduced motion, pins a wrapper, animates a child", () => {
    const html = doc(`
      gsap.registerPlugin(ScrollTrigger);
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(".scene__inner", {
          yPercent: -50,
          scrollTrigger: { trigger: ".scene", pin: ".scene", scrub: 1, markers: false },
        });
      });`);
    expect(gsapChecks(html)).toEqual([]);
  });

  it("every finding is Motion axis and error severity", () => {
    const bad = doc(`GSDevTools.create(); ScrollTrigger.create({ trigger: ".x" }); gsap.to(".x", { y: 1 });`,
      `.x { will-change: transform; }`);
    const findings = gsapChecks(bad);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.axis).toBe("Motion");
      expect(f.severity).toBe("error");
    }
  });
});
