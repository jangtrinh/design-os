/**
 * 64-bit difference-hash (dHash) for PNG screenshots — a coarse perceptual
 * fingerprint used to flag likely near-duplicate ingests within a genre.
 * PNG-only (reuses png-codec.ts); any other/undecodable input yields
 * `undefined` rather than throwing, so ingest can still catalogue non-PNG
 * assets by sha256 alone.
 */
import { decodePng } from "./png-codec.js";

const DH_W = 9; // one wider than DH_H so each row yields 8 left/right comparisons
const DH_H = 8;

/** Nearest-neighbor downsample of a luma plane to DH_W×DH_H. */
function resizeLuma(luma: Float64Array, width: number, height: number): Float64Array {
  const out = new Float64Array(DH_W * DH_H);
  for (let y = 0; y < DH_H; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / DH_H));
    for (let x = 0; x < DH_W; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / DH_W));
      out[y * DH_W + x] = luma[sy * width + sx] ?? 0;
    }
  }
  return out;
}

/** Decode a PNG and return its 16-hex dHash, or undefined on any decode failure. */
export function dhashPng(buf: Uint8Array): string | undefined {
  let img;
  try {
    img = decodePng(buf);
  } catch {
    return undefined;
  }
  const { width, height, data } = img;
  if (width === 0 || height === 0) return undefined;

  const luma = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0, g = data[i * 4 + 1] ?? 0, b = data[i * 4 + 2] ?? 0;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const small = resizeLuma(luma, width, height);

  let bits = "";
  for (let y = 0; y < DH_H; y++) {
    for (let x = 0; x < DH_W - 1; x++) {
      bits += (small[y * DH_W + x] ?? 0) > (small[y * DH_W + x + 1] ?? 0) ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Bit-difference between two 16-hex dHash strings (0–64). */
export function hamming(h1: string, h2: string): number {
  let dist = 0;
  const len = Math.min(h1.length, h2.length);
  for (let i = 0; i < len; i++) {
    let x = parseInt(h1[i] ?? "0", 16) ^ parseInt(h2[i] ?? "0", 16);
    while (x !== 0) { dist += x & 1; x >>= 1; }
  }
  return dist;
}
