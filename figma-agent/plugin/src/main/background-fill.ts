// Pure CSS `background-size` → Figma image scaleMode mapping.
// Split into its own DOM-free / figma-free module so the mapping is
// unit-testable without a live Figma canvas (Track 5, Commit 1, COPY #2).

export type ImageScaleMode = 'FILL' | 'FIT' | 'TILE';

/**
 * Map a computed CSS `background-size` value to a Figma image scaleMode.
 * v1 mapping (CROP + imageTransform deferred — no OSS reference):
 *   - `cover`         → FILL   (fill the box, crop overflow — Figma default)
 *   - `auto` / unset  → FILL
 *   - `contain`       → FIT    (letterbox to fit inside the box)
 *   - contains `repeat` token → TILE (rare: a repeat leaks into background-size)
 *   - explicit px / % → FILL   (approximation; exact placement is deferred)
 */
export function backgroundSizeToScaleMode(bgSize?: string): ImageScaleMode {
  const s = (bgSize || '').trim().toLowerCase();
  if (!s || s === 'auto') return 'FILL';
  if (s === 'cover') return 'FILL';
  if (s === 'contain') return 'FIT';
  if (s.includes('repeat')) return 'TILE';
  return 'FILL';
}
