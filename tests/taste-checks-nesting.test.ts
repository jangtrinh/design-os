/**
 * container-nesting-depth (Layout, warning) — taste-checks-nesting.ts
 * Fixtures cover: a tripping chain, a clean fixture, each exemption path
 * (landmark / list / grid-track-children / aria-role), and the depth-2-clean
 * vs depth-3-flag boundary. A final block drives it through lintTaste() to
 * prove registration.
 */
import { describe, expect, it } from "vitest";
import { checkContainerNestingDepth } from "../src/core/taste-checks-nesting.js";
import { lintTaste } from "../src/core/taste-lint.js";

describe("container-nesting-depth", () => {
  it("flags a container-soup wrapper chain (section > card > pill > tag, 4 levels deep)", () => {
    const html = [
      "<section>",
      '  <div class="card">',
      '    <div class="rounded-full pill">',
      '      <div class="border tag">x</div>',
      "    </div>",
      "  </div>",
      "</section>",
    ].join("\n");
    const f = checkContainerNestingDepth(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("container-nesting-depth");
    expect(f[0]?.axis).toBe("Layout");
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("4 levels deep"); // section, card, pill, tag
    expect(f[0]?.line).toBe(4); // the innermost <div class="border tag"> line
  });

  it("does NOT flag clean markup (plain content, no wrapper soup)", () => {
    const html = '<main><h1>Title</h1><p class="prose">Body copy.</p></main>';
    expect(checkContainerNestingDepth(html)).toHaveLength(0);
  });

  it("boundary: exactly 2 nested containers is clean", () => {
    const html = '<div class="card"><div class="panel">x</div></div>';
    expect(checkContainerNestingDepth(html)).toHaveLength(0);
  });

  it("boundary: exactly 3 nested containers flags", () => {
    const html = '<div class="card"><div class="panel"><div class="border">x</div></div></div>';
    const f = checkContainerNestingDepth(html);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("3 levels deep");
  });

  it("exemption: a landmark (<main>/<nav>/<header>/<footer>) resets the chain", () => {
    const html = [
      '<div class="card"><div class="panel">',
      '  <main class="rounded">',
      '    <div class="card"><div class="panel">clean, only 2 deep past the landmark</div></div>',
      "  </main>",
      "</div></div>",
    ].join("\n");
    expect(checkContainerNestingDepth(html)).toHaveLength(0);
  });

  it("exemption: a list/table container breaks the chain", () => {
    const html = [
      '<div class="card"><div class="panel">',
      "  <ul>",
      '    <li><div class="card"><div class="panel">x</div></div></li>',
      "  </ul>",
      "</div></div>",
    ].join("\n");
    expect(checkContainerNestingDepth(html)).toHaveLength(0);
  });

  it("exemption: a grid's direct children are track cells, not extra nesting", () => {
    // Grid parent (depth 1) has 3 direct .card children — each inherits depth 1,
    // not 2/3/4, because siblings-in-a-track are not "wrapping".
    const html = [
      '<div class="card grid grid-cols-3">',
      '  <div class="panel">a</div>',
      '  <div class="panel">b</div>',
      '  <div class="panel">c</div>',
      "</div>",
    ].join("\n");
    expect(checkContainerNestingDepth(html)).toHaveLength(0);
  });

  it("grid exemption only covers DIRECT children — deeper nesting inside a track cell still counts", () => {
    const html = [
      '<div class="grid">',
      '  <div class="card">', // depth 1 (track child of grid, inherits grid's depth 0->1 as first container)
      '    <div class="panel">', // depth 2
      '      <div class="border">too deep</div>', // depth 3 — flags
      "    </div>",
      "  </div>",
      "</div>",
    ].join("\n");
    const f = checkContainerNestingDepth(html);
    expect(f).toHaveLength(1);
  });

  it("exemption: an element carrying role= or aria-* breaks the chain", () => {
    const html = [
      '<div class="card"><div class="panel">',
      '  <div role="region" aria-label="Widget" class="border">',
      '    <div class="card"><div class="panel">clean past the aria boundary</div></div>',
      "  </div>",
      "</div></div>",
    ].join("\n");
    expect(checkContainerNestingDepth(html)).toHaveLength(0);
  });

  it("does not flag when a non-container element (e.g. <p>) sits between wrappers, but the chain still runs through it", () => {
    const html = '<div class="card"><p><div class="panel"><div class="border">x</div></div></p></div>';
    const f = checkContainerNestingDepth(html);
    expect(f).toHaveLength(1); // pass-through <p> doesn't reset the count
  });
});

describe("lintTaste — container-nesting-depth wired", () => {
  it("registers the check as a warning and never bumps errorCount", () => {
    const html = '<div class="card"><div class="panel"><div class="border">x</div></div></div>';
    const r = lintTaste(html);
    const finding = r.findings.find((f) => f.checkId === "container-nesting-depth");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
    expect(r.warningCount).toBeGreaterThanOrEqual(1);
  });

  it("a clean document trips no container-nesting-depth finding", () => {
    const r = lintTaste('<main><h1>Title</h1><p class="prose">Body copy.</p></main>');
    expect(r.findings.some((f) => f.checkId === "container-nesting-depth")).toBe(false);
  });
});
