import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { canonicalHash, canonicalStringify } from "../src/core/ds-manifest.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "ds-guidelines", "basic");
const NOW = "2026-10-15T00:00:00Z";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

function project(): { dir: string; pack: string } {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-seal-"));
  scratch.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  return { dir, pack: join(dir, "design", "guidelines") };
}

/** Add a component to the registry WITHOUT resealing the manifest: the registry hash drifts. */
function driftRegistry(dir: string): { expected: string; actual: string } {
  const path = join(dir, "design", "component-registry.json");
  const registry = JSON.parse(readFileSync(path, "utf8")) as { components: Record<string, unknown>[] };
  registry.components.push({ ...registry.components[0], name: "Button/Added" });
  writeFileSync(path, canonicalStringify(registry));
  const manifest = JSON.parse(readFileSync(join(dir, "design", "ds.manifest.json"), "utf8")) as { registryHash: string };
  return { expected: manifest.registryHash, actual: canonicalHash(registry) };
}
function driftTokens(dir: string): { expected: string; actual: string } {
  const path = join(dir, "design", "design.tokens.json");
  const tokens = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, { $value: unknown }>>;
  tokens["spacing"]!["2"]!.$value = "9px";
  writeFileSync(path, canonicalStringify(tokens));
  const manifest = JSON.parse(readFileSync(join(dir, "design", "ds.manifest.json"), "utf8")) as { compiledHash: string };
  return { expected: manifest.compiledHash, actual: canonicalHash(tokens) };
}

const build = (dir: string, extra: string[] = []) => capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, ...extra]);
const manifestOf = (pack: string): { seal: { status: string; drifted?: { file: string; expected: string; actual: string }[] } } =>
  JSON.parse(readFileSync(join(pack, "guidelines.manifest.json"), "utf8")) as never;

interface Finding { code: string; severity: string; file: string; line: number; message: string }
const checkJson = (dir: string, extra: string[] = []): { code: number; findings: Finding[]; errorCount: number } => {
  const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json", ...extra]);
  const data = (JSON.parse(r.out) as { data: { findings: Finding[]; errorCount: number } }).data;
  // Open slots are expected in a fresh pack (covered by the scenarios tests); these assertions are about everything else.
  return { code: r.code, findings: data.findings.filter((f) => f.code !== "OPEN_QUESTION"), errorCount: data.errorCount };
};

describe("--allow-unsealed (build)", () => {
  it("a verified store records seal.status verified, with no drifted list", () => {
    const { dir, pack } = project();
    expect(build(dir).code).toBe(0);
    expect(manifestOf(pack).seal).toEqual({ status: "verified" });
  });

  it("default: a drifted registry is refused as DS_TAMPERED and nothing is written", () => {
    const { dir, pack } = project();
    driftRegistry(dir);
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_TAMPERED");
    expect(existsSync(pack)).toBe(false);
  });

  it("with --allow-unsealed the pack is written and the manifest names the drifted file with both hashes", () => {
    const { dir, pack } = project();
    const hashes = driftRegistry(dir);
    const r = build(dir, ["--allow-unsealed"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^seal: unverified — design\/component-registry\.json drifted from its sealed hash$/m);
    expect(manifestOf(pack).seal).toEqual({
      status: "unverified",
      drifted: [{ file: "design/component-registry.json", expected: hashes.expected, actual: hashes.actual }],
    });
    // The pack is built from the store as it is now (the added component is in it).
    expect(readFileSync(join(pack, "components.md"), "utf8")).toMatch(/^- `component:Button\/Added` /m);
  });

  it("every drifted file is listed, sorted by path", () => {
    const { dir, pack } = project();
    const reg = driftRegistry(dir);
    const tok = driftTokens(dir);
    expect(build(dir, ["--allow-unsealed"]).code).toBe(0);
    expect(manifestOf(pack).seal.drifted).toEqual([
      { file: "design/component-registry.json", expected: reg.expected, actual: reg.actual },
      { file: "design/design.tokens.json", expected: tok.expected, actual: tok.actual },
    ]);
  });

  it("--json envelopes the seal state", () => {
    const { dir } = project();
    driftRegistry(dir);
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--allow-unsealed", "--json"]);
    expect(r.code).toBe(0);
    const data = (JSON.parse(r.out) as { data: { seal: { status: string } } }).data;
    expect(data.seal.status).toBe("unverified");
  });

  it("does not bypass anything but hash drift: unreadable JSON and a missing store still fail", () => {
    const broken = project();
    writeFileSync(join(broken.dir, "design", "design.tokens.json"), "{ nope");
    const r1 = capture(["ds", "guidelines", "build", "--dir", broken.dir, "--allow-unsealed", "--json"]);
    expect(JSON.parse(r1.out).error.code).toBe("DS_TAMPERED");
    const empty = mkdtempSync(join(tmpdir(), "ease-guidelines-seal-empty-"));
    scratch.push(empty);
    const r2 = capture(["ds", "guidelines", "build", "--dir", empty, "--allow-unsealed", "--json"]);
    expect(JSON.parse(r2.out).error.code).toBe("DS_NOT_FOUND");
  });

  it("the flag takes no value: a swallowed action word is a BAD_ARG, not a silent no-op", () => {
    const { dir } = project();
    const r = capture(["ds", "guidelines", "--allow-unsealed", "build", "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
    expect(JSON.parse(r.out).error.message).toMatch(/--allow-unsealed takes no value \(it swallowed 'build'\)/);
  });
});

describe("--allow-unsealed (check)", () => {
  it("default: check on a drifted store is DS_TAMPERED", () => {
    const { dir } = project();
    build(dir);
    driftRegistry(dir);
    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_TAMPERED");
  });

  it("with the flag, check passes with a SEAL_UNVERIFIED warning, not an error", () => {
    const { dir } = project();
    build(dir);
    driftRegistry(dir);
    const j = checkJson(dir, ["--allow-unsealed"]);
    expect(j.code).toBe(0);
    expect(j.errorCount).toBe(0);
    expect(j.findings.filter((f) => f.code !== "UNKNOWN_NAME")).toEqual([
      expect.objectContaining({ code: "SEAL_UNVERIFIED", severity: "warning", file: "design/component-registry.json", line: 1 }),
    ]);
    const text = capture(["ds", "guidelines", "check", "--dir", dir, "--allow-unsealed"]);
    expect(text.code).toBe(0);
    expect(text.out).toMatch(/^ds guidelines check: .* — 0 error\(s\), \d+ warning\(s\)$/m);
    expect(text.out).toMatch(/^ {2}! \[SEAL_UNVERIFIED\] design\/component-registry\.json:1: /m);
  });

  it("a verified store has no warning and keeps the plain header", () => {
    const { dir } = project();
    build(dir);
    const text = capture(["ds", "guidelines", "check", "--dir", dir, "--allow-unsealed"]);
    expect(text.code).toBe(0);
    expect(text.out).toMatch(/^ds guidelines check: .* — 0 error\(s\)(, \d+ warning\(s\))?$/m);
    expect(text.out).not.toMatch(/SEAL_UNVERIFIED/);
  });

  it("warnings never turn into errors for other findings: a real error still exits 1", () => {
    const { dir, pack } = project();
    build(dir);
    driftRegistry(dir);
    writeFileSync(join(pack, "components.md"), `${readFileSync(join(pack, "components.md"), "utf8")}\nUse \`component:Buton/Primary\`.\n`);
    const j = checkJson(dir, ["--allow-unsealed"]);
    expect(j.code).toBe(1);
    expect(j.errorCount).toBe(1);
    expect(j.findings.map((f) => f.code).sort()).toEqual(["SEAL_UNVERIFIED", "UNKNOWN_NAME"]);
  });
});
