import { describe, expect, it } from "vitest";
import {
  generatePalette,
  contrastRatio,
  classifyContrast,
  relativeLuminance,
  STOPS,
} from "../src/core/color-scale.js";

describe("generatePalette", () => {
  const scale = generatePalette("#3b82f6");

  it("produces exactly 11 stops", () => {
    expect(Object.keys(scale.shades)).toHaveLength(11);
    expect(Object.keys(scale.contrast)).toHaveLength(11);
  });

  it("all expected stop keys are present", () => {
    for (const stop of STOPS) {
      expect(scale.shades[String(stop)]).toBeDefined();
    }
  });

  it("baseHex is uppercased input", () => {
    expect(scale.baseHex).toBe("#3B82F6");
  });

  it("anchorStop is a valid stop", () => {
    expect(STOPS).toContain(scale.anchorStop);
  });

  it("anchor stop hex matches input color (within rounding)", () => {
    const anchorHex = scale.shades[String(scale.anchorStop)];
    expect(anchorHex).toBeDefined();
    // The anchor stop is re-derived from the base OKLCH, so it should be very close
    // Allow ±2 per channel due to round-trip OKLCH→hex rounding
    const toChannels = (h: string) => {
      const s = h!.replace("#", "");
      return [
        parseInt(s.slice(0, 2), 16),
        parseInt(s.slice(2, 4), 16),
        parseInt(s.slice(4, 6), 16),
      ];
    };
    const orig = toChannels("#3B82F6");
    const anchor = toChannels(anchorHex!);
    expect(Math.abs((orig[0] ?? 0) - (anchor[0] ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((orig[1] ?? 0) - (anchor[1] ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((orig[2] ?? 0) - (anchor[2] ?? 0))).toBeLessThanOrEqual(2);
  });

  it("lighter stops have higher contrast vs white than darker stops", () => {
    // stop 50 should have lower contrast vs white (lighter) than stop 900
    const c50 = scale.contrast["50"] ?? 0;
    const c900 = scale.contrast["900"] ?? 0;
    expect(c900).toBeGreaterThan(c50);
  });

  it("all contrast values are numbers >= 1", () => {
    for (const stop of STOPS) {
      const c = scale.contrast[String(stop)] ?? 0;
      expect(c).toBeGreaterThanOrEqual(1);
    }
  });

  it("all hex values are valid #RRGGBB strings", () => {
    for (const stop of STOPS) {
      const hex = scale.shades[String(stop)] ?? "";
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("is deterministic — two calls produce identical output", () => {
    const a = generatePalette("#3b82f6");
    const b = generatePalette("#3b82f6");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  // Golden-value test: #3b82f6 OKLCH lightness ≈ 0.623, closest to TARGET_LIGHTNESS[400]=0.64
  it("golden: #3b82f6 anchors at stop 400", () => {
    expect(scale.anchorStop).toBe(400);
  });
});

describe("contrastRatio", () => {
  it("black vs white ≈ 21", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("white vs white = 1", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 4);
  });

  it("is symmetric", () => {
    const a = contrastRatio("#3B82F6", "#FFFFFF");
    const b = contrastRatio("#FFFFFF", "#3B82F6");
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("relativeLuminance", () => {
  it("white = 1", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 4);
  });

  it("black = 0", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 4);
  });
});

describe("classifyContrast", () => {
  it("7 → AAA", () => expect(classifyContrast(7)).toBe("AAA"));
  it("7.1 → AAA", () => expect(classifyContrast(7.1)).toBe("AAA"));
  it("4.5 → AA", () => expect(classifyContrast(4.5)).toBe("AA"));
  it("4.9 → AA", () => expect(classifyContrast(4.9)).toBe("AA"));
  it("3.0 → AA-large", () => expect(classifyContrast(3.0)).toBe("AA-large"));
  it("3.5 → AA-large", () => expect(classifyContrast(3.5)).toBe("AA-large"));
  it("2.9 → fail", () => expect(classifyContrast(2.9)).toBe("fail"));
  it("1 → fail", () => expect(classifyContrast(1)).toBe("fail"));
});
