/**
 * Phase 10: the rendered tier.
 *
 * The judging half is pure and is tested WITHOUT a browser — that is the whole
 * point of quarantining nondeterminism in the capture step, and it is what lets
 * a hostless CI run still verify these rules.
 *
 * The live half runs only where a browser is already installed. It is skipped,
 * loudly, where one is not — a skipped smoke that pretends to be a pass is the
 * failure mode this tier exists to avoid.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintRendered, RENDERED_RULES } from "../src/core/tell-rules-rendered.js";
import { locateBrowser } from "../src/core/rendered/browser-session.js";
import { capturePage } from "../src/core/rendered/capture-page.js";
import { CAPTURE_VERSION, isSupportedCapture, describeUnsupported } from "../src/core/rendered/runtime-capture.js";
import type { RuntimeCapture, CapturedNode } from "../src/core/rendered/runtime-capture.js";
import { CHECK_CATALOG } from "../src/core/check-catalog.js";

const ENGINE = { browser: "Chrome/151.0.0.0", viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, settleMs: 700 };

const node = (over: Partial<CapturedNode> & { ref: string }): CapturedNode => ({
  tag: "div",
  computed: { opacity: "1", "background-color": "rgba(0, 0, 0, 0)", "font-size": "16px" },
  box: { x: 0, y: 0, width: 200, height: 40 },
  ...over,
});

const capture = (nodes: CapturedNode[], consoleErrors: string[] = []): RuntimeCapture =>
  ({ version: CAPTURE_VERSION, target: "t.html", engine: ENGINE, nodes, consoleErrors });

describe("the capture contract", () => {
  it("is versioned, and an unknown version is REFUSED rather than read as empty", () => {
    expect(isSupportedCapture(capture([]))).toBe(true);
    expect(isSupportedCapture({ version: 99, nodes: [], engine: {} })).toBe(false);
    expect(describeUnsupported({ version: 99 })).toContain("version 99");
    expect(describeUnsupported({})).toContain("no version field");
    // Reading a future capture as empty would turn a version mismatch into a
    // clean bill of health.
    expect(isSupportedCapture(null)).toBe(false);
  });

  it("stamps every finding with the engine that produced it", () => {
    const hidden = node({ ref: "html > p", tag: "p", text: "Hello", computed: { opacity: "0" } });
    const findings = lintRendered(capture([hidden]));
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.engine).toBe("Chrome/151.0.0.0");
  });
});

describe("content-hidden-at-rest — the rule that justifies the tier", () => {
  it("catches copy still at opacity 0 after the page settled", () => {
    const f = lintRendered(capture([node({ ref: "html > div.hero", text: "Never revealed", computed: { opacity: "0" } })]));
    expect(f.map((x) => x.checkId)).toContain("content-hidden-at-rest");
    expect(f[0]?.severity).toBe("error");
    expect(f[0]?.message).toContain("Never revealed");
  });

  it("does NOT flag deliberate hiding", () => {
    const none = node({ ref: "a", text: "x", computed: { opacity: "0", display: "none" } });
    const hidden = node({ ref: "b", text: "x", computed: { opacity: "0", visibility: "hidden" } });
    expect(lintRendered(capture([none, hidden])).map((f) => f.checkId)).not.toContain("content-hidden-at-rest");
  });

  it("does NOT flag an element with no text or no box", () => {
    const empty = node({ ref: "a", computed: { opacity: "0" } });
    const zero = node({ ref: "b", text: "x", computed: { opacity: "0" }, box: { x: 0, y: 0, width: 0, height: 0 } });
    expect(lintRendered(capture([empty, zero])).map((f) => f.checkId)).not.toContain("content-hidden-at-rest");
  });

  it("does NOT flag visible copy", () => {
    // Scoped to THIS rule: the default fixture box sits at x = 0, which another
    // rule legitimately flags, and asserting an empty array here would be
    // asserting six other rules at the same time.
    const ids = lintRendered(capture([node({ ref: "a", text: "Visible" })])).map((f) => f.checkId);
    expect(ids).not.toContain("content-hidden-at-rest");
  });
});

describe("the other six", () => {
  it("catches text clipped by its own container", () => {
    const n = node({
      ref: "a", text: "Long copy", computed: { overflow: "hidden", opacity: "1" },
      scroll: { scrollWidth: 400, scrollHeight: 40, clientWidth: 200, clientHeight: 40 },
    });
    expect(lintRendered(capture([n])).map((f) => f.checkId)).toContain("text-overflow");
  });

  it("does not call a SCROLLABLE container an overflow", () => {
    const n = node({
      ref: "a", text: "Long copy", computed: { overflow: "auto", opacity: "1" },
      scroll: { scrollWidth: 400, scrollHeight: 40, clientWidth: 200, clientHeight: 40 },
    });
    expect(lintRendered(capture([n])).map((f) => f.checkId)).not.toContain("text-overflow");
  });

  it("catches an image that did not load, and passes one that did", () => {
    const broken = node({ ref: "a", tag: "img", image: { complete: false, naturalWidth: 0, naturalHeight: 0 } });
    const fine = node({ ref: "b", tag: "img", image: { complete: true, naturalWidth: 800, naturalHeight: 600 } });
    const ids = lintRendered(capture([broken, fine])).map((f) => f.checkId);
    expect(ids.filter((i) => i === "broken-image")).toHaveLength(1);
  });

  it("reports console errors, capped so one broken page is not a wall", () => {
    const errors = Array.from({ length: 20 }, (_, i) => `TypeError ${i}`);
    const f = lintRendered(capture([], errors)).filter((x) => x.checkId === "script-error");
    expect(f).toHaveLength(5);
  });

  it("catches text fully covered by an opaque box", () => {
    const text = node({ ref: "html > p", tag: "p", text: "Hidden behind", box: { x: 10, y: 10, width: 100, height: 20 } });
    const cover = node({
      ref: "html > div.overlay", computed: { "background-color": "rgb(0, 0, 0)", opacity: "1" },
      box: { x: 0, y: 0, width: 200, height: 100 },
    });
    expect(lintRendered(capture([text, cover])).map((f) => f.checkId)).toContain("text-occlusion");
  });

  it("catches content past the viewport, and body copy against the edge", () => {
    const wide = node({ ref: "a", box: { x: 0, y: 10, width: 1400, height: 40 } });
    const edge = node({ ref: "b", tag: "p", text: "Copy", box: { x: 2, y: 200, width: 300, height: 20 } });
    const ids = lintRendered(capture([wide, edge])).map((f) => f.checkId);
    expect(ids).toContain("first-viewport-column-overflow");
    expect(ids).toContain("body-text-viewport-edge");
  });

  it("lets a large heading bleed to the edge without complaint", () => {
    const heading = node({
      ref: "h", tag: "h1", text: "Big", computed: { "font-size": "64px", opacity: "1" },
      box: { x: 0, y: 100, width: 600, height: 80 },
    });
    expect(lintRendered(capture([heading])).map((f) => f.checkId)).not.toContain("body-text-viewport-edge");
  });

  it("is silent on a clean capture", () => {
    // Inside a gutter on both sides: x >= 8 and right edge <= viewport - 8.
    const clean = node({ ref: "a", text: "Fine", box: { x: 40, y: 40, width: 600, height: 24 } });
    expect(lintRendered(capture([clean]))).toEqual([]);
  });

  it("is deterministic", () => {
    const nodes = [node({ ref: "b", text: "x", computed: { opacity: "0" } }), node({ ref: "a", text: "y", computed: { opacity: "0" } })];
    expect(JSON.stringify(lintRendered(capture(nodes)))).toBe(JSON.stringify(lintRendered(capture([...nodes].reverse()))));
  });
});

describe("catalog pairing", () => {
  it("every rendered rule has a catalog row requiring `rendered` confidence", () => {
    for (const rule of RENDERED_RULES) {
      const row = CHECK_CATALOG.find((e) => e.id === rule.id);
      expect(row, rule.id).toBeDefined();
      const requires = row?.requires;
      expect(typeof requires, rule.id).toBe("object");
      if (typeof requires === "object") expect(requires.minConfidence, rule.id).toBe("rendered");
    }
  });

  it("has exactly seven, matching the deferred set", () => {
    expect(RENDERED_RULES.map((r) => r.id).sort()).toEqual([
      "body-text-viewport-edge", "broken-image", "content-hidden-at-rest",
      "first-viewport-column-overflow", "script-error", "text-occlusion", "text-overflow",
    ]);
  });
});

describe("browser location", () => {
  it("names the variable to set instead of failing blankly", () => {
    // Nothing named, no env, no platform candidates — the branch that must never
    // be a silent pass. On a machine that HAS Chrome the real candidate list
    // would rescue it, which is why the list is a parameter.
    const r = locateBrowser(undefined, {} as NodeJS.ProcessEnv, []);
    expect(r.path).toBeUndefined();
    expect(r.reason).toContain("CHROME_PATH");
    expect(r.reason).toContain("--browser");
  });

  it("prefers an explicit path over the environment and the platform list", () => {
    const found = locateBrowser();
    if (found.path === undefined) return;
    expect(locateBrowser(found.path, { CHROME_PATH: "/nope" } as NodeJS.ProcessEnv, []).path).toBe(found.path);
  });

  it("never turns a bad explicit path into a good one", () => {
    const r = locateBrowser("/definitely/not/here", {} as NodeJS.ProcessEnv, []);
    expect(r.path).toBeUndefined();
  });

  it("honours an explicit path over the environment", () => {
    const found = locateBrowser();
    if (found.path === undefined) return; // no browser here; the live suite says so
    expect(locateBrowser(found.path, {} as NodeJS.ProcessEnv).path).toBe(found.path);
  });
});

/**
 * Live smoke. Runs only where a browser is already installed, and says so when
 * it does not — a silent skip is the shape of a test that never guarded.
 */
describe("live capture", () => {
  const browser = locateBrowser().path;

  it("reports whether the live tier could be exercised at all", () => {
    // Deliberately always-green: its job is to PRINT the environment fact, so a
    // green suite on a browserless machine cannot be mistaken for coverage.
    if (browser === undefined) console.warn("live rendered tier NOT exercised: no browser on this machine");
    expect(true).toBe(true);
  });

  it.skipIf(browser === undefined)("reads real computed styles and catches a hidden entrance", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rendered-smoke-"));
    const page = join(dir, "p.html");
    writeFileSync(
      page,
      `<!doctype html><html lang="en"><head><title>t</title><style>
        :root{--brand:#7c3aed}
        .muted{color:#9ca3af;background:var(--brand);font-size:11px}
        .hidden{opacity:0;transform:translateY(20px)}
      </style></head><body>
      <p class="muted">gray on color</p><div class="hidden">never revealed</div></body></html>`,
      "utf8",
    );
    try {
      const cap = await capturePage({ browserPath: browser as string, target: page, settleMs: 300 });
      expect(cap.engine.browser).toMatch(/Chrom|Edg/);

      const muted = cap.nodes.find((n) => n.ref.includes("p.muted"));
      // var(--brand) resolved by the real engine — the value a user sees.
      expect(muted?.computed["background-color"]).toBe("rgb(124, 58, 237)");
      expect(muted?.computed["color"]).toBe("rgb(156, 163, 175)");

      const findings = lintRendered(cap);
      expect(findings.map((f) => f.checkId)).toContain("content-hidden-at-rest");
      for (const f of findings) expect(f.engine).toBe(cap.engine.browser);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(browser === undefined)("collects a REAL console error — script-error can actually fire", async () => {
    // consoleErrors was an array nothing ever wrote to, so script-error was a
    // rule that could never fire on a live page. A probe that deleted the domain
    // enables stayed green, which is what that emptiness looks like from inside.
    const dir = mkdtempSync(join(tmpdir(), "rendered-throw-"));
    const page = join(dir, "p.html");
    writeFileSync(
      page,
      `<!doctype html><html lang="en"><head><title>t</title></head><body><p>x</p>` +
        `<script>throw new Error("deliberate boom");</script></body></html>`,
      "utf8",
    );
    try {
      const cap = await capturePage({ browserPath: browser as string, target: page, settleMs: 300 });
      expect(cap.consoleErrors.join(" ")).toContain("deliberate boom");
      const ids = lintRendered(cap).map((f) => f.checkId);
      expect(ids).toContain("script-error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(browser === undefined)("leaves no process holding its port", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rendered-orphan-"));
    const page = join(dir, "p.html");
    writeFileSync(page, "<!doctype html><html lang=en><head><title>t</title></head><body><p>x</p></body></html>", "utf8");
    try {
      // Two runs back to back. With an OS-assigned port there is no conflict to
      // race on, and an orphaned browser would show up as a leaked process
      // rather than as a hang — which is the honest failure to have.
      await capturePage({ browserPath: browser as string, target: page, settleMs: 100 });
      const second = await capturePage({ browserPath: browser as string, target: page, settleMs: 100 });
      expect(second.nodes.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("an explicitly named browser is never silently substituted", () => {
  it("stops on a --browser path that does not exist", () => {
    const r = locateBrowser("/definitely/not/here");
    expect(r.path).toBeUndefined();
    expect(r.reason).toContain("/definitely/not/here");
    // The dangerous behaviour is falling through to a DIFFERENT engine: every
    // rendered finding is stated under its engine, so the substitution would
    // quietly invalidate the report while looking like it worked.
    expect(r.path).not.toBe(locateBrowser().path);
  });

  it("still falls back through the environment when nothing was named", () => {
    const found = locateBrowser();
    if (found.path === undefined) return;
    expect(locateBrowser(undefined, { CHROME_PATH: found.path } as NodeJS.ProcessEnv, []).path).toBe(found.path);
  });
});
