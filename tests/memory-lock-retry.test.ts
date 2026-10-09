import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { MemoryEventError, serializeEvent, type MemoryEvent } from "../src/core/memory-events.js";
import { appendEvent, memoryPaths, readEvents, type MemoryPaths } from "../src/core/memory-store.js";

let dir: string;
let paths: MemoryPaths;
let lock: string;
let counter: string;

function event(): MemoryEvent {
  return {
    v: 1, id: "unassigned", t: "2026-10-09T00:00:00.000Z", type: "manual_edit",
    data: { summary: "adjusted component spacing" },
  };
}

function appendError(): unknown {
  try { appendEvent(paths, event()); }
  catch (error) { return error; }
  return undefined;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "memory-lock-retry-"));
  paths = memoryPaths(dir);
  lock = join(paths.dir, "memory.events.lock");
  counter = join(paths.dir, "memory.events.count.json");
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("appendEvent lock retry", () => {
  it.each(["directory", "file"])("reports MEMORY_LOCKED without breaking a held %s lock or changing the ledger", (kind) => {
    appendEvent(paths, event());
    const ledgerBefore = readFileSync(paths.ledger);
    const counterBefore = readFileSync(counter);
    const marker = kind === "directory" ? join(lock, "owner") : lock;
    if (kind === "directory") mkdirSync(lock);
    writeFileSync(marker, "another writer owns this lock\n");
    const lockBefore = statSync(lock);
    const wait = vi.spyOn(Atomics, "wait");

    const error = appendError();

    expect(error).toBeInstanceOf(MemoryEventError);
    expect(error).toMatchObject({
      code: "MEMORY_LOCKED", message: expect.stringContaining("retry after its writer releases it"),
    });
    expect(wait).toHaveBeenCalled();
    expect(readFileSync(paths.ledger)).toEqual(ledgerBefore);
    expect(readFileSync(counter)).toEqual(counterBefore);
    expect(readFileSync(marker, "utf8")).toBe("another writer owns this lock\n");
    const lockAfter = statSync(lock);
    expect([lockAfter.ino, lockAfter.mtimeMs, lockAfter.isDirectory()])
      .toEqual([lockBefore.ino, lockBefore.mtimeMs, lockBefore.isDirectory()]);
    if (kind === "directory") expect(readdirSync(lock)).toEqual(["owner"]);
  });

  it("appends exactly once after a ready worker releases its lock and returns the persisted ID", async () => {
    const seed = appendEvent(paths, event());
    const ledgerBefore = readFileSync(paths.ledger, "utf8");
    const signals = new Int32Array(new SharedArrayBuffer(8));
    const worker = new Worker(`
      const { mkdirSync, rmSync } = require("node:fs");
      const { workerData } = require("node:worker_threads");
      const signals = new Int32Array(workerData.signals);
      mkdirSync(workerData.lock);
      Atomics.store(signals, 0, 1);
      Atomics.notify(signals, 0);
      if (Atomics.wait(signals, 1, 0, 5000) === "timed-out") {
        throw new Error("writer did not signal lock release");
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      rmSync(workerData.lock, { recursive: true });
    `, { eval: true, workerData: { lock, signals: signals.buffer } });
    let workerError: unknown;
    worker.on("error", (error) => { workerError = error; });
    const exited = new Promise<number>((resolve) => worker.once("exit", resolve));

    try {
      // Startup finishes before appendEvent's retry budget begins.
      Atomics.wait(signals, 0, 0, 5000);
      expect(Atomics.load(signals, 0), "worker created the lock before append").toBe(1);
      expect(existsSync(lock)).toBe(true);
      const realWait = Atomics.wait;
      const wait = vi.spyOn(Atomics, "wait").mockImplementation((...args) => {
        // Handshake on the first contention wait guarantees a real EEXIST attempt.
        Atomics.store(signals, 1, 1);
        Atomics.notify(signals, 1);
        return Reflect.apply(realWait, Atomics, args) as ReturnType<typeof Atomics.wait>;
      });
      const submitted = { ...event(), id: seed.id };

      const assigned = appendEvent(paths, submitted);

      expect(await exited).toBe(0);
      expect(workerError).toBeUndefined();
      expect(wait).toHaveBeenCalled();
      expect(assigned).toEqual({ ...submitted, id: "e2" });
      expect(submitted.id).toBe(seed.id);
      expect(readEvents(paths)).toEqual([seed, assigned]);
      expect(readFileSync(paths.ledger, "utf8"))
        .toBe(ledgerBefore + serializeEvent(assigned) + "\n");
      expect(JSON.parse(readFileSync(counter, "utf8")))
        .toEqual({ count: 2, bytes: statSync(paths.ledger).size });
      expect(existsSync(lock)).toBe(false);
    } finally {
      await worker.terminate();
    }
  }, 15000);

  // POSIX permissions cannot force EACCES for root, or on Windows.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("propagates lock creation EACCES without entering retry or changing the ledger", () => {
    appendEvent(paths, event());
    const ledgerBefore = readFileSync(paths.ledger);
    const counterBefore = readFileSync(counter);
    const mode = statSync(paths.dir).mode & 0o777;
    const wait = vi.spyOn(Atomics, "wait");
    chmodSync(paths.dir, 0o500);

    try {
      const error = appendError();
      expect(error).not.toBeInstanceOf(MemoryEventError);
      expect(error).toMatchObject({ code: "EACCES", syscall: "mkdir", path: lock });
      expect(wait).not.toHaveBeenCalled();
      expect(readFileSync(paths.ledger)).toEqual(ledgerBefore);
      expect(readFileSync(counter)).toEqual(counterBefore);
      expect(existsSync(lock)).toBe(false);
    } finally {
      chmodSync(paths.dir, mode);
    }
  });

  it("propagates ENOTDIR from a file in the design path without retrying or replacing it", () => {
    const parentFile = join(dir, "blocked");
    writeFileSync(parentFile, "keep this file\n");
    paths = memoryPaths(join(parentFile, "project"));
    const wait = vi.spyOn(Atomics, "wait");

    const error = appendError();

    expect(error).not.toBeInstanceOf(MemoryEventError);
    expect(error).toMatchObject({ code: "ENOTDIR", syscall: "mkdir" });
    expect(wait).not.toHaveBeenCalled();
    expect(readFileSync(parentFile, "utf8")).toBe("keep this file\n");
    expect(existsSync(paths.ledger)).toBe(false);
    expect(readdirSync(dir)).toEqual(["blocked"]);
  });
});
