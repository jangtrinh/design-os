/**
 * `ui scroll-story` kernel — the pure grid/diff/verdict math over already-
 * decoded scroll-capture frames (src/core/png-codec.ts does the PNG decode;
 * this file never touches fs). Reused verbatim by r8's evidence check
 * (build-evidence-rules-persuade.ts), which greps a scroll-story report's
 * text for REPORT_MARKERS rather than re-deriving its own regex — one
 * contract, not two independently-guessed ones.
 *
 * Method: downsample each frame to a GRID_COLS x N grey grid (N from the
 * first frame's aspect ratio), diff adjacent frames' grids, and report two
 * complementary signals a critic can read: `staticRun` (frames literally
 * repeating — a paused animation or a stuck scroll) and `layoutVariance`
 * (how much the row-energy profile shifts across the whole sequence — a
 * plain document scrolled past keeps a stable profile; content that moves,
 * enters, or exits independent of scroll position does not). Thresholds are
 * fixed constants, not tuned per dataset — this is informational, not a gate.
 */
import type { RgbaImage } from "./png-codec.js";

export const GRID_COLS = 32;
export const STATIC_CHANGE_RATIO = 0.02;
export const STATIC_RUN_RATIO = 0.5;
export const LAYOUT_VARIANCE_THRESHOLD = 40;

/** Text markers the command's text-mode report uses — r8 greps for these exactly. */
export const REPORT_MARKERS = { staticRun: "staticRun=", layoutVariance: "layoutVariance=" } as const;

export interface GreyGrid {
  cols: number;
  rows: number;
  /** Row-major grey values 0-255, length = cols*rows. */
  values: Float64Array;
}

/** Luma (ITU-R BT.601) over an RGB(A) buffer, ignoring alpha — screenshots are opaque. */
function luma(data: Uint8Array, i: number): number {
  return 0.299 * (data[i] as number) + 0.587 * (data[i + 1] as number) + 0.114 * (data[i + 2] as number);
}

/** Block-average an RGBA image down to `cols`x`rows` grey cells. */
export function downsample(img: RgbaImage, cols: number, rows: number): GreyGrid {
  const values = new Float64Array(cols * rows);
  const cellW = img.width / cols, cellH = img.height / rows;
  for (let ry = 0; ry < rows; ry++) {
    const y0 = Math.floor(ry * cellH), y1 = Math.max(y0 + 1, Math.floor((ry + 1) * cellH));
    for (let rx = 0; rx < cols; rx++) {
      const x0 = Math.floor(rx * cellW), x1 = Math.max(x0 + 1, Math.floor((rx + 1) * cellW));
      let sum = 0, n = 0;
      for (let y = y0; y < y1 && y < img.height; y++) {
        for (let x = x0; x < x1 && x < img.width; x++) {
          sum += luma(img.data, (y * img.width + x) * 4);
          n++;
        }
      }
      values[ry * cols + rx] = n > 0 ? sum / n : 0;
    }
  }
  return { cols, rows, values };
}

/** Rows to use for a GRID_COLS-wide grid, preserving the first frame's aspect ratio. */
export function rowsForAspect(width: number, height: number): number {
  return Math.max(1, Math.round((GRID_COLS * height) / width));
}

/** Mean absolute per-cell difference between two same-shaped grids, normalised to 0-1. */
export function changeRatio(a: GreyGrid, b: GreyGrid): number {
  let sum = 0;
  const n = a.values.length;
  for (let i = 0; i < n; i++) sum += Math.abs((a.values[i] as number) - (b.values[i] as number));
  return n > 0 ? sum / n / 255 : 0;
}

/** Longest run of consecutive pair indices whose changeRatio is below the static threshold. */
export function longestStaticRun(ratios: number[]): number {
  let best = 0, cur = 0;
  for (const r of ratios) {
    cur = r < STATIC_CHANGE_RATIO ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

/** Per-row mean grey value for one grid (the row-energy profile). */
function rowEnergy(g: GreyGrid): number[] {
  const out: number[] = new Array(g.rows).fill(0);
  for (let ry = 0; ry < g.rows; ry++) {
    let sum = 0;
    for (let rx = 0; rx < g.cols; rx++) sum += g.values[ry * g.cols + rx] as number;
    out[ry] = sum / g.cols;
  }
  return out;
}

/** Mean, across rows, of that row's variance across all frames' energy profiles. */
export function layoutVariance(grids: GreyGrid[]): number {
  if (grids.length === 0) return 0;
  const profiles = grids.map(rowEnergy);
  const rows = profiles[0]?.length ?? 0;
  let total = 0;
  for (let r = 0; r < rows; r++) {
    const col = profiles.map((p) => p[r] as number);
    const mean = col.reduce((s, v) => s + v, 0) / col.length;
    const variance = col.reduce((s, v) => s + (v - mean) ** 2, 0) / col.length;
    total += variance;
  }
  return rows > 0 ? total / rows : 0;
}

export interface ScrollStoryReport {
  frames: number;
  grid: { cols: number; rows: number };
  changeRatios: number[];
  staticRun: number;
  layoutVariance: number;
  verdict: "ACTIVE" | "FLAT";
}

/** Assemble the full report from decoded frames, in capture order. */
export function analyzeFrames(images: RgbaImage[]): ScrollStoryReport {
  if (images.length === 0) {
    return { frames: 0, grid: { cols: GRID_COLS, rows: 0 }, changeRatios: [], staticRun: 0, layoutVariance: 0, verdict: "FLAT" };
  }
  const first = images[0] as RgbaImage;
  const rows = rowsForAspect(first.width, first.height);
  const grids = images.map((img) => downsample(img, GRID_COLS, rows));
  const changeRatios: number[] = [];
  for (let i = 0; i < grids.length - 1; i++) changeRatios.push(changeRatio(grids[i] as GreyGrid, grids[i + 1] as GreyGrid));
  const staticRun = longestStaticRun(changeRatios);
  const variance = layoutVariance(grids);
  const mostlyStatic = changeRatios.length > 0 && staticRun / changeRatios.length >= STATIC_RUN_RATIO;
  const verdict: "ACTIVE" | "FLAT" = mostlyStatic ? "FLAT" : variance >= LAYOUT_VARIANCE_THRESHOLD ? "ACTIVE" : "FLAT";
  return { frames: images.length, grid: { cols: GRID_COLS, rows }, changeRatios, staticRun, layoutVariance: variance, verdict };
}
