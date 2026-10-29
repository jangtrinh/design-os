/**
 * `ui ds reseal` when both registry files exist and the alternate one is the one in use: the
 * default `component-registry.json` is then present but never loaded, and the preview / apply
 * output must say so instead of showing the default file's sealed hash next to the alternate
 * file's name. The note is absent whenever there is nothing shadowed. Fixtures are real sealed
 * stores (`ds init`); temp dirs are removed after each test.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { canonicalStringify } from "../src/core/ds-manifest.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;
const REGISTRY = "component-registry.json";
const FIGMA_REGISTRY = "figma-component-registry.json";

interface Out { code: number; out: string }
function capture(args: string[]): Out {
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

function sealedProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ease-ds-reseal-shadow-"));
  scratch.push(dir);
  expect(capture(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "test",
    "--dir", dir, "--persona-data", PERSONA_DATA]).code).toBe(0);
  return dir;
}
const file = (dir: string, name: string): string => join(dir, "design", name);
const defaultCount = (dir: string): number =>
  (JSON.parse(readFileSync(file(dir, REGISTRY), "utf8")) as { components: unknown[] }).components.length;

/** Edit the sealed default registry so it drifts. */
function driftDefaultRegistry(dir: string): void {
  const registry = JSON.parse(readFileSync(file(dir, REGISTRY), "utf8")) as { components: Record<string, unknown>[] };
  registry.components.push({ ...registry.components[0], name: "Zzz/Added-Behind-The-Seal" });
  writeFileSync(file(dir, REGISTRY), canonicalStringify(registry));
}
/** The alternate file makes the resolver skip the default one. */
function addEmptyAlternateRegistry(dir: string): void {
  writeFileSync(file(dir, FIGMA_REGISTRY), canonicalStringify({ version: "1.0.0", components: [] }));
}
/** The repro: default registry drifted AND an empty alternate file shadows it. */
function shadowedAndDrifted(): string {
  const dir = sealedProject();
  driftDefaultRegistry(dir);
  addEmptyAlternateRegistry(dir);
  return dir;
}

const noteFor = (dir: string): string =>
  `note: ${REGISTRY} also present (${defaultCount(dir)} components), not loaded — the resolved registry is ${FIGMA_REGISTRY}`;
const reseal = (dir: string, extra: string[] = []): Out => capture(["ds", "reseal", "--dir", dir, ...extra]);
interface Envelope { ok: boolean; data?: Record<string, unknown> }
const resealJson = (dir: string, extra: string[] = []): { code: number; env: Envelope } => {
  const r = reseal(dir, [...extra, "--json"]);
  return { code: r.code, env: JSON.parse(r.out) as Envelope };
};

describe("ui ds reseal — a default registry shadowed by the alternate file", () => {
  it("text preview says the default file is present, how many components it has, and that it is not loaded", () => {
    const dir = shadowedAndDrifted();
    const r = reseal(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain(noteFor(dir));
  });

  it("--json preview carries shadowedRegistry { file, components }", () => {
    const dir = shadowedAndDrifted();
    const { code, env } = resealJson(dir);
    expect(code).toBe(0);
    expect(env.data!["shadowedRegistry"]).toEqual({ file: REGISTRY, components: defaultCount(dir) });
  });

  it("text apply output carries the same note, and the 0-component alternate file is what was sealed", () => {
    const dir = shadowedAndDrifted();
    const r = reseal(dir, ["--apply", "--reason", "adopt the alternate registry"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(noteFor(dir));
  });

  it("--json apply carries shadowedRegistry too", () => {
    const dir = shadowedAndDrifted();
    const { code, env } = resealJson(dir, ["--apply", "--reason", "adopt the alternate registry"]);
    expect(code).toBe(0);
    expect(env.data!["shadowedRegistry"]).toEqual({ file: REGISTRY, components: defaultCount(dir) });
  });

  it("an unreadable shadowed file is reported as present, unreadable — no crash", () => {
    const dir = shadowedAndDrifted();
    writeFileSync(file(dir, REGISTRY), "{ this is not json");
    const r = reseal(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`note: ${REGISTRY} also present (unreadable), not loaded — the resolved registry is ${FIGMA_REGISTRY}`);
    const { env } = resealJson(dir);
    expect(env.data!["shadowedRegistry"]).toEqual({ file: REGISTRY, components: null });
  });

  it("no note when only the default registry file exists", () => {
    const dir = sealedProject();
    driftDefaultRegistry(dir);
    const r = reseal(dir);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("also present");
    expect(resealJson(dir).env.data!["shadowedRegistry"]).toBeUndefined();
    const applied = reseal(dir, ["--apply", "--reason", "x"]);
    expect(applied.code).toBe(0);
    expect(applied.out).not.toContain("also present");
    expect(resealJson(dir, ["--apply", "--reason", "x"]).env.data!["shadowedRegistry"]).toBeUndefined();
  });

  it("no note when only the alternate registry file exists", () => {
    const dir = sealedProject();
    const registry = JSON.parse(readFileSync(file(dir, REGISTRY), "utf8")) as { components: Record<string, unknown>[] };
    writeFileSync(file(dir, FIGMA_REGISTRY), canonicalStringify({ ...registry, components: [...registry.components, { ...registry.components[0], name: "Zzz/Added" }] }));
    rmSync(file(dir, REGISTRY));
    const r = reseal(dir);
    expect(r.out).not.toContain("also present");
    expect(resealJson(dir).env.data!["shadowedRegistry"]).toBeUndefined();
  });

  it("no note when a tokens-only drift leaves the default registry as the loaded one", () => {
    const dir = sealedProject();
    const tokens = JSON.parse(readFileSync(file(dir, "design.tokens.json"), "utf8")) as Record<string, Record<string, { $value: unknown }>>;
    const group = tokens["color"]!;
    group[Object.keys(group)[0]!]!.$value = "#010203";
    writeFileSync(file(dir, "design.tokens.json"), canonicalStringify(tokens));
    const r = reseal(dir);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("also present");
    expect(resealJson(dir).env.data!["shadowedRegistry"]).toBeUndefined();
  });
});
