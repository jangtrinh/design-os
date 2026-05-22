import { describe, expect, it } from "vitest";
import {
  hexToOKLCH,
  oklchToHex,
  gamutClamp,
  ColorError,
} from "../src/core/color-convert.js";

describe("hexToOKLCH", () => {
  it("white → L≈1, C≈0", () => {
    const { l, c } = hexToOKLCH("#FFFFFF");
    expect(l).toBeCloseTo(1, 2);
    expect(c).toBeCloseTo(0, 2);
  });

  it("black → L≈0, C≈0", () => {
    const { l, c } = hexToOKLCH("#000000");
    expect(l).toBeCloseTo(0, 2);
    expect(c).toBeCloseTo(0, 2);
  });

  it("expands 3-char hex #fff correctly", () => {
    const a = hexToOKLCH("#fff");
    const b = hexToOKLCH("#ffffff");
    expect(a.l).toBeCloseTo(b.l, 5);
    expect(a.c).toBeCloseTo(b.c, 5);
  });

  it("is case-insensitive", () => {
    const a = hexToOKLCH("#3b82f6");
    const b = hexToOKLCH("#3B82F6");
    expect(a.l).toBeCloseTo(b.l, 6);
  });

  it("throws ColorError for malformed hex: #xyz", () => {
    expect(() => hexToOKLCH("#xyz")).toThrow(ColorError);
  });

  it("throws ColorError for empty string", () => {
    expect(() => hexToOKLCH("")).toThrow(ColorError);
  });

  it("throws ColorError for short hex #12 (only 2 digits)", () => {
    expect(() => hexToOKLCH("#12")).toThrow(ColorError);
  });

  it("throws ColorError for non-hex input 'blue'", () => {
    expect(() => hexToOKLCH("blue")).toThrow(ColorError);
  });
});

describe("oklchToHex round-trip", () => {
  const CASES = ["#3B82F6", "#EF4444", "#22C55E", "#F59E0B", "#8B5CF6"];

  for (const hex of CASES) {
    it(`round-trips ${hex} within 1 LSB`, () => {
      const oklch = hexToOKLCH(hex);
      const back = oklchToHex(oklch.l, oklch.c, oklch.h);
      // Allow ±1 on each channel due to rounding
      const toChannels = (h: string) => {
        const s = h.replace("#", "");
        return [
          parseInt(s.slice(0, 2), 16),
          parseInt(s.slice(2, 4), 16),
          parseInt(s.slice(4, 6), 16),
        ];
      };
      const orig = toChannels(hex);
      const result = toChannels(back);
      expect(Math.abs((orig[0] ?? 0) - (result[0] ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((orig[1] ?? 0) - (result[1] ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((orig[2] ?? 0) - (result[2] ?? 0))).toBeLessThanOrEqual(1);
    });
  }
});

describe("gamutClamp", () => {
  it("returns identity for in-gamut colors", () => {
    const oklch = hexToOKLCH("#3B82F6");
    const clamped = gamutClamp(oklch.l, oklch.c, oklch.h);
    expect(clamped.l).toBeCloseTo(oklch.l, 5);
    expect(clamped.h).toBeCloseTo(oklch.h, 5);
  });

  it("reduces chroma for out-of-gamut color while preserving L and H", () => {
    // Force an out-of-gamut OKLCH: high chroma
    const l = 0.7;
    const c = 0.5; // definitely out of sRGB for most hues
    const h = 30;
    const clamped = gamutClamp(l, c, h);
    expect(clamped.l).toBeCloseTo(l, 5);
    expect(clamped.h).toBeCloseTo(h, 5);
    expect(clamped.c).toBeLessThanOrEqual(c);
  });

  it("returns zero chroma for achromatic input", () => {
    const r = gamutClamp(0.5, 0, 0);
    expect(r.c).toBe(0);
  });
});
