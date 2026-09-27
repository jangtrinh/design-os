/**
 * token-coverage.ts core — the classify-and-aggregate algorithm, pure. C1
 * negative controls: all-raw-hex → 0, tokens-only → 1.0, literal-equal-to-
 * token-value counts as token.
 */
import { describe, expect, it } from "vitest";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { buildTokenValueIndex, classifyDeclaration } from "../src/core/token-coverage-classify.js";
import { extractDeclarations } from "../src/core/token-coverage-extract.js";
import { scoreCssSources } from "../src/core/token-coverage.js";

const TOKEN_TREE = parseTokenFile({
  color: { primary: { $value: "#3b82f6", $type: "color" } },
  space: { md: { $value: "16px", $type: "dimension" } },
  "font-family": { body: { $value: "Inter, sans-serif", $type: "fontFamily" } },
});
const RESOLVED = resolveTokens(TOKEN_TREE);
const IDX = buildTokenValueIndex(RESOLVED);

describe("token-coverage-classify — classifyDeclaration", () => {
  it("var(--declared-token) → token", () => {
    const [decl] = extractDeclarations(".card { color: var(--color-primary); }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("token");
  });

  it("raw hex not matching any token → raw", () => {
    const [decl] = extractDeclarations(".card { color: #ff0000; }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("raw");
  });

  it("literal equal to a token's resolved value → token (C1)", () => {
    const [decl] = extractDeclarations(".card { color: #3b82f6; }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("token");
  });

  it("calc() → derived, never raw", () => {
    const [decl] = extractDeclarations(".card { padding: calc(1rem + 8px); }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("derived");
  });

  it("percentage border-radius → derived", () => {
    const [decl] = extractDeclarations(".card { border-radius: 50%; }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("derived");
  });

  it("relative unit (rem) spacing → derived", () => {
    const [decl] = extractDeclarations(".card { margin: 1.5rem; }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("derived");
  });

  it("hsl() with a percentage stays a color classification, not derived", () => {
    const [decl] = extractDeclarations(".card { color: hsl(0, 100%, 50%); }", false);
    expect(classifyDeclaration(decl!, IDX)).toBe("raw");
  });
});

describe("token-coverage-extract — decl-block stripping", () => {
  it(":root token literals are excluded from component declarations", () => {
    const decls = extractDeclarations(":root { --brand: #3b82f6; } .card { color: var(--brand); }", false);
    expect(decls).toHaveLength(1);
    expect(decls[0]?.value).toBe("var(--brand)");
  });
});

describe("token-coverage — scoreCssSources (C1 negative controls)", () => {
  it("all raw hex → coverage 0", () => {
    const r = scoreCssSources(
      [{ text: ".a { color: #111111; background: #222222; }", isHtmlSource: false }],
      RESOLVED,
    );
    expect(r.overall.coverage).toBe(0);
  });

  it("only tokens → coverage 1.0", () => {
    const r = scoreCssSources(
      [{ text: ".a { color: var(--color-primary); padding: var(--space-md); }", isHtmlSource: false }],
      RESOLVED,
    );
    expect(r.overall.coverage).toBe(1);
  });

  it("empty CSS → vacuous coverage 1 (nothing to fail on)", () => {
    const r = scoreCssSources([{ text: ".a { display: flex; }", isHtmlSource: false }], RESOLVED);
    expect(r.overall.coverage).toBe(1);
    expect(r.declarationCount).toBe(0);
  });

  it("linked stylesheet + inline <style> both contribute declarations", () => {
    const r = scoreCssSources(
      [
        { text: "<html><head><style>.a { color: var(--color-primary); }</style></head></html>", isHtmlSource: true },
        { text: ".b { color: #ff0000; }", isHtmlSource: false },
      ],
      RESOLVED,
    );
    expect(r.declarationCount).toBe(2);
    expect(r.categories.color.token).toBe(1);
    expect(r.categories.color.raw).toBe(1);
  });
});
