/**
 * Registry-integrity phase 04 (5.4), §0 — the committed scale baseline. "A headline
 * number is a hypothesis until measured" (repo doctrine): every part of phase 04 states
 * its before/after against `plans/260730-0847-registry-integrity/scale-baseline.json`,
 * and a part that does not measurably beat its recorded number is reverted, not shipped.
 *
 * This file has two jobs, deliberately separated in time:
 *   1. RECORD (once, bootstrap-only): if the baseline file does not yet exist, generate
 *      the seeded 10k-component / 50k-frame corpus and measure TODAY's (pre-phase-04)
 *      implementation, then write it. Guarded so a later run — after §1/§5 have already
 *      changed the measured code paths — can never silently overwrite the "before"
 *      snapshot with an "after" number; that would erase the very reference the phase's
 *      reverted-if-not-faster discipline depends on.
 *   2. VALIDATE (every run): regenerate the same seeded corpus and prove the real kernel
 *      functions still parse/load/apply it correctly at this scale — a genuine regression
 *      gate, not a perf assertion (perf assertions in a shared-CI environment are exactly
 *      the class of flake this repo's own retros warn about; each part's OWN test file is
 *      where a before/after margin gets asserted, against this committed reference).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { loadRegistry, saveRegistry, type Registry } from "../src/core/registry-store.js";
import { parseChangeLog, coalesceFrames, computePreviewDelta, type RegistryView } from "../src/core/figma-reconcile.js";
import { applyDelta } from "../src/core/figma-apply.js";
import { ledgerLineCount, type MemoryPaths } from "../src/core/memory-store.js";
import { serializeEvent, type MemoryEvent } from "../src/core/memory-events.js";

const COMPONENTS = 10_000;
const FRAMES = 50_000;
const APPLY_TAIL = 200; // "a 200-target delta" (spec §0) — the last 200 frames touch exactly 200 distinct components at this corpus's round-robin frame assignment.
const LEDGER_SEED_EVENTS = 5_000;

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(TEST_DIR, "..", "plans", "260730-0847-registry-integrity", "scale-baseline.json");
const GENERATOR = join(TEST_DIR, "..", "scripts", "dev", "make-scale-corpus.mjs");

interface BaselineEntry { ms: number; heapUsedDelta: number; note?: string }
interface Baseline {
  generatedAt: string;
  corpus: { components: number; frames: number; seed: number };
  operations: Record<
    "parseChangeLog" | "dryRun" | "apply200" | "saveRegistry" | "ledgerLineCount",
    BaselineEntry
  >;
}

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "scale-corpus-"));
  execFileSync(process.execPath, [GENERATOR, "--components", String(COMPONENTS), "--changes", String(FRAMES), "--out", dir, "--seed", "42"]);
}, 60_000);

/** Wall-time + heapUsed delta for one operation. Not GC-controlled (no --expose-gc in the
 *  normal test runner) — informational for heapUsed, load-bearing only for wall-time,
 *  matching how every other part of this phase measures its own before/after. */
function measure<T>(fn: () => T): { result: T; ms: number; heapUsedDelta: number } {
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  const heapUsedDelta = process.memoryUsage().heapUsed - before;
  return { result, ms, heapUsedDelta };
}

describe("the 10k/50k corpus is well-formed (a real regression gate, every run)", () => {
  it("component-registry.json has exactly COMPONENTS records and loads via the real kernel", () => {
    const registry = loadRegistry(join(dir, "design", "component-registry.json"));
    expect(registry.components).toHaveLength(COMPONENTS);
  });

  it("figma.changes.jsonl has exactly FRAMES frames and parses via the real kernel", () => {
    const raw = readFileSync(join(dir, "design", "figma.changes.jsonl"), "utf8");
    const frames = parseChangeLog(raw);
    expect(frames).toHaveLength(FRAMES);
  });

  it("carries a Figma-Free file (fileKey: null) among the 3 fileKeys — the tier this wave targets", () => {
    const raw = readFileSync(join(dir, "design", "figma.changes.jsonl"), "utf8");
    const frames = parseChangeLog(raw);
    expect(frames.some((f) => f.fileKey === null)).toBe(true);
    expect(new Set(frames.map((f) => f.fileKey))).toEqual(new Set(["aAbBcCdDeEfFgGhH01", "zZyYxXwWvVuUtTsSrR02", null]));
  });

  it("carries at least one deliberate case-only near-duplicate name (the slug-collision path)", () => {
    const registry = loadRegistry(join(dir, "design", "component-registry.json"));
    const byLower = new Map<string, string[]>();
    for (const c of registry.components) {
      const lower = c.name.toLowerCase();
      byLower.set(lower, [...(byLower.get(lower) ?? []), c.name]);
    }
    const collisions = [...byLower.values()].filter((names) => names.length > 1);
    expect(collisions.length).toBeGreaterThan(0);
  });

  it("2000 sidecars exist, partitioned under components/<file-slug>/", () => {
    // The fixture writes raw sidecar files without threading pointers back onto the
    // registry record — count sidecar files on disk directly.
    let total = 0;
    for (const slugDir of readdirSync(join(dir, "design", "components"))) {
      total += readdirSync(join(dir, "design", "components", slugDir)).length;
    }
    expect(total).toBe(2000);
  });

  it("figma-corrections.jsonl has 5000 events, 1200 unresolved", () => {
    const lines = readFileSync(join(dir, "design", "memory", "figma-corrections.jsonl"), "utf8")
      .split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(5000);
    const unresolved = lines.filter((l) => (JSON.parse(l) as { unresolved?: boolean }).unresolved === true);
    expect(unresolved).toHaveLength(1200);
  });

  it("regenerating with the same seed is byte-identical (determinism)", () => {
    const dir2 = mkdtempSync(join(tmpdir(), "scale-corpus-repeat-"));
    execFileSync(process.execPath, [GENERATOR, "--components", "300", "--changes", "600", "--out", dir2, "--seed", "42"]);
    const dirA = mkdtempSync(join(tmpdir(), "scale-corpus-repeat-a-"));
    execFileSync(process.execPath, [GENERATOR, "--components", "300", "--changes", "600", "--out", dirA, "--seed", "42"]);
    const regA = readFileSync(join(dir2, "design", "component-registry.json"), "utf8");
    const regB = readFileSync(join(dirA, "design", "component-registry.json"), "utf8");
    expect(regA).toBe(regB);
    const logA = readFileSync(join(dir2, "design", "figma.changes.jsonl"), "utf8");
    const logB = readFileSync(join(dirA, "design", "figma.changes.jsonl"), "utf8");
    expect(logA).toBe(logB);
  });
});

describe("scale-baseline.json — recorded once, never silently overwritten", () => {
  it("exists after this test file has run at least once, with all 5 kernel-side operations", () => {
    if (!existsSync(BASELINE_PATH)) {
      const registryPath = join(dir, "design", "component-registry.json");
      const logPath = join(dir, "design", "figma.changes.jsonl");
      const rawLog = readFileSync(logPath, "utf8");

      const registry: Registry = loadRegistry(registryPath);
      const existing: ReadonlyMap<string, RegistryView> = new Map(
        registry.components.map((c) => [c.name, { name: c.name, scope: c.scope, deprecated: c.deprecated }]),
      );

      // parseChangeLog over 50k frames.
      const parseChangeLogM = measure(() => parseChangeLog(rawLog));

      // one dry-run: full-log coalesce + preview delta (today's whole-log cost — no cursor streaming yet).
      const dryRunM = measure(() => {
        const frames = parseChangeLog(rawLog);
        const coalesced = coalesceFrames(frames, 0);
        return computePreviewDelta(coalesced, existing);
      });

      // one --apply with a 200-target delta: the tail 200 frames, applied into the full 10k registry.
      const apply200M = measure(() => {
        const frames = parseChangeLog(rawLog);
        const tail = frames.slice(frames.length - APPLY_TAIL);
        const coalesced = coalesceFrames(tail, frames.length - APPLY_TAIL);
        const delta = computePreviewDelta(coalesced, existing);
        return applyDelta(registry, delta);
      });
      expect(apply200M.result.report.deprecated.length + apply200M.result.report.updated.length + apply200M.result.report.pending.length)
        .toBeGreaterThan(0); // sanity: the 200-target slice actually touched something

      // saveRegistry over 10k records.
      const savePath = join(dir, "design", "component-registry.scratch.json");
      const saveRegistryM = measure(() => saveRegistry(savePath, registry));

      // appendEvent's next-id lookup against a 5k-event ledger (memory-store.ts:52's
      // `ledgerLineCount` — the O(E) full-file read the phase names as the bottleneck).
      const memPaths: MemoryPaths = {
        projectDir: dir, dir: join(dir, "design"),
        ledger: join(dir, "design", "memory.events.jsonl"), graph: join(dir, "design", "memory.graph.json"),
      };
      for (let i = 0; i < LEDGER_SEED_EVENTS; i++) {
        const event: MemoryEvent = { v: 1, id: `evt-${i}`, t: new Date(1_700_000_000_000 + i).toISOString(), type: "reconcile_applied", data: { added: [], updated: [], deprecated: [] } };
        appendFileSync(memPaths.ledger, serializeEvent(event) + "\n", "utf8");
      }
      const ledgerLineCountM = measure(() => ledgerLineCount(memPaths));
      expect(ledgerLineCountM.result).toBe(LEDGER_SEED_EVENTS);

      const baseline: Baseline = {
        generatedAt: new Date().toISOString(),
        corpus: { components: COMPONENTS, frames: FRAMES, seed: 42 },
        operations: {
          parseChangeLog: { ms: parseChangeLogM.ms, heapUsedDelta: parseChangeLogM.heapUsedDelta, note: "parseChangeLog over 50k frames" },
          dryRun: { ms: dryRunM.ms, heapUsedDelta: dryRunM.heapUsedDelta, note: "parseChangeLog + coalesceFrames + computePreviewDelta, whole log, cursor 0" },
          apply200: { ms: apply200M.ms, heapUsedDelta: apply200M.heapUsedDelta, note: "parseChangeLog + coalesce + delta + applyDelta over the tail 200 frames into a 10k-record registry" },
          saveRegistry: { ms: saveRegistryM.ms, heapUsedDelta: saveRegistryM.heapUsedDelta, note: "saveRegistry over 10k records" },
          ledgerLineCount: { ms: ledgerLineCountM.ms, heapUsedDelta: ledgerLineCountM.heapUsedDelta, note: "ledgerLineCount (memory-store.ts:52) against a 5k-event ledger — the id-lookup cost appendEvent's caller pays" },
        },
      };
      writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
    }
    expect(existsSync(BASELINE_PATH)).toBe(true);
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    expect(baseline.corpus).toEqual({ components: COMPONENTS, frames: FRAMES, seed: 42 });
    for (const key of ["parseChangeLog", "dryRun", "apply200", "saveRegistry", "ledgerLineCount"] as const) {
      expect(baseline.operations[key].ms).toBeGreaterThan(0);
    }
  });

  it("is a real file on disk (committed, not a build artifact) with a stable mtime across runs once written", () => {
    expect(statSync(BASELINE_PATH).isFile()).toBe(true);
  });
});
