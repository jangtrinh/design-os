import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, compileAndWrite, graphCacheFresh, memoryPaths } from "../src/core/memory-store.js";
import { captureMemory } from "./helpers/memory-lesson-fixture.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "memory-cache-recovery-"));
  appendEvent(memoryPaths(dir), { v: 1, id: "", t: "2026-10-09T00:00:00Z", type: "manual_edit", data: { summary: "Owner correction" } });
  compileAndWrite(memoryPaths(dir), "2026-10-09T00:00:00Z");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it.each(["generate", "critique"])("rebuilds an incomplete hash-matching cache for %s instead of crashing", (mode) => {
  const paths = memoryPaths(dir);
  const good = JSON.parse(readFileSync(paths.graph, "utf8"));
  writeFileSync(paths.graph, JSON.stringify({ v: 2, sourceHash: good.sourceHash, lessons: [] }));
  expect(graphCacheFresh(paths)).toBe(false);
  const result = captureMemory(["memory", "context", "--dir", dir, "--for", mode, "--json"]);
  expect(result.code, result.out + result.err).toBe(0);
  expect(JSON.parse(result.out).data.complete).toBe(true);
  expect(graphCacheFresh(paths)).toBe(true);
  expect(JSON.parse(readFileSync(paths.graph, "utf8"))).toMatchObject({ eventCount: 1, personas: {}, axes: {}, vibes: [], tokens: {}, designs: {}, insights: [], lessons: [] });
});

it.each(["personas", "axes", "tokens", "designs", "vibes", "insights", "lessons"])("rebuilds malformed nested %s data", (key) => {
  const paths = memoryPaths(dir);
  const good = JSON.parse(readFileSync(paths.graph, "utf8"));
  good[key] = ["vibes", "insights", "lessons"].includes(key) ? [null] : { bad: null };
  writeFileSync(paths.graph, JSON.stringify(good));
  expect(graphCacheFresh(paths)).toBe(false);
  expect(captureMemory(["memory", "context", "--dir", dir, "--json"]).code).toBe(0);
  expect(graphCacheFresh(paths)).toBe(true);
});
