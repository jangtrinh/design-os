/**
 * PR-FU3-r2 A7: `shape-assembled-illustration` fired on a real page's `<dl>`
 * of five text metric cards (owner's persona test, 2026-09-27,
 * acceptance-llmgw-personas-9b/web-hairline-dark-leaning-single-accent/inlined.html).
 * The rule's "textless" check compared a structure fact's OWN line against
 * every text fact's line; the cards' copy lives on the nested `dt`/`dd`
 * lines, never on the `.metric` div's own line, so every card read as
 * textless. Markup and the CSS rule that gives `.metric` its radius are
 * copied verbatim from that real page (the fixture must come from the real
 * page, not an invented shape).
 */
import { describe, expect, it } from "vitest";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { extractorById } from "../src/core/design-facts/index.js";
import { lintTell } from "../src/core/tell-lint.js";

// Verbatim from the real page's inlined.html (markup lines 300-322, CSS line 131).
const REAL_METRICS_DL = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>.metric { padding: 12px; border: 1px solid #333; border-radius: 12px; box-shadow: 0 1px 2px #0002; }</style>
</head><body>
<section aria-labelledby="summary-title">
  <h2 id="summary-title">Summary</h2>
  <dl class="metrics">
  <div class="metric">
    <dt class="metric-label">Requests</dt>
    <dd class="metric-value">184,212</dd>
    <dd class="metric-delta">+11.1% vs prior period</dd>
  </div>
  <div class="metric">
    <dt class="metric-label">Input tokens</dt>
    <dd class="metric-value">401.7M</dd>
    <dd class="metric-delta">+13.8% vs prior period</dd>
  </div>
  <div class="metric">
    <dt class="metric-label">Output tokens</dt>
    <dd class="metric-value">61.7M</dd>
    <dd class="metric-delta">+2.6% vs prior period</dd>
  </div>
  <div class="metric">
    <dt class="metric-label">Total tokens</dt>
    <dd class="metric-value">463.4M</dd>
    <dd class="metric-delta">+12.2% vs prior period</dd>
  </div>
  <div class="metric">
    <dt class="metric-label">Estimated cost</dt>
    <dd class="metric-value">$2,104.98</dd>
    <dd class="metric-delta">+18.4% vs prior period</dd>
  </div>
  </dl>
</section>
</body></html>`;

describe("shape-assembled-illustration does not fire on a dl of text metric cards (PR-FU3-r2 A7)", () => {
  it("the metrics dl's five cards, each carrying dt/dd text, are not a textless illustration", () => {
    const profile = extractorById("html-cascade");
    expect(profile).toBeDefined();
    const facts = extractHtml(REAL_METRICS_DL, "metrics.html").collector.facts();
    const result = lintTell(facts, profile!);
    const hit = result.findings.find((f) => f.checkId === "shape-assembled-illustration");
    expect(hit, JSON.stringify(hit)).toBeUndefined();
  });

  it("still fires on genuinely textless rounded siblings (no regression to a no-op)", () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>.dot { width: 8px; height: 8px; border-radius: 8px; background: #333; }</style>
</head><body><div class="art">
<div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
</div></body></html>`;
    const profile = extractorById("html-cascade");
    const facts = extractHtml(html, "dots.html").collector.facts();
    const result = lintTell(facts, profile!);
    expect(result.findings.map((f) => f.checkId)).toContain("shape-assembled-illustration");
  });
});
