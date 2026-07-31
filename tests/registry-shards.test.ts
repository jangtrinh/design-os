/**
 * Registry-integrity phase 04 (5.4), §4 — sharded per-component records + a compact
 * index, backing `component-registry.json` as a DERIVED artifact. Golden-test discipline:
 * a perf refactor that changes semantics is a regression, not an optimization (A7) — so
 * this suite proves shards+index alone reconstruct the exact contract file `saveRegistry`
 * writes directly, that a single changed record rewrites exactly one shard file (content-
 * guarded, no caller-supplied touched set needed), and that the contract file itself
 * stays byte-identical to what it always was (canonical, sorted, zero shape change — the
 * 49-consumer surface never sees this).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { loadRegistry, saveRegistry, type ComponentRecord, type Registry } from "../src/core/registry-store.js";
import {
  readShard, readShardIndex, registryDir, registryFromShards, shardIndexPath, shardPath, writeShards,
} from "../src/core/registry-shards.js";

let dir: string;
let registryPath: string;

function record(over: Partial<ComponentRecord> & { name: string }): ComponentRecord {
  return { category: over.name.split("/")[0]!, markup: "<div></div>", tokensUsed: [], scope: "local", ...over };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "registry-shards-"));
  registryPath = join(dir, "component-registry.json");
});

describe("saveRegistry — the contract file stays byte-identical (zero consumer impact)", () => {
  it("writes the EXACT same contract-file bytes as before sharding existed", () => {
    const reg: Registry = {
      version: "0.1.0",
      components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary", scope: "global" })],
    };
    saveRegistry(registryPath, reg);
    const written = readFileSync(registryPath, "utf8");
    // Independently reconstruct what a direct (pre-sharding) write would have produced:
    // sorted by name, canonicalStringify — the SAME two steps saveRegistry always did.
    const expected = canonicalStringify({
      version: "0.1.0",
      components: [...reg.components].sort((a, b) => a.name.localeCompare(b.name)),
    });
    expect(written).toBe(expected);
    // And loadRegistry (every one of the 49 consumers) reads it back unaffected.
    expect(loadRegistry(registryPath).components.map((c) => c.name).sort()).toEqual(["Button/Primary", "Card/Basic"]);
  });
});

describe("shards + index — golden round-trip (byte-identical reconstruction)", () => {
  it("registryFromShards reconstructs a registry whose re-saved contract file is byte-identical to the original", () => {
    const reg: Registry = {
      version: "0.1.0",
      components: [
        record({ name: "Card/Basic" }),
        record({ name: "Button/Primary", scope: "global" }),
        record({ name: "Modal/Confirm", deprecated: true }),
      ],
    };
    saveRegistry(registryPath, reg);
    const originalBytes = readFileSync(registryPath, "utf8");

    const rebuilt = registryFromShards(dir, "0.1.0");
    const rebuiltPath = join(dir, "component-registry.rebuilt.json");
    saveRegistry(rebuiltPath, rebuilt);
    expect(readFileSync(rebuiltPath, "utf8")).toBe(originalBytes);
  });

  it("the index lists every component with a matching shard file, sorted by name", () => {
    const reg: Registry = {
      version: "0.1.0",
      components: [record({ name: "Zebra/One" }), record({ name: "Alpha/One" })],
    };
    saveRegistry(registryPath, reg);
    const index = readShardIndex(dir)!;
    expect(index.components.map((e) => e.name)).toEqual(["Alpha/One", "Zebra/One"]);
    for (const entry of index.components) {
      expect(readShard(dir, entry.name)).toEqual(reg.components.find((c) => c.name === entry.name));
    }
  });

  it("readShard reads a single record without touching the contract file or any other shard", () => {
    const reg: Registry = { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] };
    saveRegistry(registryPath, reg);
    expect(readShard(dir, "Card/Basic")).toEqual(record({ name: "Card/Basic" }));
  });
});

describe("a single-record update rewrites EXACTLY one shard (content-guarded, no touched-set needed)", () => {
  it("only the changed component's shard file's mtime advances on a re-save", () => {
    const reg: Registry = {
      version: "0.1.0",
      components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" }), record({ name: "Modal/Confirm" })],
    };
    saveRegistry(registryPath, reg);
    const mtimesBefore = new Map(
      reg.components.map((c) => [c.name, statSync(shardPath(dir, c.name)).mtimeMs]),
    );

    const changed: Registry = {
      version: "0.1.0",
      components: reg.components.map((c) => (c.name === "Button/Primary" ? { ...c, scope: "global" } : c)),
    };
    saveRegistry(registryPath, changed);

    for (const c of reg.components) {
      const mtimeAfter = statSync(shardPath(dir, c.name)).mtimeMs;
      if (c.name === "Button/Primary") {
        expect(readShard(dir, c.name)?.scope).toBe("global");
      } else {
        expect(mtimeAfter).toBe(mtimesBefore.get(c.name)); // byte-identical → content guard skipped the write
      }
    }
  });

  it("re-saving with NO changes at all rewrites zero shard files", () => {
    const reg: Registry = { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] };
    saveRegistry(registryPath, reg);
    const before = reg.components.map((c) => statSync(shardPath(dir, c.name)).mtimeMs);
    saveRegistry(registryPath, reg); // identical content
    const after = reg.components.map((c) => statSync(shardPath(dir, c.name)).mtimeMs);
    expect(after).toEqual(before);
  });

  it("removing a component from the registry deletes its shard (and drops it from the index)", () => {
    const reg: Registry = { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] };
    saveRegistry(registryPath, reg);
    expect(readShard(dir, "Button/Primary")).toBeDefined();

    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    expect(readShard(dir, "Button/Primary")).toBeUndefined();
    expect(readShardIndex(dir)!.components.map((e) => e.name)).toEqual(["Card/Basic"]);
  });
});

describe("registryDir / shardPath layout", () => {
  it("shards live under design/registry/shards/, index under design/registry/index.json", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    expect(readdirSync(join(registryDir(dir), "shards"))).toEqual(["card-basic.json"]);
    expect(JSON.parse(readFileSync(join(registryDir(dir), "index.json"), "utf8")).components).toHaveLength(1);
  });
});

// Stage-4 MAJOR9 — a corrupt index.json (a top-level shape that parses fine but has a
// malformed ENTRY inside) must never wedge every future `saveRegistry` call. Reproduced:
// before the fix, `entry.name` being `undefined` reached `shardPath`/`toSafeFilename` in
// the removal loop and threw, wrapped into WRITE_ERROR by `saveRegistry` — and since the
// corrupt index never got overwritten (the throw happened before ANY write), every
// subsequent save hit the identical crash, forever.
describe("registry-shards — MAJOR9: a corrupt index.json never wedges saveRegistry", () => {
  it("readShardIndex treats a top-level-valid index with ONE malformed entry as entirely absent (not a partial filter)", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] });
    const index = JSON.parse(readFileSync(shardIndexPath(dir), "utf8"));
    index.components[0].name = undefined; // corrupt ONE entry — the exact crash trigger
    writeFileSync(shardIndexPath(dir), JSON.stringify(index));

    expect(readShardIndex(dir)).toBeUndefined(); // the WHOLE index is untrusted, not just the bad entry
  });

  it("a saveRegistry call over a corrupt index never throws — full reprocess instead of a wedge", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] });
    const index = JSON.parse(readFileSync(shardIndexPath(dir), "utf8"));
    index.components[0].name = undefined;
    writeFileSync(shardIndexPath(dir), JSON.stringify(index));

    expect(() => saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] })).not.toThrow();
    // The index has been rebuilt correctly — the corruption is now GONE, not perpetuated.
    expect(readShardIndex(dir)!.components.map((e) => e.name).sort()).toEqual(["Button/Primary", "Card/Basic"]);
  });

  it("a SECOND saveRegistry call after the first recovery also succeeds (the corruption doesn't recur)", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    const index = JSON.parse(readFileSync(shardIndexPath(dir), "utf8"));
    index.components[0].name = 123; // wrong TYPE, not just missing
    writeFileSync(shardIndexPath(dir), JSON.stringify(index));

    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] }); // recovers
    expect(() => saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] })).not.toThrow();
  });

  it("writeShards reports an orphaned shard (a leftover file with no matching current component) when the index was corrupt", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" }), record({ name: "Button/Primary" })] });
    // Corrupt the index so the recovery path cannot trust it to safely remove
    // Button/Primary's shard when it later drops out of the registry.
    const index = JSON.parse(readFileSync(shardIndexPath(dir), "utf8"));
    index.components[0].name = undefined;
    writeFileSync(shardIndexPath(dir), JSON.stringify(index));

    // Now save WITHOUT Button/Primary — its shard file is never explicitly removed
    // (no trustworthy prior index to diff against), so it becomes an orphan.
    const result = writeShards(dir, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    expect(result.orphanShards).toContain("shards/button-primary.json");
  });

  it("no orphans reported on an ordinary save with a valid index", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    const result = writeShards(dir, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    expect(result.orphanShards).toEqual([]);
  });

  it("a shard directory with a stray non-JSON file is never reported as an orphan", () => {
    saveRegistry(registryPath, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    const index = JSON.parse(readFileSync(shardIndexPath(dir), "utf8"));
    index.components[0].name = undefined;
    writeFileSync(shardIndexPath(dir), JSON.stringify(index));
    mkdirSync(join(registryDir(dir), "shards"), { recursive: true });
    writeFileSync(join(registryDir(dir), "shards", ".DS_Store"), "");

    const result = writeShards(dir, { version: "0.1.0", components: [record({ name: "Card/Basic" })] });
    expect(result.orphanShards).toEqual([]);
  });
});
