import { describe, expect, it } from "vitest";
import { parseTokenFile, TokenError } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";

function makeTree(json: unknown) {
  return parseTokenFile(json);
}

describe("resolveTokens — happy paths", () => {
  it("resolves a direct color alias", () => {
    const tree = makeTree({
      blue: { "500": { $value: "#3b82f6", $type: "color" } },
      color: { primary: { $value: "{blue.500}", $type: "color" } },
    });
    const map = resolveTokens(tree);
    const primary = map.find((t) => t.path === "color.primary");
    expect(primary).toBeDefined();
    expect(primary?.value).toBe("#3b82f6");
  });

  it("resolves a two-hop alias chain", () => {
    const tree = makeTree({
      blue: { "500": { $value: "#3b82f6", $type: "color" } },
      color: { primary: { $value: "{blue.500}", $type: "color" } },
      button: { bg: { $value: "{color.primary}", $type: "color" } },
    });
    const map = resolveTokens(tree);
    const bg = map.find((t) => t.path === "button.bg");
    expect(bg?.value).toBe("#3b82f6");
  });

  it("leaves literal primitives unchanged", () => {
    const tree = makeTree({
      blue: { "500": { $value: "#3b82f6", $type: "color" } },
    });
    const map = resolveTokens(tree);
    const token = map.find((t) => t.path === "blue.500");
    expect(token?.value).toBe("#3b82f6");
  });

  it("resolves composite typography token members", () => {
    const tree = makeTree({
      "font-size": { md: { $value: "16px", $type: "dimension" } },
      "font-family": { sans: { $value: "Inter, sans-serif", $type: "fontFamily" } },
      text: {
        body: {
          $value: { fontSize: "{font-size.md}", fontFamily: "Arial" },
          $type: "typography",
        },
      },
    });
    const map = resolveTokens(tree);
    const body = map.find((t) => t.path === "text.body");
    expect(body).toBeDefined();
    const val = body?.value as Record<string, unknown>;
    expect(val?.["fontSize"]).toBe("16px");
    expect(val?.["fontFamily"]).toBe("Arial");
  });

  it("resolving same input twice produces identical ResolvedMap", () => {
    const json = {
      blue: { "500": { $value: "#3b82f6", $type: "color" } },
      color: { primary: { $value: "{blue.500}", $type: "color" } },
    };
    const a = resolveTokens(makeTree(json));
    const b = resolveTokens(makeTree(json));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("resolves a number-typed primitive to its numeric value", () => {
    const tree = makeTree({
      leading: { tight: { $value: 1.25, $type: "number" } },
    });
    const map = resolveTokens(tree);
    const token = map.find((t) => t.path === "leading.tight");
    expect(token?.type).toBe("number");
    expect(token?.value).toBe(1.25);
  });

  it("resolves a typography lineHeight member that aliases a number token", () => {
    const tree = makeTree({
      leading: { normal: { $value: 1.5, $type: "number" } },
      text: {
        body: {
          $value: {
            fontFamily: "Inter",
            fontSize: "16px",
            fontWeight: 400,
            lineHeight: "{leading.normal}",
          },
          $type: "typography",
        },
      },
    });
    const map = resolveTokens(tree);
    const body = map.find((t) => t.path === "text.body");
    const val = body?.value as Record<string, unknown>;
    expect(val?.["lineHeight"]).toBe(1.5);
  });
});

describe("resolveTokens — error paths", () => {
  it("throws ALIAS_CYCLE for a → b → a", () => {
    const tree = makeTree({
      color: {
        a: { $value: "{color.b}", $type: "color" },
        b: { $value: "{color.a}", $type: "color" },
      },
    });
    try {
      resolveTokens(tree);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("ALIAS_CYCLE");
    }
  });

  it("throws DANGLING_ALIAS for a missing target", () => {
    const tree = makeTree({
      color: { primary: { $value: "{color.acccent}", $type: "color" } },
    });
    try {
      resolveTokens(tree);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("DANGLING_ALIAS");
    }
  });

  it("throws TYPE_MISMATCH when color aliases a dimension", () => {
    const tree = makeTree({
      space: { "4": { $value: "16px", $type: "dimension" } },
      color: { primary: { $value: "{space.4}", $type: "color" } },
    });
    try {
      resolveTokens(tree);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("TYPE_MISMATCH");
    }
  });

  it("throws TYPE_MISMATCH when a typography member's alias points at a wrong-typed token", () => {
    // fontSize expects a dimension token; aliasing a color primitive is invalid
    const tree = makeTree({
      blue: { "500": { $value: "#3b82f6", $type: "color" } },
      text: {
        body: {
          $value: { fontFamily: "Inter", fontSize: "{blue.500}", fontWeight: 400, lineHeight: 1.5 },
          $type: "typography",
        },
      },
    });
    try {
      resolveTokens(tree);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("TYPE_MISMATCH");
    }
  });

  it("throws TYPE_MISMATCH when lineHeight aliases a dimension token instead of a number token", () => {
    // lineHeight requires a number token; a dimension token (e.g. "1.5rem") is not compatible
    const tree = makeTree({
      space: { "6": { $value: "1.5rem", $type: "dimension" } },
      text: {
        body: {
          $value: {
            fontFamily: "Inter",
            fontSize: "16px",
            fontWeight: 400,
            lineHeight: "{space.6}",
          },
          $type: "typography",
        },
      },
    });
    try {
      resolveTokens(tree);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("TYPE_MISMATCH");
    }
  });
});
