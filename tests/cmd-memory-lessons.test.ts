import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/core/cli-args.js";
import { run } from "../src/cli.js";
import { compileLessons } from "../src/core/memory-lessons.js";
import { lessonEvidenceProblem, loadLessonEnvironment } from "../src/core/memory-lesson-evidence.js";
import { appendEvent, memoryPaths, readEvents, loadGraph, ledgerLineCount, graphCacheFresh } from "../src/core/memory-store.js";
import { recordOutcome } from "../src/core/memory-autorecord.js";
import { exportCorpus } from "../src/core/memory-corpus.js";
import { canonicalHash } from "../src/core/ds-manifest.js";

vi.mock("node:fs", async (original) => { const fs = await original<typeof import("node:fs")>(); return { ...fs, readFileSync: vi.fn(fs.readFileSync) }; });
let dir: string;
const at = "2026-10-09T00:00:00Z";
function cli(args: string[]) {
  let out = "";
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = (chunk: string | Uint8Array) => { out += String(chunk); return true; };
  process.stderr.write = () => true;
  try { return { code: run([...args, "--dir", dir, "--json"]), body: JSON.parse(out) }; }
  finally { process.stdout.write = stdout; process.stderr.write = stderr; }
}
function record(type: string, data: object, refs?: string, extra: string[] = []) {
  return cli(["memory", "record", type, "--data", JSON.stringify(data), "--at", at,
    "--no-registry", ...(refs === undefined ? [] : ["--refs", refs]), ...extra]);
}
function ledger() { const p = join(dir, "design/memory.events.jsonl"); return existsSync(p) ? readFileSync(p, "utf8") : ""; }
function revision() {
  const { compiledHash, registryHash, generation } = JSON.parse(readFileSync(join(dir, "design/ds.manifest.json"), "utf8"));
  return canonicalHash({ compiledHash, registryHash, generation });
}
function fingerprint(text: string) { return "sha256:" + createHash("sha256").update(text).digest("hex"); }
function propose(refs = "e1", data: object = {}) {
  return record("lesson_proposed", { text: "Use generous spacing", scope: { kind: "project" }, dsRevision: revision(), ...data }, refs);
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "memory-lessons-"));
  const init = cli(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "calm workspace",
    "--persona-data", new URL("../knowledge/personas/personas.json", import.meta.url).pathname]);
  expect(init.code, JSON.stringify(init.body)).toBe(0);
  writeFileSync(join(dir, "proof.txt"), "observed correction");
  expect(record("manual_edit", { summary: "corrected spacing" }, undefined,
    ["--artifact-ref", "proof.txt", "--fingerprint", fingerprint("observed correction")]).code).toBe(0);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
it("records a pending lesson without promoting legacy observations", () => {
  const result = propose();
  expect(result.code, JSON.stringify(result.body)).toBe(0);
  expect(result.body.data.id).toBe("e2");
  const graph = JSON.parse(readFileSync(join(dir, "design/memory.graph.json"), "utf8"));
  expect(graph.v).toBe(2);
  expect(graph.lessons).toMatchObject([{ id: "e2", status: "pending", refs: ["e1"] }]);
});
it.each(["e1,e1", "e9", "e2"])("rejects duplicate/dangling/forward refs %s before ledger append", (refs) => {
  const before = ledger();
  const result = propose(refs);
  expect(result.code).toBe(1);
  expect(result.body.error.code).toBe("BAD_LESSON");
  expect(result.body.error.message).toMatch(/ref/);
  expect(ledger()).toBe(before);
});
it("lock contention is visible and does not append", () => {
  mkdirSync(join(dir, "design/memory.events.lock"));
  const before = ledger();
  const result = record("manual_edit", { summary: "another correction" });
  expect(result.code).toBe(1);
  expect(result.body.error.code).toBe("MEMORY_LOCKED");
  expect(ledger()).toBe(before);
});

function review(decision: "accept" | "reject" | "revoke", change: object = {}) {
  const receipt = { lessonId: "e2", dsRevision: revision(), decision, actor: "owner", reason: "explicit decision", ...change };
  const bytes = JSON.stringify(receipt);
  writeFileSync(join(dir, "approval.json"), bytes);
  return record("lesson_reviewed", { lessonId: "e2", decision, reason: "explicit decision",
    approvalRef: "approval.json", approvalFingerprint: fingerprint(bytes) }, "e2", ["--actor", "owner"]);
}
it("accepts then revokes after source removal; terminal state cannot reactivate", () => {
  expect(propose().code).toBe(0);
  expect(review("accept").code).toBe(0);
  rmSync(join(dir, "proof.txt")); rmSync(join(dir, "design/design.tokens.json"));
  expect(review("revoke").code).toBe(0);
  const before = ledger();
  const result = review("accept");
  expect(result.code).toBe(1);
  expect(result.body.error.message).toContain("revoked state");
  expect(ledger()).toBe(before);
});
it.each(["accept", "reject"] as const)("%s requires a matching decision receipt", (decision) => {
  expect(propose().code).toBe(0);
  const before = ledger();
  const result = review(decision, { actor: "someone else" });
  expect(result.body.error.message).toContain("does not match actor");
  expect(ledger()).toBe(before);
});
it("reject remains possible after source and DS are removed", () => {
  expect(propose().code).toBe(0);
  const dsRevision = revision();
  rmSync(join(dir, "proof.txt"));
  rmSync(join(dir, "design/ds.manifest.json"));
  const bytes = JSON.stringify({ lessonId: "e2", dsRevision, decision: "reject", actor: "owner", reason: "obsolete" });
  writeFileSync(join(dir, "approval.json"), bytes);
  expect(record("lesson_reviewed", { lessonId: "e2", decision: "reject", reason: "obsolete",
    approvalRef: "approval.json", approvalFingerprint: fingerprint(bytes) }, "e2", ["--actor", "owner"]).code).toBe(0);
});
it("accept fails on changed evidence before append", () => {
  expect(propose().code).toBe(0);
  writeFileSync(join(dir, "proof.txt"), "changed proof");
  const before = ledger();
  const result = review("accept");
  expect(result.body.error.message).toContain("fingerprint mismatch");
  expect(ledger()).toBe(before);
});
it.each([
  { text: " " }, { text: "x".repeat(2001) }, { dsRevision: "sha256-invalid" },
  { scope: { kind: "project", target: "Control/Button" } },
  { scope: { kind: "component", target: "unknown" } }, { scope: { kind: "pattern" } },
])("malformed proposal does not change ledger: %j", (data) => {
  const before = ledger();
  expect(propose("e1", data).code).toBe(1);
  expect(ledger()).toBe(before);
});
it("graph failure honestly reports an already committed event", () => {
  rmSync(join(dir, "design/memory.graph.json"));
  mkdirSync(join(dir, "design/memory.graph.json"));
  const result = propose();
  expect(result.code).toBe(1);
  expect(result.body.error.code).toBe("MEMORY_COMMITTED");
  expect(result.body.data).toMatchObject({ committed: true, id: "e2" });
  expect(ledger().trim().split("\n")).toHaveLength(2);
  expect(result.body.error.message).toContain("Do not repeat record");
});
it("rechecks acceptance receipt and keeps lessons outside legacy corpus", () => {
  expect(propose().code).toBe(0); expect(review("accept").code).toBe(0);
  const events = readEvents(memoryPaths(dir)), lessons = compileLessons(events);
  expect(lessonEvidenceProblem(dir, lessons[0]!, events)).toBeNull();
  writeFileSync(join(dir, "approval.json"), "{}");
  expect(lessonEvidenceProblem(dir, lessons[0]!, events)).toContain("fingerprint mismatch");
  expect(exportCorpus(events).some((entry) => entry.id === "e2" || entry.id === "e3")).toBe(false);
});
it("refuses symlink escapes for source evidence and approval files", () => {
  const outside = mkdtempSync(join(tmpdir(), "lesson-outside-"));
  try {
    writeFileSync(join(outside, "proof.txt"), "observed correction");
    rmSync(join(dir, "proof.txt")); symlinkSync(join(outside, "proof.txt"), join(dir, "proof.txt"));
    const before = ledger(); expect(propose().body.error.message).toContain("escapes project realpath"); expect(ledger()).toBe(before);
    rmSync(join(dir, "proof.txt")); writeFileSync(join(dir, "proof.txt"), "observed correction");
    expect(propose().code).toBe(0);
    const bytes = JSON.stringify({ lessonId: "e2", dsRevision: revision(), decision: "accept", actor: "owner", reason: "yes" });
    writeFileSync(join(outside, "approval.json"), bytes); symlinkSync(join(outside, "approval.json"), join(dir, "approval.json"));
    const beforeReview = ledger();
    const result = record("lesson_reviewed", { lessonId: "e2", decision: "accept", reason: "yes", approvalRef: "approval.json", approvalFingerprint: fingerprint(bytes) }, "e2", ["--actor", "owner"]);
    expect(result.body.error.message).toContain("escapes project realpath"); expect(ledger()).toBe(beforeReview);
  } finally { rmSync(outside, { recursive: true, force: true }); }
});
it.each([{ v: 2 }, { t: "2026-02-30T00:00:00Z" }, { t: "yesterday" }, { refs: ["e9"] }, { id: "e1" }])("invalid lesson replay fails without appending: %j", (change) => {
  expect(propose().code).toBe(0);
  const events = ledger().trim().split("\n").map((line) => JSON.parse(line)); Object.assign(events[1], change);
  writeFileSync(join(dir, "design/memory.events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  const before = ledger(), result = propose();
  expect(result.code).toBe(1); expect(result.body.error.code).toBe("BAD_LESSON"); expect(ledger()).toBe(before);
});
it("cache hashes catch same-mtime source edits, upgrade old schema and refresh explicit decay", () => {
  const paths = memoryPaths(dir); record("vibe_edit", { word: "warmer", axis: "color" });
  const first = loadGraph(paths, at, true); const times = statSync(paths.ledger);
  writeFileSync(paths.ledger, ledger().replace("warmer", "cooler")); utimesSync(paths.ledger, times.atime, times.mtime);
  expect(graphCacheFresh(paths)).toBe(false); const changed = loadGraph(paths, at); expect(graphCacheFresh(paths)).toBe(true); expect(changed.sourceHash).not.toBe(first.sourceHash); expect(changed.vibes[0]?.word).toBe("cooler");
  writeFileSync(paths.graph, JSON.stringify({ ...changed, v: 1 })); expect(loadGraph(paths, at).v).toBe(2);
  expect(loadGraph(paths, "2026-11-08T00:00:00Z", true).vibes[0]?.weight).toBe(0.5);
  rmSync(paths.graph); expect(loadGraph(paths, at).lessons).toEqual([]);
});
it("writer and autorecord propagate the assigned ID without eager graph writes", () => {
  const paths = memoryPaths(dir); rmSync(paths.graph);
  const id = appendEvent(paths, { v: 1, id: "e1", t: at, type: "manual_edit", data: { summary: "second" } }).id;
  expect(id).toBe("e2");
  const result = recordOutcome(parseArgs(["--dir", dir]), { type: "manual_edit", actor: "test", data: { summary: "third" } }, at);
  expect(result).toEqual({ recorded: true, id: "e3" }); expect(existsSync(paths.graph)).toBe(false);
});
it("verified environment refuses a tampered seal", () => {
  expect(loadLessonEnvironment(dir)?.revision).toBe(revision());
  writeFileSync(join(dir, "design/design.tokens.json"), "{}");
  const before = ledger(); expect(propose().body.error.message).toContain("hash mismatch"); expect(ledger()).toBe(before);
});
it("20k fresh-counter autorecord never reads the entire ledger", () => {
  const paths = memoryPaths(dir), event = JSON.parse(ledger().trim());
  writeFileSync(paths.ledger, Array.from({ length: 20000 }, (_, i) => JSON.stringify({ ...event, id: `e${i + 1}` })).join("\n") + "\n");
  ledgerLineCount(paths); vi.mocked(readFileSync).mockClear(); rmSync(paths.graph);
  const start = performance.now(), result = recordOutcome(parseArgs(["--dir", dir]), { type: "manual_edit", actor: "bench", data: { summary: "bench" } }, at);
  console.log(`20k ledger autorecord: ${(performance.now() - start).toFixed(2)}ms`);
  expect(result).toEqual({ recorded: true, id: "e20001" }); expect(existsSync(paths.graph)).toBe(false);
  expect(vi.mocked(readFileSync).mock.calls.filter(([path]) => path === paths.ledger)).toEqual([]);
});
it.each([['pending','revoke'],['accepted','accept'],['accepted','reject'],['rejected','accept'],['rejected','revoke']] as const)("refuses %s -> %s with unchanged ledger", (state, decision) => {
  expect(propose().code).toBe(0); if (state !== 'pending') expect(review(state === 'accepted' ? 'accept' : 'reject').code).toBe(0);
  const before = ledger(), result = review(decision); expect(result.body.error.message).toContain(`${state} state`); expect(ledger()).toBe(before);
});
