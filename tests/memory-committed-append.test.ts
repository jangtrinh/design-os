import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/core/cli-args.js";
import { buildEvent, MemoryEventError, type MemoryEvent } from "../src/core/memory-events.js";
import { MemoryAppendCommittedError } from "../src/core/memory-error.js";
import { appendEvent, memoryPaths, readEvents } from "../src/core/memory-store.js";
import { recordOutcome, withOutcome } from "../src/core/memory-autorecord.js";
import { runRecord } from "../src/commands/memory-record-impl.js";
import { ingestFigmaDsCommand } from "../src/commands/ingest-figma-ds.js";
import { synthesizeConventionsCommand } from "../src/commands/synthesize-conventions.js";
import { seedMemoryBatch } from "../src/core/memory-seed-batch.js";
import { parseDsFile, ingestDesignSystem } from "../src/core/figma-ds-ingest.js";
import { parseDnaFile, synthesizeConventions } from "../src/core/figma-conventions-synth.js";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, rmSync: vi.fn(fs.rmSync), appendFileSync: vi.fn(fs.appendFileSync) };
});

vi.mock("../src/core/memory-store.js", async (importOriginal) => {
  const store = await importOriginal<typeof import("../src/core/memory-store.js")>();
  return { ...store, appendEvent: vi.fn(store.appendEvent) };
});

const NOW = "2026-10-09T00:00:00.000Z";
const input = { type: "manual_edit" as const, actor: "test", data: { summary: "owner correction" } };
let dir: string;
let paths: ReturnType<typeof memoryPaths>;
let lock: string;

function event(): MemoryEvent {
  return buildEvent({ ...input, id: "unused", t: NOW });
}

function failCleanup(): void {
  vi.mocked(rmSync).mockImplementationOnce(() => {
    throw Object.assign(new Error("EIO: injected lock cleanup failure"), { code: "EIO" });
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "memory-committed-"));
  paths = memoryPaths(dir);
  lock = join(paths.dir, "memory.events.lock");
});

afterEach(async () => {
  const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
  const store = await vi.importActual<typeof import("../src/core/memory-store.js")>("../src/core/memory-store.js");
  vi.mocked(appendEvent).mockReset().mockImplementation(store.appendEvent);
  vi.mocked(rmSync).mockReset().mockImplementation(fs.rmSync);
  vi.mocked(appendFileSync).mockReset().mockImplementation(fs.appendFileSync);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("committed append cleanup failures", () => {
  it("throws the shared committed error with the persisted ID and held lock diagnostic", () => {
    appendEvent(paths, event());
    failCleanup();
    let error: unknown;
    try { appendEvent(paths, event()); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(MemoryAppendCommittedError);
    expect(error).toBeInstanceOf(MemoryEventError);
    expect(error).toMatchObject({ code: "MEMORY_COMMITTED", committed: true, id: "e2" });
    const message = (error as Error).message;
    expect(message).toContain("event 'e2' committed");
    expect(message).toContain(lock);
    expect(message).toContain("EIO: injected lock cleanup failure");
    expect(message).toContain("Do not repeat record");
    expect(existsSync(lock)).toBe(true);
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it.each([true, false])("runRecord reports committed state (JSON: %s) instead of an ordinary write failure", (json) => {
    appendEvent(paths, event());
    failCleanup();
    const result = runRecord(parseArgs(["memory", "record", "manual_edit", "--data", JSON.stringify(input.data), "--dir", dir, "--no-registry", ...(json ? ["--json"] : [])]));
    expect(result.exitCode).toBe(1);
    if (json) {
      const envelope = JSON.parse(result.stdout!);
      expect(envelope.data).toEqual({ committed: true, id: "e2", type: "manual_edit", ledger: paths.ledger });
      expect(envelope.error.code).toBe("MEMORY_COMMITTED");
      expect(envelope.error.message).toContain("Do not repeat record");
      expect(envelope.error.message).toContain(lock);
    } else {
      expect(result.stderr).toContain("event 'e2' committed");
      expect(result.stderr).toContain("Do not repeat record");
      expect(result.stderr).toContain(lock);
    }
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("autorecord returns recorded:true, the assigned ID and a warning", () => {
    appendEvent(paths, event());
    failCleanup();
    const result = recordOutcome(parseArgs(["lint", "--dir", dir]), input, NOW);
    expect(result).toMatchObject({ recorded: true, id: "e2" });
    expect(result.reason).toBeUndefined();
    expect(result.warning).toContain("Do not repeat record");
    expect(result.warning).toContain(lock);
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("withOutcome preserves the command result and emits a committed warning", () => {
    mkdirSync(paths.dir);
    failCleanup();
    const result = withOutcome({ exitCode: 7, stdout: "original output", stderr: "existing warning\n" }, parseArgs(["lint", "--dir", dir]), input, NOW);
    expect(result).toMatchObject({ exitCode: 7, stdout: "original output" });
    expect(result.stderr).toContain("existing warning\n");
    expect(result.stderr).toContain("event 'e1' committed");
    expect(result.stderr).toContain(lock);
    expect(result.stderr).not.toContain("skipped");
    expect(readEvents(paths)).toHaveLength(1);
  });

  it.each(["ingest", "synthesize"])("%s exposes committed seed ID and warning in JSON and text", (command) => {
    const ingest = command === "ingest";
    const handler = ingest ? ingestFigmaDsCommand : synthesizeConventionsCommand;
    const fixture = new URL(ingest ? "./fixtures/figma-ds/ds.json" : "./fixtures/figma-conventions/usage-dna.json", import.meta.url).pathname;
    for (const json of [true, false]) {
      failCleanup();
      const parsed = parseArgs([handler.name, "--out", dir, "--seed-memory", "--now", NOW, ...(json ? ["--json"] : [])]);
      parsed.positionals = [fixture];
      const result = handler.run(parsed);
      expect(result.exitCode).toBe(1);
      const message = json ? JSON.parse(result.stdout!).error.message : result.stderr;
      expect(message).toContain(`event 'e${json ? 1 : 2}' committed`);
      expect(message).toContain("Do not repeat record");
      expect(message).toContain(lock);
      if (json) {
        const envelope = JSON.parse(result.stdout!);
        expect(envelope.error.code).toBe("MEMORY_COMMITTED");
        expect(envelope.data).toEqual({ committed: true, id: "e1", ids: ["e1"], partial: true, ledger: paths.ledger, warn: message });
      }
      // Explicit test recovery, never a timed wait or an automatic lock break.
      vi.mocked(rmSync)(lock, { recursive: true });
    }
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

function batchCommand(command: "ingest" | "synthesize", json = true) {
  const ingest = command === "ingest";
  const handler = ingest ? ingestFigmaDsCommand : synthesizeConventionsCommand;
  const fixture = new URL(ingest ? "./fixtures/figma-ds/ds.json" : "./fixtures/figma-conventions/usage-dna.json", import.meta.url).pathname;
  const parsed = parseArgs([handler.name, "--out", dir, "--seed-memory", "--now", NOW, ...(json ? ["--json"] : [])]);
  parsed.positionals = [fixture];
  const source = JSON.parse(readFileSync(fixture, "utf8"));
  let expectedCount: number;
  if (ingest) {
    const result = ingestDesignSystem(parseDsFile(source), "test", "fixture");
    expectedCount = 1 + result.componentNames.length + Number(result.icons.count > 0) + Number(result.screens.length > 0);
  } else {
    expectedCount = 1 + synthesizeConventions(parseDnaFile(source), undefined, "fixture").insights.length;
  }
  return { run: () => handler.run(parsed), expectedCount };
}

describe.each(["ingest", "synthesize"] as const)("%s batch commit reporting", (command) => {
  it.each([true, false])("reports all committed IDs if final projection fails (JSON: %s)", (json) => {
    mkdirSync(paths.graph, { recursive: true }); // Real filesystem failure after every append.
    const batch = batchCommand(command, json);
    const result = batch.run();
    const ids = readEvents(paths).map((e) => e.id);
    expect(result.exitCode).toBe(1);
    expect(ids).toEqual(Array.from({ length: batch.expectedCount }, (_, i) => `e${i + 1}`));
    expect(new Set(ids).size).toBe(batch.expectedCount);
    expect(vi.mocked(appendEvent)).toHaveBeenCalledTimes(batch.expectedCount);
    const message = json ? JSON.parse(result.stdout!).error.message : result.stderr;
    expect(message).toContain(`${batch.expectedCount}/${batch.expectedCount}`);
    expect(message).toContain(ids.join(", "));
    expect(message).toContain(paths.graph);
    expect(message).toContain("Do not repeat --seed-memory");
    expect(message).toContain("ui memory compile");
    expect(message).not.toContain("append only reviewed missing events");
    if (json) {
      const envelope = JSON.parse(result.stdout!);
      expect(envelope.error.code).toBe("MEMORY_COMMITTED");
      expect(envelope.data).toEqual({ committed: true, id: ids.at(-1), ids, partial: false, ledger: paths.ledger, warn: message });
    }
    expect(existsSync(lock)).toBe(false);
  });

  it.each(["EIO", "MEMORY_LOCKED"])("retains the first verified event after a later %s without retry", async (code) => {
    const batch = batchCommand(command);
    if (code === "EIO") {
      const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
      vi.mocked(appendFileSync).mockImplementationOnce(fs.appendFileSync).mockImplementationOnce(() => {
        expect(readEvents(paths).map((e) => e.id)).toEqual(["e1"]);
        throw Object.assign(new Error("EIO: injected second append failure"), { code });
      });
    } else {
      const store = await vi.importActual<typeof import("../src/core/memory-store.js")>("../src/core/memory-store.js");
      vi.mocked(appendEvent).mockImplementationOnce(store.appendEvent).mockImplementationOnce(() => {
        expect(readEvents(paths).map((e) => e.id)).toEqual(["e1"]);
        mkdirSync(lock);
        throw new MemoryEventError(code, `injected competing writer holds '${lock}'`);
      });
    }
    const result = batch.run();
    const envelope = JSON.parse(result.stdout!);
    expect(result.exitCode).toBe(1);
    expect(envelope.error.code).toBe("MEMORY_COMMITTED");
    expect(envelope.data).toEqual({ committed: true, id: "e1", ids: ["e1"], partial: true, ledger: paths.ledger, warn: envelope.error.message });
    expect(envelope.error.message).toContain(`1/${batch.expectedCount}`);
    expect(envelope.error.message).toContain(code);
    expect(envelope.error.message).toContain("Do not repeat --seed-memory");
    expect(envelope.error.message).toContain("append only reviewed missing events");
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1"]);
    expect(vi.mocked(appendEvent)).toHaveBeenCalledTimes(2);
    expect(existsSync(paths.graph)).toBe(false);
  });
});

describe("seed batch error contract", () => {
  it("combines earlier returned IDs with the current cleanup error's committed IDs", async () => {
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(rmSync).mockImplementationOnce(fs.rmSync);
    failCleanup();
    let error: unknown;
    try {
      seedMemoryBatch(paths, 3, NOW, (append) => {
        append(event());
        append(event());
        append(event());
      });
    } catch (e) { error = e; }
    expect(error).toBeInstanceOf(MemoryAppendCommittedError);
    expect(error).toMatchObject({ id: "e2", ids: ["e1", "e2"], partial: true });
    expect((error as Error).message).toContain("2/3");
    expect((error as Error).message).toContain(lock);
    expect((error as Error).message).toContain("EIO: injected lock cleanup failure");
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(vi.mocked(appendEvent)).toHaveBeenCalledTimes(2);
  });

  it.each(["validation", "append"])("preserves the exact original %s error with no commit", (stage) => {
    const original = stage === "validation" ? new MemoryEventError("BAD_EVENT", "invalid first seed event") : new Error("EIO: first append failed");
    if (stage === "append") vi.mocked(appendFileSync).mockImplementationOnce(() => { throw original; });
    let error: unknown;
    try {
      seedMemoryBatch(paths, 2, NOW, (append) => {
        if (stage === "validation") throw original;
        append(event());
      });
    } catch (e) { error = e; }
    expect(error).toBe(original);
    expect(readEvents(paths)).toEqual([]);
    expect(existsSync(paths.graph)).toBe(false);
  });

  it("keeps the existing class API and defensively copies batch IDs", () => {
    const single = new MemoryAppendCommittedError("e1", "committed");
    expect(single).toMatchObject({ id: "e1", ids: ["e1"], committed: true, partial: false });
    const ids = ["e1", "e2"];
    const partial = new MemoryAppendCommittedError("e2", "partial", ids, 3);
    ids.push("e3");
    expect(partial).toMatchObject({ id: "e2", ids: ["e1", "e2"], committed: true, partial: true });
  });
});

describe("cleanup failure before commit", () => {
  it.each([
    { type: "manual_edit", data: {}, code: "BAD_EVENT", message: "summary" },
    { type: "lesson_proposed", data: { text: "lesson", scope: { kind: "project" }, dsRevision: "sha256-" + "a".repeat(43) }, refs: ["e999"], code: "BAD_LESSON", message: "ref 'e999' is forward or dangling" },
  ] as const)("preserves $type validation with no event committed and the lock still held", (bad) => {
    appendEvent(paths, event());
    const before = readFileSync(paths.ledger, "utf8");
    failCleanup();
    let error: unknown;
    try { appendEvent(paths, { ...event(), type: bad.type, data: bad.data, refs: bad.refs !== undefined ? [...bad.refs] : undefined }); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(MemoryEventError);
    expect(error).not.toBeInstanceOf(MemoryAppendCommittedError);
    expect(error).toMatchObject({ code: bad.code, message: expect.stringContaining(bad.message) });
    expect((error as Error).message).not.toContain("EIO");
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(paths.ledger, "utf8")).toBe(before);
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1"]);
  });

  it("preserves the exact original append failure when lock cleanup also fails", () => {
    appendEvent(paths, event());
    const original = Object.assign(new Error("ENOSPC: ledger append failed"), { code: "ENOSPC" });
    vi.mocked(appendFileSync).mockImplementationOnce(() => { throw original; });
    failCleanup();
    let error: unknown;
    try { appendEvent(paths, event()); } catch (e) { error = e; }
    expect(error).toBe(original);
    expect(existsSync(lock)).toBe(true);
    expect(readEvents(paths).map((e) => e.id)).toEqual(["e1"]);
  });
});
