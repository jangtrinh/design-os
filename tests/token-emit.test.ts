import { describe, expect, it } from "vitest";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { emitCss, emitTailwind, emitFigma } from "../src/core/token-emit.js";

function resolveFixture(json: unknown) {
  return resolveTokens(parseTokenFile(json));
}

const SIMPLE = {
  blue: { "500": { $value: "#3b82f6", $type: "color" } },
  space: { "4": { $value: "16px", $type: "dimension" } },
  color: { primary: { $value: "{blue.500}", $type: "color" } },
};

describe("emitCss", () => {
  const map = resolveFixture(SIMPLE);
  const css = emitCss(map);

  it("starts with :root {", () => {
    expect(css.trimStart()).toMatch(/^:root \{/);
  });

  it("ends with }", () => {
    expect(css.trimEnd()).toMatch(/\}$/);
  });

  it("contains --color-primary", () => {
    expect(css).toContain("--color-primary:");
  });

  it("resolved semantic alias has literal hex value", () => {
    expect(css).toContain("--color-primary: #3b82f6");
  });

  it("converts dots to hyphens in var names", () => {
    expect(css).toContain("--blue-500:");
    expect(css).toContain("--space-4:");
  });

  it("is byte-stable across two calls", () => {
    expect(emitCss(map)).toBe(emitCss(map));
  });
});

describe("emitTailwind", () => {
  const map = resolveFixture(SIMPLE);
  const tw = emitTailwind(map);

  it("starts with @theme {", () => {
    expect(tw.trimStart()).toMatch(/^@theme \{/);
  });

  it("contains --color-primary", () => {
    expect(tw).toContain("--color-primary:");
  });

  it("is byte-stable across two calls", () => {
    expect(emitTailwind(map)).toBe(emitTailwind(map));
  });
});

describe("emitFigma", () => {
  const map = resolveFixture(SIMPLE);
  const figmaStr = emitFigma(map);

  it("is valid JSON", () => {
    expect(() => JSON.parse(figmaStr)).not.toThrow();
  });

  it("has two-level nesting with type and value", () => {
    const obj = JSON.parse(figmaStr) as Record<string, Record<string, { type: string; value: unknown }>>;
    expect(obj["blue"]?.["500"]?.type).toBe("color");
    expect(obj["blue"]?.["500"]?.value).toBe("#3b82f6");
  });

  it("resolved color.primary has literal hex value (not alias)", () => {
    const obj = JSON.parse(figmaStr) as Record<string, Record<string, { value: unknown }>>;
    expect(obj["color"]?.["primary"]?.value).toBe("#3b82f6");
  });

  it("is byte-stable across two calls", () => {
    expect(emitFigma(map)).toBe(emitFigma(map));
  });
});

describe("composite token expansion in CSS", () => {
  it("typography token expands to per-member CSS properties", () => {
    const json = {
      text: {
        body: {
          $value: { fontFamily: "Inter", fontSize: "16px", fontWeight: 400 },
          $type: "typography",
        },
      },
    };
    const map = resolveFixture(json);
    const css = emitCss(map);
    expect(css).toContain("--text-body-font-family");
    expect(css).toContain("--text-body-font-size");
    expect(css).toContain("--text-body-font-weight");
  });
});

describe("number-typed token emission", () => {
  const NUM_JSON = {
    leading: { tight: { $value: 1.25, $type: "number" } },
  };

  it("emitCss emits bare number as custom property value", () => {
    const map = resolveFixture(NUM_JSON);
    const css = emitCss(map);
    expect(css).toContain("--leading-tight: 1.25;");
  });

  it("emitTailwind emits bare number in @theme block", () => {
    const map = resolveFixture(NUM_JSON);
    const tw = emitTailwind(map);
    expect(tw).toContain("--leading-tight: 1.25;");
  });

  it("emitFigma emits type:number and numeric value", () => {
    const map = resolveFixture(NUM_JSON);
    const obj = JSON.parse(emitFigma(map)) as Record<string, Record<string, { type: string; value: unknown }>>;
    expect(obj["leading"]?.["tight"]?.type).toBe("number");
    expect(obj["leading"]?.["tight"]?.value).toBe(1.25);
  });
});
