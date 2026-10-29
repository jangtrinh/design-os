/**
 * Scale-ratio check for "this scan is linear": the time on 8x the input must stay under 16x the time on
 * the base input plus a small constant. A linear scan lands near 8x on any machine; a quadratic one lands
 * near 64x, so the check does not depend on how fast the machine is (no wall-clock budget).
 */
import { expect } from "vitest";

/** A body of about `bytes` characters: `prefix` once, then `unit` repeated. */
export function shapeBody(prefix: string, unit: string, bytes: number): string {
  return prefix + unit.repeat(Math.max(1, Math.ceil((bytes - prefix.length) / unit.length)));
}

function medianMs(run: () => void, reps: number): number {
  const times: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] as number;
}

export function expectLinear(label: string, bodyOf: (bytes: number) => string, run: (body: string) => void, baseBytes = 20_000): void {
  const small = bodyOf(baseBytes);
  const large = bodyOf(baseBytes * 8);
  run(small); // warm the engine on this shape
  const t1 = medianMs(() => run(small), 5);
  const t8 = medianMs(() => run(large), 3);
  expect(t8, `${label}: ${t1.toFixed(2)} ms at ${baseBytes} -> ${t8.toFixed(2)} ms at ${baseBytes * 8} (${(t8 / Math.max(t1, 0.01)).toFixed(1)}x)`).toBeLessThan(16 * t1 + 5);
}
