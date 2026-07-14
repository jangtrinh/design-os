/**
 * `taste-dhash` — 64-bit PNG difference-hash + Hamming distance.
 * Fixtures are synthesized with png-codec's encodePng (no fixture files on disk).
 */
import { describe, expect, it } from "vitest";
import { encodePng } from "../src/core/png-codec.js";
import type { RgbaImage } from "../src/core/png-codec.js";
import { dhashPng, hamming } from "../src/core/taste-dhash.js";

/** A modular grayscale gradient with plenty of local variation (optionally inverted). */
function gradientImage(width: number, height: number, invert = false): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v = (x * 23 + y * 11) % 256;
      if (invert) v = 255 - v;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("dhashPng", () => {
  it("identical png distance 0", () => {
    const bufA = encodePng(gradientImage(20, 16, false));
    const bufB = encodePng(gradientImage(20, 16, false)); // independently built, identical content
    const hA = dhashPng(bufA), hB = dhashPng(bufB);
    expect(hA).toBeDefined();
    expect(hA).toHaveLength(16);
    expect(hamming(hA ?? "", hB ?? "")).toBe(0);
  });

  it("distinct png distance >6", () => {
    const hA = dhashPng(encodePng(gradientImage(20, 16, false)));
    const hB = dhashPng(encodePng(gradientImage(20, 16, true))); // full tonal inversion flips nearly every bit
    expect(hA).toBeDefined();
    expect(hB).toBeDefined();
    expect(hamming(hA ?? "", hB ?? "")).toBeGreaterThan(6);
  });

  it("non-png undefined", () => {
    expect(dhashPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeUndefined();
    expect(dhashPng(new TextEncoder().encode("not a png at all, just text bytes"))).toBeUndefined();
  });
});
