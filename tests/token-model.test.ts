import { describe, expect, it } from "vitest";
import { parseTokenFile, isAlias, TokenError } from "../src/core/token-model.js";

describe("isAlias", () => {
  it("'{blue.500}' is an alias", () => expect(isAlias("{blue.500}")).toBe(true));
  it("'{color.primary}' is an alias", () => expect(isAlias("{color.primary}")).toBe(true));
  it("'#fff' is not an alias", () => expect(isAlias("#fff")).toBe(false));
  it("'16px' is not an alias", () => expect(isAlias("16px")).toBe(false));
  it("number is not an alias", () => expect(isAlias(42)).toBe(false));
  it("plain string without braces is not an alias", () => expect(isAlias("blue.500")).toBe(false));
});

describe("parseTokenFile", () => {
  it("accepts a valid two-tier token file", () => {
    const json = {
      blue: { "500": { $value: "#3b82f6", $type: "color" } },
      space: { "4": { $value: "16px", $type: "dimension" } },
    };
    expect(() => parseTokenFile(json)).not.toThrow();
    const tree = parseTokenFile(json);
    expect(tree["blue"]?.["500"]?.$type).toBe("color");
  });

  it("accepts a semantic alias token", () => {
    const json = {
      color: { primary: { $value: "{blue.500}", $type: "color" } },
    };
    expect(() => parseTokenFile(json)).not.toThrow();
  });

  it("throws BAD_JSON for non-object input (array)", () => {
    expect(() => parseTokenFile([1, 2, 3])).toThrow(TokenError);
    try { parseTokenFile([1, 2, 3]); } catch (e) {
      expect((e as TokenError).code).toBe("BAD_JSON");
    }
  });

  it("throws BAD_JSON for null", () => {
    expect(() => parseTokenFile(null)).toThrow(TokenError);
  });

  it("throws BAD_JSON for string input", () => {
    expect(() => parseTokenFile("not an object")).toThrow(TokenError);
  });

  it("throws BAD_TOKEN for token missing $type", () => {
    const json = { color: { primary: { $value: "#fff" } } };
    try {
      parseTokenFile(json);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("BAD_TOKEN");
    }
  });

  it("throws BAD_TOKEN for token missing $value", () => {
    const json = { color: { primary: { $type: "color" } } };
    try {
      parseTokenFile(json);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("BAD_TOKEN");
    }
  });

  it("throws BAD_TOKEN for unknown $type", () => {
    const json = { color: { primary: { $value: "#fff", $type: "gradient" } } };
    try {
      parseTokenFile(json);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TokenError).code).toBe("BAD_TOKEN");
    }
  });

  it("preserves $description when present", () => {
    const json = {
      color: {
        primary: { $value: "#3b82f6", $type: "color", $description: "brand blue" },
      },
    };
    const tree = parseTokenFile(json);
    expect(tree["color"]?.["primary"]?.$description).toBe("brand blue");
  });

  it("accepts a number-typed token with a numeric $value", () => {
    const json = {
      leading: { tight: { $value: 1.25, $type: "number" } },
    };
    expect(() => parseTokenFile(json)).not.toThrow();
    const tree = parseTokenFile(json);
    expect(tree["leading"]?.["tight"]?.$type).toBe("number");
    expect(tree["leading"]?.["tight"]?.$value).toBe(1.25);
  });

  it("accepts a number-typed token with an alias $value", () => {
    const json = {
      leading: { tight: { $value: 1.25, $type: "number" } },
      text:    { body: { $value: "{leading.tight}", $type: "number" } },
    };
    expect(() => parseTokenFile(json)).not.toThrow();
  });
});
