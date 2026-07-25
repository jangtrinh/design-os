/**
 * Tenant-contract linter — tests/tenant-lint.test.ts
 * Fixtures cover: a clean section (0 findings), a window.scrollTo section (1 error),
 * a transform-ancestor page (1 sticky-killer error), and a legal descendant
 * `.scrollTo()` call (0 findings — the false-positive tenant-lint.mjs already fixed).
 * Also covers external-file resolution parity with the original tenant-lint.mjs
 * (a local <script src>/<link href> must be followed and scanned when `baseDir`
 * is supplied — this is where the shipped section engine's real code lives).
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintTenant } from "../src/core/tenant-lint.js";

describe("lintTenant — clean section", () => {
  it("finds nothing in a Tenant-compliant section", () => {
    const html = `
      <section class="scrub">
        <div class="scrub__stage"></div>
        <script>
          function tick() {
            var rect = document.getElementById('scrub-a').getBoundingClientRect();
            var p = -(rect.top) / (rect.height - window.innerHeight);
          }
        </script>
        <style>
          .scrub { position: relative; isolation: isolate; }
          .scrub__stage { position: sticky; top: 0; height: 100dvh; }
        </style>
      </section>
    `;
    const r = lintTenant(html);
    expect(r.findings).toHaveLength(0);
    expect(r.errorCount).toBe(0);
  });
});

describe("lintTenant — window.scrollTo section-body violation", () => {
  it("flags a page-level window.scrollTo call as a single error", () => {
    const html = `
      <section class="scrub">
        <script>
          function jumpToTop() { window.scrollTo(0, 0); }
        </script>
      </section>
    `;
    const r = lintTenant(html);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.rule).toBe("window-scrollto");
    expect(r.findings[0]?.severity).toBe("error");
    expect(r.errorCount).toBe(1);
  });
});

describe("lintTenant — sticky-killer ancestor", () => {
  it("flags a transform on an ancestor of a .scrub element as a single error", () => {
    const html = `
      <div style="transform: scale(1.02)">
        <div class="scrub"></div>
      </div>
    `;
    const r = lintTenant(html);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.rule).toBe("sticky-killer-ancestor");
    expect(r.findings[0]?.detail).toContain("transform");
    expect(r.errorCount).toBe(1);
  });
});

describe("lintTenant — legal descendant .scrollTo() is not a violation", () => {
  it("does not flag a scrollTo() call on the section's own subtree element", () => {
    const html = `
      <section class="scrub">
        <script>
          function scrollCarousel() {
            document.querySelector('.carousel').scrollTo(120, 0);
          }
        </script>
      </section>
    `;
    const r = lintTenant(html);
    expect(r.findings).toHaveLength(0);
    expect(r.errorCount).toBe(0);
  });
});

describe("lintTenant — additional section-body + CSS rules", () => {
  it("flags document.body.style.height mutation", () => {
    const r = lintTenant(`<script>document.body.style.height = "5000px";</script>`);
    expect(r.findings.map((f) => f.rule)).toEqual(["body-height-write"]);
  });

  it("flags window.scrollY reads", () => {
    const r = lintTenant(`<script>var y = window.scrollY;</script>`);
    expect(r.findings.map((f) => f.rule)).toEqual(["window-scrolly"]);
  });

  it("flags a :root {} block declaring a --scrub-* variable", () => {
    const r = lintTenant(`<style>:root { --scrub-progress: 0.5; }</style>`);
    expect(r.findings.map((f) => f.rule)).toEqual(["root-css-write"]);
  });

  it("does not flag a host page's own :root block (no --scrub-* declaration)", () => {
    const r = lintTenant(`<style>:root { --brand-color: #123; }</style>`);
    expect(r.findings).toHaveLength(0);
  });

  it("flags position:fixed inside a .scrub-scoped CSS rule", () => {
    const r = lintTenant(`<style>.scrub .thing { position: fixed; }</style>`);
    expect(r.findings.map((f) => f.rule)).toEqual(["position-fixed-css"]);
  });

  it("does not follow an external <script src> when no baseDir is given (pure in-memory string)", () => {
    const r = lintTenant(`<script src="scrub-section.js"></script>`);
    expect(r.findings).toHaveLength(0);
  });
});

describe("lintTenant — external-file resolution (baseDir), parity with tenant-lint.mjs", () => {
  function tmpPage(): string {
    return mkdtempSync(join(tmpdir(), "tenant-lint-ext-"));
  }

  it("follows a local <script src> and flags a violation living in the external file", () => {
    const dir = tmpPage();
    writeFileSync(join(dir, "bad.js"), `function jumpToTop() { window.scrollTo(0, 0); }\n`, "utf8");
    const html = `<section class="scrub"><script src="bad.js"></script></section>`;
    const r = lintTenant(html, { baseDir: dir });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.rule).toBe("window-scrollto");
    expect(r.errorCount).toBe(1);
  });

  it("follows a local <link rel=stylesheet href> and flags a violation living in the external file", () => {
    const dir = tmpPage();
    writeFileSync(join(dir, "bad.css"), `:root { --scrub-progress: 0.5; }\n`, "utf8");
    const html = `<link rel="stylesheet" href="bad.css">`;
    const r = lintTenant(html, { baseDir: dir });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.rule).toBe("root-css-write");
  });

  it("a clean external script + stylesheet produce 0 findings", () => {
    const dir = tmpPage();
    writeFileSync(join(dir, "engine.js"), `function tick() { return performance.now(); }\n`, "utf8");
    writeFileSync(join(dir, "engine.css"), `.scrub { position: relative; }\n`, "utf8");
    const html = [
      `<link rel="stylesheet" href="engine.css">`,
      `<section class="scrub"><script src="engine.js"></script></section>`,
    ].join("\n");
    const r = lintTenant(html, { baseDir: dir });
    expect(r.findings).toHaveLength(0);
    expect(r.errorCount).toBe(0);
  });

  it("skips an absolute http(s):// <script src> — external, not ours to lint", () => {
    const dir = tmpPage();
    const html = `<script src="https://cdn.example.com/scrollhack.js"></script>`;
    const r = lintTenant(html, { baseDir: dir });
    expect(r.findings).toHaveLength(0);
  });

  it("skips a protocol-relative // <link href> — external, not ours to lint", () => {
    const dir = tmpPage();
    const html = `<link rel="stylesheet" href="//cdn.example.com/bad.css">`;
    const r = lintTenant(html, { baseDir: dir });
    expect(r.findings).toHaveLength(0);
  });

  it("silently skips a linked file that does not exist on disk (no throw)", () => {
    const dir = tmpPage();
    const html = `<script src="does-not-exist.js"></script>`;
    expect(() => lintTenant(html, { baseDir: dir })).not.toThrow();
    expect(lintTenant(html, { baseDir: dir }).findings).toHaveLength(0);
  });

  it("the actual vendored engine (templates/tenant/) is Tenant-clean end-to-end", () => {
    // Proves parity against the SHIPPED artifact, not a synthetic fixture or an
    // untracked spec directory (that directory is not committed, so a test pointed
    // at it would pass vacuously on a fresh clone — lintTenant silently skips a
    // missing linked file). templates/tenant/ is the one thing `ui tenant-scaffold`
    // actually emits, so that is what must be proven clean.
    const baseDir = join(process.cwd(), "templates/tenant");
    // Fail LOUDLY (not vacuously) if the engine is missing/renamed — a silent skip
    // must never read as a pass (repo scar: "a test can assert its own filesystem path").
    expect(existsSync(join(baseDir, "scrub-section.js"))).toBe(true);
    expect(existsSync(join(baseDir, "scrub-section.css"))).toBe(true);
    const html = `<link rel="stylesheet" href="scrub-section.css">\n<script src="scrub-section.js"></script>`;
    const r = lintTenant(html, { baseDir });
    expect(r.findings).toEqual([]);
  });
});
