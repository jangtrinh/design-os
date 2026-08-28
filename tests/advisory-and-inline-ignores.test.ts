/**
 * Phase 04's paired test: the third severity tier and the in-file waiver.
 *
 * The tier's danger is arithmetic, not typing. Thirteen call sites derived
 * `warningCount` by subtracting `errorCount` from the total, which buckets
 * advisory into warnings with no type error to catch it. So the contract under
 * test is: `countBySeverity` is the ONE counter, `warningCount` never absorbs
 * advisory, and the exit code keys off errors alone.
 *
 * The waiver's danger is silent suppression. So: a reason is mandatory, a
 * directive without one is reported malformed rather than honoured, and every
 * waived finding leaves a record.
 */
import { describe, expect, it } from "vitest";
import { countBySeverity, failing } from "../src/core/finding-schema.js";
import type { FloorSeverity } from "../src/core/finding-schema.js";
import { scanInlineIgnores, applyInlineIgnores } from "../src/core/inline-ignores.js";
import { lintA11y } from "../src/core/a11y-lint.js";
import { lintTaste } from "../src/core/taste-lint.js";

const f = (severity: FloorSeverity, checkId = "x", line?: number) =>
  ({ checkId, severity, message: "m", line });

describe("advisory severity", () => {
  it("counts the three tiers separately and never folds advisory into warnings", () => {
    const counts = countBySeverity([
      f("error"), f("error"), f("warning"), f("advisory"), f("advisory"), f("advisory"),
    ]);
    expect(counts).toEqual({ errorCount: 2, warningCount: 1, advisoryCount: 3 });
  });

  it("reports warningCount 0 for an advisory-only result — the regression the tier risks", () => {
    const counts = countBySeverity([f("advisory"), f("advisory")]);
    expect(counts.warningCount).toBe(0);
    expect(counts.advisoryCount).toBe(2);
  });

  it("keys failure on errors alone, so advisory can never change an exit code", () => {
    expect(failing([f("advisory"), f("warning")])).toHaveLength(0);
    expect(failing([f("advisory"), f("error")])).toHaveLength(1);
  });

  it("leaves existing two-tier families counting exactly as before", () => {
    // A document with real a11y and taste violations, no advisory findings in
    // either family yet: the counts must be byte-identical to the old behaviour.
    const html = `<!doctype html><html><head><title>t</title></head>
      <body><img src="a.png"><style>.a{transition:all .3s linear}</style></body></html>`;
    const a11y = lintA11y(html);
    expect(a11y.errorCount + a11y.warningCount).toBe(a11y.findings.length);
    expect(a11y.advisoryCount).toBe(0);
    const taste = lintTaste(html);
    expect(taste.errorCount + taste.warningCount).toBe(taste.findings.length);
  });
});

describe("inline ignores", () => {
  it("parses all three scopes across HTML, CSS and JS comment syntaxes", () => {
    const src = [
      `<!-- design-os-disable side-tab -- exported brand doc -->`,
      `.brand { font-family: Inter } /* design-os-disable-line overused-font -- client mandate */`,
      `// design-os-disable-next-line pulsing-dot -- genuinely live data`,
      `<div class="dot"></div>`,
    ].join("\n");
    const { ignores, malformed } = scanInlineIgnores(src);
    expect(malformed).toEqual([]);
    expect(ignores).toHaveLength(3);
    expect(ignores[0]).toMatchObject({ checkIds: ["side-tab"], appliesToLine: undefined });
    expect(ignores[1]).toMatchObject({ checkIds: ["overused-font"], appliesToLine: 2 });
    expect(ignores[2]).toMatchObject({ checkIds: ["pulsing-dot"], appliesToLine: 4 });
  });

  it("REJECTS a directive with no reason instead of honouring it", () => {
    const { ignores, malformed } = scanInlineIgnores(`<!-- design-os-disable side-tab -->`);
    expect(ignores).toEqual([]);
    expect(malformed).toEqual([
      { declaredLine: 1, raw: `<!-- design-os-disable side-tab -->`, problem: "missing-reason" },
    ]);
  });

  it("treats a bare directive or * as every rule", () => {
    const { ignores } = scanInlineIgnores(`// design-os-disable -- vendored file`);
    expect(ignores[0]?.checkIds).toEqual([]);
    const star = scanInlineIgnores(`// design-os-disable-line * -- vendored`);
    expect(star.ignores[0]?.checkIds).toEqual([]);
  });

  it("waives only the scoped line, and accounts for what it waived", () => {
    const scan = scanInlineIgnores(`/* design-os-disable-line side-tab -- intentional */`);
    const { kept, waived } = applyInlineIgnores(
      [f("error", "side-tab", 1), f("error", "side-tab", 2), f("error", "gradient-text", 1)],
      scan,
    );
    expect(kept.map((k) => `${k.checkId}:${k.line}`)).toEqual(["side-tab:2", "gradient-text:1"]);
    expect(waived).toEqual([{ checkId: "side-tab", line: 1, reason: "intentional" }]);
  });

  it("waives the FOLLOWING line for -next-line, not the line after that", () => {
    const scan = scanInlineIgnores(`\n// design-os-disable-next-line side-tab -- ok\n`);
    const { kept } = applyInlineIgnores(
      [f("error", "side-tab", 2), f("error", "side-tab", 3), f("error", "side-tab", 4)],
      scan,
    );
    expect(kept.map((k) => k.line)).toEqual([2, 4]);
  });

  it("waives the whole file for the unscoped form", () => {
    const scan = scanInlineIgnores(`<!-- design-os-disable overused-font -- brand doc -->`);
    const { kept, waived } = applyInlineIgnores(
      [f("error", "overused-font", 1), f("error", "overused-font", 99), f("error", "side-tab", 1)],
      scan,
    );
    expect(kept.map((k) => k.checkId)).toEqual(["side-tab"]);
    expect(waived).toHaveLength(2);
  });

  it("accepts a comma-separated id list", () => {
    const scan = scanInlineIgnores(`/* design-os-disable side-tab,gradient-text -- brand */`);
    expect(scan.ignores[0]?.checkIds).toEqual(["side-tab", "gradient-text"]);
  });
});
