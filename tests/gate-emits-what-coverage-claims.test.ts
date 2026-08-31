/**
 * `gate coverage` says a check is active. `ui gate` must be able to emit it.
 *
 * Those are two different code paths and they drifted apart in silence. Coverage
 * counts CATALOG ROWS; `runGate` composes each family from whichever producers it
 * happens to call. Where a producer is never called, its rows are reported active
 * forever and can never appear in a verdict.
 *
 * Six rows were in that state: `low-contrast`, the four voice tells, and
 * `prompt-leak-metadata` — which was added to the blind spot as the first
 * error-severity row in it, by an author (me) who then wrote a comment asserting the
 * gate attributed them correctly.
 *
 * The existing catalog pairing (`check-catalog.test.ts`) does not catch this. It
 * pairs rows against IDS IN THE SOURCES, so a check that exists, is registered, and
 * is never reached passes it cleanly. Reachability is a different claim and needs a
 * different probe: run the gate on artifacts built to trip each ride-along producer,
 * and demand the finding come back out under the right family.
 *
 * Deliberately fixture-driven rather than static. A structural version would have to
 * enumerate "ids this composer can draw from", which is a grep over the same sources
 * the catalog was built from — green by construction, and blind to exactly the
 * question being asked.
 *
 * Red probe: revert either wiring in `gate.ts` — drop `factPass()?.contrast` from the
 * a11y family, or the fact-based half from the content family — and the matching case
 * here fails. Verified both.
 */
import { describe, expect, it } from "vitest";
import { runGate, gateCoverage } from "../src/core/gate.js";

/** A page whose title is a leaked brief, whose copy is a buzzword stack, and whose
 *  brand pink cannot carry white text. One artifact, three ride-along producers. */
const RIDE_ALONG_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${"[var-9] Leaked Generation Brief - Web - Landing page - AI design - reference the codebase and keep the chrome. ".repeat(4)}</title>
<style>
  .cta { color: #ffffff; background: #ff385c; font-size: 16px; }
</style>
</head><body>
<h1>Plantbox</h1>
<p class="cta">A world-class enterprise-grade solution that will supercharge your workflow.</p>
</body></html>`;

const idsIn = (family: "a11y" | "content"): string[] => {
  const r = runGate(RIDE_ALONG_PAGE, {});
  return (r.families[family]?.findings ?? []).map((f) => f.checkId);
};

describe("a check the coverage report calls active is a check the gate can emit", () => {
  it("emits low-contrast, which is computed and not read off the document", () => {
    // `lintA11y` cannot produce this one: it needs a resolved background, so it comes
    // off the fact pass. White on #ff385c is 3.52:1 against a 4.5:1 floor.
    expect(idsIn("a11y")).toContain("low-contrast");
  });

  it("emits the fact-based half of the content family", () => {
    const ids = idsIn("content");
    expect(ids).toContain("marketing-buzzword");
    expect(ids).toContain("prompt-leak-metadata");
  });

  it("still emits the regex half of the content family", () => {
    // The control. Wiring the fact-based half in must not displace the twelve checks
    // that were already there.
    const ids = runGate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head>
      <body><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></body></html>`, {}).families.content?.findings.map((f) => f.checkId) ?? [];
    expect(ids).toContain("lorem-ipsum");
  });

  it("reports a contrast pass that could not see every background as PARTIAL", () => {
    // A verdict from a half-read artifact is a floor, not a clean bill. 342 of 747
    // real pages have at least one background the cascade cannot resolve.
    const r = runGate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title>
      <style>.x { color: #333; background: var(--nope); }</style></head>
      <body><p class="x">Copy on a background nobody can resolve.</p></body></html>`, {});
    expect(r.partial.join(" ")).toMatch(/NOT COMPUTABLE/);
  });

  it("leaves a clean page clean", () => {
    // The control that stops this from becoming a page that always fails.
    const r = runGate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plantbox</title>
      <style>.c { color: #111827; background: #ffffff; font-size: 16px; }</style></head>
      <body><h1>Plantbox</h1><p class="c">Vegan meal prep, delivered weekly.</p></body></html>`, {});
    expect((r.families.a11y?.findings ?? []).map((f) => f.checkId)).not.toContain("low-contrast");
    expect(r.partial).toEqual([]);
  });

  it("has no family the coverage report counts and the gate never composes", () => {
    // The generalisation. Every family with active rows must be one `runGate`
    // actually builds — the shape of the original defect, one level up.
    const cov = gateCoverage({ tokensPresent: true, dsPresent: true, renderAvailable: false });
    const r = runGate(RIDE_ALONG_PAGE, {});
    for (const [family, counts] of Object.entries(cov.families)) {
      if (counts.active === 0) continue;
      expect(
        Object.prototype.hasOwnProperty.call(r.families, family),
        `gate coverage reports ${counts.active} active checks in "${family}" and runGate never composes that family`,
      ).toBe(true);
    }
  });
});
