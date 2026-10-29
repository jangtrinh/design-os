/**
 * `ui ds reseal` on a kit-bound store, through the CLI. The kit lock pins the bytes of the
 * store files, so a drifted kit store cannot be resealed: preview and apply must both refuse
 * with the same named error and write nothing. The fixture is the one tests/ds-kit-integration.test.ts
 * adopts through `ds kit adopt`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { prepareKit } from "../src/core/ds-kit-validate.js";
import { emitKitTheme } from "../src/core/ds-kit-theme.js";
import { hashKitBytes } from "../src/core/ds-kit-files.js";

const roots: string[] = [];
const temp = (): string => { const root = fs.mkdtempSync(join(tmpdir(), "ease-kit-reseal-")); roots.push(root); return root; };
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
interface Result { code: number; ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } }
function cli(args: string[]): Result {
  let out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { out += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const code = run([...args, "--json"]);
  vi.restoreAllMocks();
  return { code, ...(JSON.parse(out) as Omit<Result, "code">) };
}
const put = (root: string, path: string, value: unknown): void => {
  fs.mkdirSync(join(root, path, ".."), { recursive: true });
  fs.writeFileSync(join(root, path), typeof value === "string" ? value : canonicalStringify(value));
};
const read = (root: string, path: string): Buffer => fs.readFileSync(join(root, path));

/** Inode, mtime and content hash of every file under root: any write shows up. */
function filesystemState(root: string): Record<string, string> {
  const state: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name, absolute = join(dir, entry.name), stat = fs.lstatSync(absolute);
      state[path] = `${stat.ino}:${stat.mtimeMs}:${stat.isDirectory() ? "directory" : hashKitBytes(fs.readFileSync(absolute))}`;
      if (stat.isDirectory()) walk(absolute, path + "/");
    }
  };
  walk(root, ""); return state;
}

/** Host evidence here exercises byte binding, not a claim of reviewed production UI. */
function candidate(): string {
  const root = temp();
  const tokens = { color: { canvas: { $type: "color", $value: "#ffffff" }, ink: { $type: "color", $value: "#111111" } } };
  const components = Array.from({ length: 41 }, (_, i) => ({ name: `Owner Item ${i}`, category: "display", markup: `<div>Owner Item ${i}</div>`, tokensUsed: ["color.ink"], variants: ["Size=Small"], states: ["default"] }));
  const source = { version: "0.1.0", components };
  put(root, "source/registry.json", source); put(root, "source/tokens.json", tokens);
  put(root, "src/theme.css", emitKitTheme(tokens, { background: "color.canvas", foreground: "color.ink" }));
  put(root, "package.json", { name: "owner-test-kit", private: true, type: "module" });
  put(root, "package-lock.json", { name: "owner-test-kit", lockfileVersion: 3, packages: {} });
  put(root, "src/components.tsx", components.map((c, i) => `export function OwnerItem${i}() { return <div>${c.name}</div>; }`).join("\n"));
  const cases = [{ id: "build", kind: "build", subject: "kit", description: "Test-host build evidence and import closure" }, { id: "kit-review", kind: "review", subject: "kit", description: "Source scope, tuple/state facts and owner fidelity reviewed by test host" }];
  const mappings = components.map((component, index) => {
    put(root, `src/item-${index}.html`, component.markup);
    const ids = ["render", "review", "behavior"].map((kind) => `${kind}-${index}`);
    for (const kind of ["render", "review", "behavior"]) cases.push({ id: `${kind}-${index}`, kind, subject: `owner:${index}`, description: `${kind}: Size=Small default for ${component.name}; source tuple/state facts` });
    return { sourceId: `owner:${index}`, name: component.name, disposition: "component", implementation: { path: "src/components.tsx", export: `OwnerItem${index}`, strategy: "custom", primitives: [] }, markup: `src/item-${index}.html`, variants: ["Size=Small"], states: ["default"], cases: ids };
  });
  const artifacts = ["source/registry.json", "source/tokens.json", "src/theme.css", "src/components.tsx", "package.json", "package-lock.json", ...components.map((_, index) => `src/item-${index}.html`)];
  put(root, "kit.json", { version: 1, name: "Owner DS — Exact Name", intent: "Faithful owner test kit", target: "react-shadcn-tailwind", minimumComponents: 25,
    sources: [{ id: "owner", kind: "registry", path: "source/registry.json", hash: hashKitBytes(read(root, "source/registry.json")), scope: "complete", limitations: [] }],
    tokens: "source/tokens.json", theme: "src/theme.css", aliases: { background: "color.canvas", foreground: "color.ink" }, mappings, artifacts, cases, evidence: "evidence/receipt.json" });
  const prepared = prepareKit(root);
  expect(prepared.complete, JSON.stringify(prepared.findings)).toBe(true);
  const receiptCases = cases.map((testCase) => {
    put(root, `evidence/${testCase.id}.txt`, `Test-host byte-binding evidence: ${testCase.description}\n`);
    return { id: testCase.id, outcome: "passed", files: [`evidence/${testCase.id}.txt`], note: testCase.description };
  });
  put(root, "evidence/receipt.json", { version: 1, contentHash: prepared.contentHash, cases: receiptCases });
  return root;
}
function adopted(): { source: string; root: string } {
  const source = candidate(), root = join(temp(), "adopted");
  const result = cli(["ds", "kit", "adopt", source, "--out", root, "--now", "2026-10-09T00:00:00.000Z"]);
  expect(result.code, JSON.stringify(result)).toBe(0);
  return { source, root };
}

/** Both ways a kit-bound store can disagree with its manifest hash. */
const tamper: [string, (root: string) => void][] = [
  ["a registry component added behind the seal (kit lock mismatch)", (root) => {
    const path = join(root, "design/component-registry.json");
    const registry = JSON.parse(fs.readFileSync(path, "utf8")) as { components: Record<string, unknown>[] };
    registry.components.push({ ...registry.components[0], name: "Owner Item Extra" });
    fs.writeFileSync(path, canonicalStringify(registry));
  }],
  ["only the manifest registry hash edited (files still match the lock)", (root) => {
    const path = join(root, "design/ds.manifest.json");
    const manifest = JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
    manifest["registryHash"] = `sha256-${"A".repeat(43)}`;
    fs.writeFileSync(path, canonicalStringify(manifest));
  }],
];

describe("ui ds reseal on a kit-bound store", () => {
  it.each(tamper)("%s: preview and apply both refuse, naming the kit lock, and write nothing", (_label, breakIt) => {
    const { root } = adopted();
    breakIt(root);
    const before = filesystemState(root);
    for (const extra of [[], ["--apply", "--reason", "x"]]) {
      const r = cli(["ds", "reseal", "--dir", root, ...extra]);
      expect(r.code).not.toBe(0);
      expect(r.error?.code).toBe("RESEAL_KIT_BOUND");
      expect(r.error?.message).toMatch(/kit\.lock\.json/);
      expect(r.error?.message).not.toMatch(/fix the file first/);
      expect(r.data).toBeUndefined();
    }
    expect(filesystemState(root)).toEqual(before);
  });

  it("an untampered kit-bound store has nothing to reseal", () => {
    const { root } = adopted();
    const before = filesystemState(root);
    const r = cli(["ds", "reseal", "--dir", root]);
    expect(r.code).toBe(0);
    expect(r.data).toMatchObject({ nothingToReseal: true });
    expect(filesystemState(root)).toEqual(before);
  });
});
