/**
 * `ui ds reseal` — the sanctioned re-seal for hash drift. Fixtures are real sealed stores
 * (`ds init`) drifted by writing a store file behind the manifest's back; every case checks
 * the bytes on disk, not only the exit code. Temp dirs are removed after each test.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { canonicalHash, canonicalStringify, loadManifest } from "../src/core/ds-manifest.js";
import { buildChangelog } from "../src/core/changelog.js";
import { loadDesignSystem, pathsForDir } from "../src/core/design-system.js";
import { reseal as resealCore } from "../src/core/ds-reseal.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

interface Out { code: number; out: string; err: string }
function capture(args: string[]): Out {
  let out = "";
  let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A real sealed DS with the default component kit. */
function sealedProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ease-ds-reseal-"));
  scratch.push(dir);
  const r = capture(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "test",
    "--dir", dir, "--persona-data", PERSONA_DATA]);
  expect(r.code).toBe(0);
  return dir;
}
const file = (dir: string, name: string): string => join(dir, "design", name);
const TOKENS = "design.tokens.json";
const REGISTRY = "component-registry.json";
const MANIFEST = "ds.manifest.json";
const FIGMA_REGISTRY = "figma-component-registry.json";
const read = (dir: string, name: string): string => readFileSync(file(dir, name), "utf8");

/** Add a component behind the manifest's back: the registry hash drifts. */
function driftRegistry(dir: string): void {
  const registry = JSON.parse(read(dir, REGISTRY)) as { components: Record<string, unknown>[] };
  registry.components.push({ ...registry.components[0], name: "Zzz/Added-Behind-The-Seal" });
  writeFileSync(file(dir, REGISTRY), canonicalStringify(registry));
}
/** Edit a token value behind the manifest's back: the tokens hash drifts. */
function driftTokens(dir: string): void {
  const tokens = JSON.parse(read(dir, TOKENS)) as Record<string, Record<string, { $value: unknown }>>;
  const group = tokens["color"]!;
  group[Object.keys(group)[0]!]!.$value = "#010203";
  writeFileSync(file(dir, TOKENS), canonicalStringify(tokens));
}
function setTokens(dir: string, mutate: (t: Record<string, Record<string, unknown>>) => void): void {
  const tokens = JSON.parse(read(dir, TOKENS)) as Record<string, Record<string, unknown>>;
  mutate(tokens);
  writeFileSync(file(dir, TOKENS), canonicalStringify(tokens));
}

interface Snapshot { bytes: string; mtimeMs: number }
function snapshot(dir: string): Record<string, Snapshot> {
  const snap: Record<string, Snapshot> = {};
  for (const name of [TOKENS, REGISTRY, MANIFEST, FIGMA_REGISTRY]) {
    if (!existsSync(file(dir, name))) continue;
    snap[name] = { bytes: read(dir, name), mtimeMs: statSync(file(dir, name)).mtimeMs };
  }
  return snap;
}
function pause(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
const hashOf = (dir: string, name: string): string => canonicalHash(JSON.parse(read(dir, name)));

const reseal = (dir: string, extra: string[] = []): Out => capture(["ds", "reseal", "--dir", dir, ...extra]);
interface Envelope { ok: boolean; command: string; data?: Record<string, unknown>; error?: { code: string; message: string } }
const resealJson = (dir: string, extra: string[] = []): { code: number; env: Envelope } => {
  const r = reseal(dir, [...extra, "--json"]);
  return { code: r.code, env: JSON.parse(r.out) as Envelope };
};

describe("ui ds reseal — preview (default)", () => {
  it("prints the manifest and current hash of the drifted file, exits 0, writes nothing (bytes and mtimes)", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const manifestHash = loadManifest(file(dir, MANIFEST)).registryHash;
    const currentHash = hashOf(dir, REGISTRY);
    expect(currentHash).not.toBe(manifestHash);
    const before = snapshot(dir);
    pause(30);

    const r = reseal(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain(manifestHash);
    expect(r.out).toContain(currentHash);
    expect(r.out).toContain(REGISTRY);
    expect(r.out).toMatch(/preview/i);
    expect(r.out).toContain("--apply --reason");
    expect(snapshot(dir)).toEqual(before);
  });

  it("reports both files when tokens and registry drifted, with current counts and no invented 'before'", () => {
    const dir = sealedProject();
    driftTokens(dir);
    driftRegistry(dir);
    const { code, env } = resealJson(dir);
    expect(code).toBe(0);
    const drift = env.data!["drift"] as { file: string; path: string; manifestHash: string; currentHash: string; unit: string; before: unknown; after: number }[];
    expect(drift.map((d) => d.file)).toEqual(["tokens", "registry"]);
    expect(drift[0]).toMatchObject({ path: TOKENS, currentHash: hashOf(dir, TOKENS), unit: "tokens", before: null });
    expect(drift[1]).toMatchObject({ path: REGISTRY, currentHash: hashOf(dir, REGISTRY), unit: "components", before: null });
    const registry = JSON.parse(read(dir, REGISTRY)) as { components: unknown[] };
    expect(drift[1]!.after).toBe(registry.components.length);
    expect(drift[0]!.after).toBeGreaterThan(0);
  });

  it("--json envelope: ok, command, mode preview, applied false, generation untouched", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const gen = loadManifest(file(dir, MANIFEST)).generation;
    const { code, env } = resealJson(dir);
    expect(code).toBe(0);
    expect(env).toMatchObject({ ok: true, command: "ds reseal", data: { mode: "preview", applied: false, nothingToReseal: false, generation: gen } });
  });

  it("--reason without --apply is still a preview and writes nothing", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const before = snapshot(dir);
    pause(30);
    const { code, env } = resealJson(dir, ["--reason", "because"]);
    expect(code).toBe(0);
    expect(env.data!["mode"]).toBe("preview");
    expect(snapshot(dir)).toEqual(before);
  });
});

describe("ui ds reseal — untampered store", () => {
  it("says nothing to reseal, exits 0, and --apply is a no-op (no changelog entry, manifest bytes unchanged)", () => {
    const dir = sealedProject();
    const before = snapshot(dir);
    pause(30);
    const preview = reseal(dir);
    expect(preview.code).toBe(0);
    expect(preview.out).toMatch(/nothing to reseal/i);

    const applied = resealJson(dir, ["--apply", "--reason", "no drift"]);
    expect(applied.code).toBe(0);
    expect(applied.env.data).toMatchObject({ nothingToReseal: true, applied: false });
    expect(snapshot(dir)).toEqual(before);
  });
});

describe("ui ds reseal --apply", () => {
  it("without --reason: named error, non-zero exit, nothing written", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const before = snapshot(dir);
    pause(30);
    const { code, env } = resealJson(dir, ["--apply"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("RESEAL_REASON_REQUIRED");
    expect(snapshot(dir)).toEqual(before);
    const text = reseal(dir, ["--apply"]);
    expect(text.code).not.toBe(0);
    expect(text.err).toContain("--reason");
  });

  it.each([["empty", ""], ["whitespace", "   \t "]])("with an %s --reason: same named error", (_label, reason) => {
    const dir = sealedProject();
    driftRegistry(dir);
    const before = snapshot(dir);
    const { code, env } = resealJson(dir, ["--apply", `--reason=${reason}`]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("RESEAL_REASON_REQUIRED");
    expect(snapshot(dir)).toEqual(before);
  });

  it("a bare --reason (no value) is the same named error", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const { code, env } = resealJson(dir, ["--reason", "--apply"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("RESEAL_REASON_REQUIRED");
  });

  it("requires the reason even when there is nothing to reseal", () => {
    const dir = sealedProject();
    const { code, env } = resealJson(dir, ["--apply"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("RESEAL_REASON_REQUIRED");
  });

  it("rejects a reason longer than the 256 chars the manifest schema allows", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const before = snapshot(dir);
    const { code, env } = resealJson(dir, ["--apply", "--reason", "x".repeat(257)]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("BAD_ARG");
    expect(snapshot(dir)).toEqual(before);
  });

  it("with --reason: the store loads clean (ds status exit 0) and store files keep their bytes", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    expect(capture(["ds", "status", "--dir", dir]).code).toBe(1);
    const before = snapshot(dir);

    const { code, env } = resealJson(dir, ["--apply", "--reason", "registry imported outside the CLI"]);
    expect(code).toBe(0);
    expect(env.data).toMatchObject({ mode: "apply", applied: true, nothingToReseal: false });

    expect(capture(["ds", "status", "--dir", dir]).code).toBe(0);
    expect(read(dir, TOKENS)).toBe(before[TOKENS]!.bytes);
    expect(read(dir, REGISTRY)).toBe(before[REGISTRY]!.bytes);
    const m = loadManifest(file(dir, MANIFEST));
    expect(m.registryHash).toBe(hashOf(dir, REGISTRY));
    expect(m.compiledHash).toBe(JSON.parse(before[MANIFEST]!.bytes).compiledHash);
  });

  it("appends ONE changelog entry with the reason and old→new hash per drifted file, and bumps generation", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    driftTokens(dir);
    const old = loadManifest(file(dir, MANIFEST));
    const newTokensHash = hashOf(dir, TOKENS);
    const newRegistryHash = hashOf(dir, REGISTRY);

    expect(reseal(dir, ["--apply", "--reason", "owner-approved import"]).code).toBe(0);

    const m = loadManifest(file(dir, MANIFEST));
    expect(m.generation).toBe(old.generation + 1);
    expect(m.changelog).toHaveLength(old.changelog.length + 1);
    const entry = m.changelog.at(-1)!;
    expect(entry).toMatchObject({ kind: "reseal", by: "ui ds reseal", reason: "owner-approved import" });
    expect(entry.path).toBe(`${TOKENS},${REGISTRY}`);
    expect(entry.from).toBe(`tokens=${old.compiledHash}; registry=${old.registryHash}`);
    expect(entry.to).toBe(`tokens=${newTokensHash}; registry=${newRegistryHash}`);
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
    expect({ ...m, changelog: [], generation: 0, compiledHash: "", registryHash: "" })
      .toEqual({ ...old, changelog: [], generation: 0, compiledHash: "", registryHash: "" });
  });

  it("a single drifted file names only that file in the entry", () => {
    const dir = sealedProject();
    driftTokens(dir);
    const old = loadManifest(file(dir, MANIFEST));
    expect(reseal(dir, ["--apply", "--reason", "token edit"]).code).toBe(0);
    const entry = loadManifest(file(dir, MANIFEST)).changelog.at(-1)!;
    expect(entry.path).toBe(TOKENS);
    expect(entry.from).toBe(`tokens=${old.compiledHash}`);
    expect(entry.to).toBe(`tokens=${hashOf(dir, TOKENS)}`);
  });

  it("is idempotent: a second apply is a no-op (no second entry, manifest bytes unchanged)", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    expect(reseal(dir, ["--apply", "--reason", "once"]).code).toBe(0);
    const after = snapshot(dir);
    pause(30);
    const again = resealJson(dir, ["--apply", "--reason", "twice"]);
    expect(again.code).toBe(0);
    expect(again.env.data!["nothingToReseal"]).toBe(true);
    expect(snapshot(dir)).toEqual(after);
  });

  it("text mode names the new generation and the file it re-sealed", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const gen = loadManifest(file(dir, MANIFEST)).generation;
    const r = reseal(dir, ["--apply", "--reason", "x"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(REGISTRY);
    expect(r.out).toContain(`gen ${gen + 1}`);
  });

  it("the reseal changelog kind folds into 'ds docs' history with its reason", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    reseal(dir, ["--apply", "--reason", "folded reason"]);
    const model = buildChangelog(loadManifest(file(dir, MANIFEST)).changelog);
    expect(model.entries.some((e) => e.text.includes("folded reason") && e.text.includes(REGISTRY))).toBe(true);
  });
});

describe("ui ds reseal — structurally broken files are refused (hash drift only)", () => {
  const broken: [string, (dir: string) => void, string][] = [
    ["tokens: not JSON", (d) => writeFileSync(file(d, TOKENS), "{ not json"), "DS_TAMPERED"],
    ["tokens: schema violation", (d) => setTokens(d, (t) => { t["color"] = { bad: { $type: "color" } }; }), "BAD_TOKEN"],
    ["tokens: dangling alias", (d) => setTokens(d, (t) => { t["color"] = { ...t["color"], ghost: { $type: "color", $value: "{color.does-not-exist}" } }; }), "DANGLING_ALIAS"],
    ["tokens: alias cycle", (d) => setTokens(d, (t) => {
      t["color"] = { ...t["color"], ca: { $type: "color", $value: "{color.cb}" }, cb: { $type: "color", $value: "{color.ca}" } };
    }), "ALIAS_CYCLE"],
    ["registry: not JSON", (d) => writeFileSync(file(d, REGISTRY), "[[["), "BAD_REGISTRY"],
    ["registry: schema violation", (d) => writeFileSync(file(d, REGISTRY), canonicalStringify({ version: "1.0.0" })), "BAD_REGISTRY"],
  ];

  it.each(broken)("%s: refused in preview and apply, error named, nothing written", (_label, breakIt, code) => {
    const dir = sealedProject();
    breakIt(dir);
    const before = snapshot(dir);
    pause(30);
    for (const extra of [[], ["--apply", "--reason", "should be refused"]]) {
      const { code: exit, env } = resealJson(dir, extra);
      expect(exit).not.toBe(0);
      expect(env.ok).toBe(false);
      expect(env.error?.code).toBe(code);
      expect(env.error?.message).toMatch(/reseal refused/i);
      const text = reseal(dir, extra);
      expect(text.code).not.toBe(0);
      expect(text.err).toMatch(/reseal refused/i);
    }
    expect(snapshot(dir)).toEqual(before);
  });
});

describe("ui ds reseal — registry file switch is not hash drift", () => {
  /** The resolver now prefers figma-component-registry.json; the sealed component-registry.json is still on disk. */
  function switchRegistry(dir: string): void {
    writeFileSync(file(dir, FIGMA_REGISTRY), canonicalStringify({ version: "1.0.0", components: [] }));
  }

  it("preview names the sealed file and the resolved file (hashes, counts) and offers no --apply", () => {
    const dir = sealedProject();
    const sealed = loadManifest(file(dir, MANIFEST)).registryHash;
    const sealedCount = (JSON.parse(read(dir, REGISTRY)) as { components: unknown[] }).components.length;
    switchRegistry(dir);
    const before = snapshot(dir);
    const r = reseal(dir);
    expect(r.code).toBe(0);
    for (const needle of [REGISTRY, FIGMA_REGISTRY, sealed, hashOf(dir, FIGMA_REGISTRY), String(sealedCount)]) expect(r.out).toContain(needle);
    expect(r.out).toMatch(/switch/i);
    expect(r.out).not.toContain("--apply --reason");
    const { env } = resealJson(dir);
    expect(env.data!["registrySwitch"]).toMatchObject({
      sealed: { path: REGISTRY, hash: sealed, components: sealedCount },
      resolved: { path: FIGMA_REGISTRY, hash: hashOf(dir, FIGMA_REGISTRY), components: 0 },
    });
    expect(env.data!["drift"]).toEqual([]);
    expect(snapshot(dir)).toEqual(before);
  });

  it("--apply refuses with RESEAL_REGISTRY_SWITCHED and writes nothing", () => {
    const dir = sealedProject();
    switchRegistry(dir);
    const before = snapshot(dir);
    const { code, env } = resealJson(dir, ["--apply", "--reason", "x"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("RESEAL_REGISTRY_SWITCHED");
    expect(env.error?.message).toContain(REGISTRY);
    expect(snapshot(dir)).toEqual(before);
    expect(reseal(dir, ["--apply", "--reason", "x"]).code).not.toBe(0);
  });

  it("a switch is only claimed when the default file still matches the sealed hash", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    switchRegistry(dir);
    const { code, env } = resealJson(dir);
    expect(code).toBe(0);
    expect(env.data!["registrySwitch"]).toBeUndefined();
    expect((env.data!["drift"] as { path: string }[]).map((d) => d.path)).toEqual([FIGMA_REGISTRY]);
  });

  it("a plain edit of the sealed registry file (no switch) is still ordinary drift", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    expect(resealJson(dir).env.data!["registrySwitch"]).toBeUndefined();
  });
});

describe("ui ds reseal — every registry component must be an object with a non-empty name", () => {
  const cases: [string, unknown][] = [
    ["null", null], ["a number", 42], ["a string", "Button"], ["an array", []],
    ["no name", { category: "display" }], ["an empty name", { name: "" }], ["a non-string name", { name: 7 }],
  ];
  it.each(cases)("a registry component that is %s is refused in preview and apply, nothing written", (_label, component) => {
    const dir = sealedProject();
    const registry = JSON.parse(read(dir, REGISTRY)) as { components: unknown[] };
    registry.components.push(component);
    writeFileSync(file(dir, REGISTRY), canonicalStringify(registry));
    const before = snapshot(dir);
    for (const extra of [[], ["--apply", "--reason", "x"]]) {
      const { code, env } = resealJson(dir, extra);
      expect(code).not.toBe(0);
      expect(env.error?.code).toBe("BAD_REGISTRY");
      expect(env.error?.message).toMatch(/reseal refused/i);
      expect(env.error?.message).toMatch(new RegExp(`component #${registry.components.length - 1}\\b`));
    }
    expect(snapshot(dir)).toEqual(before);
  });
});

describe("ui ds reseal — terminal safety", () => {
  it("text mode shows control characters of the reason escaped; the manifest keeps the reason as typed", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const reason = "line1\u001b[31mRED\u0007";
    const r = reseal(dir, ["--apply", "--reason", reason]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("\u001b");
    expect(r.out).not.toContain("\u0007");
    expect(r.out).toContain("\\x1b");
    expect(loadManifest(file(dir, MANIFEST)).changelog.at(-1)!.reason).toBe(reason);
  });
});

describe("ui ds reseal — argument and store errors", () => {
  it("rejects unknown flags", () => {
    const dir = sealedProject();
    const { code, env } = resealJson(dir, ["--force"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("UNKNOWN_FLAG");
  });

  it("--apply takes no value (a swallowed positional is not silently accepted)", () => {
    const dir = sealedProject();
    driftRegistry(dir);
    const before = snapshot(dir);
    const { code, env } = resealJson(dir, ["--apply=yes", "--reason", "x"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("BAD_ARG");
    expect(snapshot(dir)).toEqual(before);
  });

  it("reports DS_NOT_FOUND when the directory holds no design system", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-ds-reseal-empty-"));
    scratch.push(dir);
    const { code, env } = resealJson(dir);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("DS_NOT_FOUND");
  });

  it("a tampered MANIFEST is still refused (BAD_MANIFEST), never rewritten", () => {
    const dir = sealedProject();
    writeFileSync(file(dir, MANIFEST), "{ nope");
    const before = snapshot(dir);
    const { code, env } = resealJson(dir, ["--apply", "--reason", "x"]);
    expect(code).not.toBe(0);
    expect(env.error?.code).toBe("BAD_MANIFEST");
    expect(snapshot(dir)).toEqual(before);
  });
});

describe("reseal() adopt option — core guards, tested directly", () => {
  const entry = { kind: "reseal", by: "ui ds reseal", reason: "t" } as const;
  const nowIso = "2026-10-29T00:00:00.000Z";

  it("refuses a kit-bound manifest (the kit lock pins the bytes) and writes nothing", () => {
    const dir = sealedProject();
    const paths = pathsForDir(join(dir, "design"));
    const ds = loadDesignSystem(paths);
    const kitBound = { ...ds, manifest: { ...ds.manifest, kit: { version: 1 as const, lockHash: `sha256-${"A".repeat(43)}` } } };
    const before = read(dir, MANIFEST);
    expect(() => resealCore({ ds: kitBound, paths, adopt: { registryHash: "sha256-x" }, entry, nowIso })).toThrow(/kit-bound/);
    expect(read(dir, MANIFEST)).toBe(before);
  });

  it("refuses adopt combined with a content rewrite", () => {
    const dir = sealedProject();
    const paths = pathsForDir(join(dir, "design"));
    const ds = loadDesignSystem(paths);
    const before = read(dir, MANIFEST);
    expect(() => resealCore({ ds, paths, tokens: ds.tokens, adopt: { compiledHash: "sha256-x" }, entry, nowIso })).toThrow(/cannot be combined/);
    expect(read(dir, MANIFEST)).toBe(before);
  });
});
