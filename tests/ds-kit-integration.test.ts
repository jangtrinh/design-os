import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { canonicalHash, canonicalStringify, validateManifestShape } from "../src/core/ds-manifest.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir } from "../src/core/design-system.js";
import { lessonRevision, loadLessonEnvironment, preflightLesson } from "../src/core/memory-lesson-evidence.js";
import { validateComponentRecord, validateSourceAuthoredComponentRecord } from "../src/core/registry-store.js";
import { prepareKit } from "../src/core/ds-kit-validate.js";
import { emitKitTheme } from "../src/core/ds-kit-theme.js";
import { hashKitBytes } from "../src/core/ds-kit-files.js";
import { validateKitLock } from "../src/core/ds-kit-seal.js";
import * as figmaApply from "../src/core/figma-apply.js";
import { reseal } from "../src/core/ds-reseal.js";
import type { KitSpec } from "../src/core/ds-kit-types.js";
import type { LessonEntry } from "../src/core/memory-lessons.js";
import type { MemoryEvent } from "../src/core/memory-events.js";

vi.mock("node:fs", async (importOriginal) => ({ ...await importOriginal<typeof import("node:fs")>() }));
vi.mock("../src/core/figma-apply.js", async (importOriginal) => ({ ...await importOriginal<typeof import("../src/core/figma-apply.js")>() }));

const roots: string[] = [];
const temp = (): string => { const root = fs.mkdtempSync(join(tmpdir(), "ease-kit-integration-")); roots.push(root); return root; };
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function cli(args: string[]): { code: number; data: Record<string, unknown>; error?: { code: string; message: string } } {
  let out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { out += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const code = run([...args, "--json"]);
  vi.restoreAllMocks();
  return { code, ...JSON.parse(out) };
}
const put = (root: string, path: string, value: unknown): void => {
  fs.mkdirSync(join(root, path, ".."), { recursive: true });
  fs.writeFileSync(join(root, path), typeof value === "string" ? value : canonicalStringify(value));
};
const read = (root: string, path: string): Buffer => fs.readFileSync(join(root, path));

function filesystemState(root: string): Record<string, string> {
  const state: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name, absolute = join(dir, entry.name), stat = fs.lstatSync(absolute);
      const content = stat.isSymbolicLink() ? `symlink:${fs.readlinkSync(absolute)}` : stat.isDirectory() ? "directory" : hashKitBytes(fs.readFileSync(absolute));
      state[path] = `${stat.ino}:${stat.mtimeMs}:${content}`;
      if (stat.isDirectory()) walk(absolute, path + "/");
    }
  };
  walk(root, ""); return state;
}

/** Host evidence here exercises byte binding, not a claim of reviewed production UI. */
function candidate(nested = false): string {
  const root = temp();
  const tokens = { color: { canvas: { $type: "color", $value: "#ffffff" }, ink: { $type: "color", $value: "#111111" },
    ...(nested && { owner: { muted: { $type: "color", $value: "#777777", $description: "Owner nested swatch",
      $extensions: { "owner.capture": { sourceId: "owner-muted", annotation: "Preserve owner metadata" } } } } }) } };
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
function adopted(nested = false): { source: string; root: string } {
  const source = candidate(nested), root = join(temp(), "adopted");
  const result = cli(["ds", "kit", "adopt", source, "--out", root, "--now", "2026-10-09T00:00:00.000Z"]);
  expect(result.code, JSON.stringify(result)).toBe(0);
  return { source, root };
}

describe("plan input boundaries", () => {
  function inputs(): { root: string; source: string; tokens: string; out: string } {
    const root = temp();
    put(root, "source.json", { components: [{ id: "1:1", name: "Owner exact" }] });
    put(root, "tokens.json", { color: { ink: { $type: "color", $value: "#111111" } } });
    return { root, source: join(root, "source.json"), tokens: join(root, "tokens.json"), out: join(root, "planned") };
  }
  function plan(input: ReturnType<typeof inputs>, name = "Owner") {
    return cli(["ds", "kit", "plan", "--kind", "figma", "--source", input.source, "--tokens", input.tokens, "--name", name, "--out", input.out]);
  }
  it.each(["source", "tokens"] as const)("missing %s reports FILE_NOT_FOUND without reservation", (field) => {
    const input = inputs(); fs.unlinkSync(input[field]);
    expect(plan(input).error?.code).toBe("FILE_NOT_FOUND"); expect(fs.existsSync(input.out)).toBe(false);
  });
  it("other input read errors report READ_ERROR without reservation", () => {
    const input = inputs(), original = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
      if (String(args[0]) === input.source) throw Object.assign(new Error("read denied"), { code: "EACCES" });
      return original(...args);
    });
    expect(plan(input).error?.code).toBe("READ_ERROR"); expect(fs.existsSync(input.out)).toBe(false);
  });
  it.each(["source", "tokens"] as const)("invalid UTF-8 %s reports BAD_JSON without reservation", (field) => {
    const input = inputs(); fs.writeFileSync(input[field], Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]));
    expect(plan(input).error?.code).toBe("BAD_JSON"); expect(fs.existsSync(input.out)).toBe(false);
  });
  it("malformed JSON reports BAD_JSON without reservation", () => {
    const input = inputs(); fs.writeFileSync(input.source, "{");
    expect(plan(input).error?.code).toBe("BAD_JSON"); expect(fs.existsSync(input.out)).toBe(false);
  });
  it.each([" ", "Owner\u0000", "Owner\u007f", "Owner\ud800", "x".repeat(65)])("invalid owner name %j fails before reservation", (name) => {
    const input = inputs(); expect(plan(input, name).error?.code).toBe("BAD_NAME"); expect(fs.existsSync(input.out)).toBe(false);
  });
  it.each(["name", "id"])("invalid raw %s fails before reservation", (field) => {
    for (const invalid of [" ", "raw\u0000", "raw\u007f", "raw\ud800"]) {
      const input = inputs(); put(input.root, "source.json", { components: [{ id: "1:1", name: "Owner exact", [field]: invalid }] });
      expect(plan(input).error?.code).toBe("BAD_KIT"); expect(fs.existsSync(input.out)).toBe(false);
    }
  });
});

describe("kit CLI integration", () => {
  it("preserves all 41 captured names, raw tokens and bytes through plan/prepare/validate/adopt/verify", () => {
    const { source, root } = adopted();
    const plan = join(temp(), "plan");
    const planned = cli(["ds", "kit", "plan", "--kind", "registry", "--source", join(source, "source/registry.json"), "--tokens", join(source, "source/tokens.json"), "--name", "Owner Name With Spaces", "--out", plan]);
    expect(planned.code).toBe(0); expect(planned.data["capturedIds"]).toHaveLength(41);
    const spec = JSON.parse(read(plan, "kit.json").toString()) as KitSpec;
    expect(spec.mappings.at(-1)).toMatchObject({ sourceId: "owner:40", name: "Owner Item 40", disposition: "unresolved" });
    expect(read(plan, "source/registry.json")).toEqual(read(source, "source/registry.json"));
    const summary = cli(["ds", "kit", "prepare", plan]).data;
    expect(summary).toMatchObject({ complete: false, capturedCount: 41, componentCount: 0 });
    expect(summary["unresolvedIds"]).toContain("owner:40"); expect(summary["unresolvedIds"]).toHaveLength(41);
    for (const key of ["spec", "tokens", "registry"]) expect(summary).not.toHaveProperty(key);
    const before = fs.readdirSync(source).sort();
    const validation = cli(["ds", "kit", "validate", source]);
    expect(validation.code).toBe(0); expect(validation.data).toMatchObject({ status: "verified", componentCount: 41, contentCount: 48, evidenceCount: 126 });
    expect(validation.data).not.toHaveProperty("registry");
    expect(fs.readdirSync(source).sort()).toEqual(before); expect(fs.existsSync(join(source, "kit.lock.json"))).toBe(false);
    expect(read(root, "design/design.tokens.json")).toEqual(read(source, "source/tokens.json"));
    const ds = loadDesignSystem(pathsForDir(join(root, "design")));
    expect(ds.registry.components.map((component) => component.name)).toContain("Owner Item 40"); expect(ds.manifest.createdAt).toBe("2026-10-09T00:00:00.000Z"); expect(validation.data["lockHash"]).toBe(ds.manifest.kit?.lockHash);
    expect(cli(["ds", "kit", "verify", "--dir", root]).data).toMatchObject({ ready: true, kitStatus: "verified" });
    expect(cli(["ds", "status", "--dir", root]).data["kitStatus"]).toBe("verified");
    expect(cli(["ds", "context", "--dir", root, "--format", "json"]).data["kitStatus"]).toBe("verified");
  });
  it("public theme emits approved owner aliases in JSON and plain CSS without writing", () => {
    const source = candidate(), theme = read(source, "src/theme.css"), spec = read(source, "kit.json"), tokens = read(source, "source/tokens.json");
    const before = fs.readdirSync(source).sort();
    expect(cli(["ds", "kit", "theme", source])).toMatchObject({ code: 0, data: { path: "src/theme.css", css: theme.toString() } });
    let css = ""; vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { css += String(chunk); return true; });
    try { expect(run(["ds", "kit", "theme", source])).toBe(0); } finally { vi.restoreAllMocks(); }
    expect(css).toBe(theme.toString()); expect(read(source, "kit.json")).toEqual(spec); expect(read(source, "source/tokens.json")).toEqual(tokens);
    expect(read(source, "src/theme.css")).toEqual(theme); expect(fs.readdirSync(source).sort()).toEqual(before);
    expect(cli(["ds", "kit", "theme", source, "--out", join(source, "other.css")]).error?.code).toBe("UNKNOWN_FLAG"); expect(fs.existsSync(join(source, "other.css"))).toBe(false);
  });
  it("a drafted installed-package flow can emit aliases before evidence is complete", () => {
    const input = candidate(), out = join(temp(), "draft");
    expect(cli(["ds", "kit", "plan", "--kind", "registry", "--source", join(input, "source/registry.json"), "--tokens", join(input, "source/tokens.json"), "--out", out, "--name", "Owner Draft"]).code).toBe(0);
    const spec = JSON.parse(read(out, "kit.json").toString()) as KitSpec; spec.aliases = { background: "color.canvas", foreground: "color.ink" }; put(out, "kit.json", spec);
    const emitted = cli(["ds", "kit", "theme", out]); expect(emitted.code).toBe(0); expect(read(out, "src/theme.css").toString()).not.toBe(emitted.data["css"]);
    put(out, spec.theme, emitted.data["css"]); expect(read(out, "src/theme.css")).toEqual(read(input, "src/theme.css"));
    expect(cli(["ds", "kit", "prepare", out]).data["complete"]).toBe(false);
  });
  it("explicit adoption clocks produce byte-identical manifest births", () => {
    const source = candidate(), parent = temp();
    for (const name of ["one", "two"]) expect(cli(["ds", "kit", "adopt", source, "--out", join(parent, name), "--now", "2026-10-09T00:00:00.000Z"]).code).toBe(0);
    expect(read(join(parent, "one"), "design/ds.manifest.json")).toEqual(read(join(parent, "two"), "design/ds.manifest.json"));
  });
  it("Figma planning preserves every unknown/icon/screen raw ID and its original bytes", () => {
    const input = temp(), out = join(temp(), "plan"), raw = { components: Array.from({ length: 43 }, (_, i) => ({ id: `781:${i}`, name: `${["Unknown", "Icon", "Screen"][i % 3]} ${i}`, type: "COMPONENT", variantAxes: { State: ["Default", "Hover"] } })), tokens: [], styles: [] };
    put(input, "capture.json", raw); put(input, "tokens.json", { color: { ink: { $type: "color", $value: "#111111" } } });
    const result = cli(["ds", "kit", "plan", "--kind", "figma", "--source", join(input, "capture.json"), "--tokens", join(input, "tokens.json"), "--name", "Owner Name", "--out", out]);
    expect(result.code).toBe(0); expect(result.data["capturedIds"]).toEqual(raw.components.map((item) => `owner:${item.id}`));
    expect(read(input, "capture.json")).toEqual(read(out, "source/figma.json")); expect(cli(["ds", "kit", "validate", out]).code).toBe(1);
  });
  it("distinct owner names cannot inflate coverage by reusing one implementation export", () => {
    const source = candidate(), spec = JSON.parse(read(source, "kit.json").toString()) as KitSpec;
    spec.mappings[40]!.implementation = { ...spec.mappings[0]!.implementation! }; put(source, "kit.json", spec);
    const prepared = cli(["ds", "kit", "prepare", source]);
    expect(prepared.data["complete"]).toBe(false); expect(prepared.data["unresolvedIds"]).toContain("owner:40");
    expect(cli(["ds", "kit", "validate", source]).error?.code).toBe("KIT_BLOCKED");
  });
  it.each(["icon", "screen", "excluded"] as const)("ordinary captured item 40 cannot be hidden as %s", (disposition) => {
    const source = candidate(), spec = JSON.parse(read(source, "kit.json").toString()) as KitSpec;
    spec.mappings[40] = { sourceId: "owner:40", name: "Owner Item 40", disposition, reason: "Attempt to hide the missing implementation", cases: ["render-40", "review-40", "behavior-40"] }; put(source, "kit.json", spec);
    const prepared = cli(["ds", "kit", "prepare", source]);
    expect(prepared.data["componentCount"]).toBe(40); expect(prepared.data["complete"]).toBe(false); expect(prepared.data["unresolvedIds"]).toContain("owner:40");
    expect(cli(["ds", "kit", "validate", source]).error?.code).toBe("KIT_BLOCKED");
  });
  it.each(["icon", "screen", "excluded"] as const)("explicit source evidence permits a reviewed %s exception without reusable credit", (disposition) => {
    const source = candidate(), spec = JSON.parse(read(source, "kit.json").toString()) as KitSpec;
    const registry = JSON.parse(read(source, "source/registry.json").toString()) as { components: Array<{ category: string; deprecated?: boolean }> };
    if (disposition === "excluded") registry.components[40]!.deprecated = true; else registry.components[40]!.category = disposition;
    put(source, "source/registry.json", registry); spec.sources[0]!.hash = hashKitBytes(read(source, "source/registry.json"));
    spec.mappings[40] = { sourceId: "owner:40", name: "Owner Item 40", disposition, reason: "Reviewed explicit source classification", cases: ["render-40", "review-40", "behavior-40"] }; put(source, "kit.json", spec);
    expect(cli(["ds", "kit", "prepare", source]).data).toMatchObject({ complete: true, capturedCount: 41, componentCount: 40, unresolvedIds: [] });
  });
  it("prepare counts raw captures independently when item 40 has no mapping", () => {
    const source = candidate(), spec = JSON.parse(read(source, "kit.json").toString()) as KitSpec;
    spec.mappings = spec.mappings.filter((mapping) => mapping.sourceId !== "owner:40"); put(source, "kit.json", spec);
    const prepared = cli(["ds", "kit", "prepare", source]);
    expect(prepared.data).toMatchObject({ complete: false, capturedCount: 41, mappingCount: 40, componentCount: 40 });
    expect(prepared.data["unresolvedIds"]).toContain("owner:40");
    const rejected = cli(["ds", "kit", "validate", source]);
    expect(rejected.error?.code).toBe("KIT_BLOCKED"); expect(rejected.data["findings"]).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: "owner:40" })]));
  });
  it("draft validation preserves findings with exact source IDs", () => {
    const source = candidate(), spec = JSON.parse(read(source, "kit.json").toString()) as KitSpec;
    spec.mappings[40] = { sourceId: "owner:40", name: "Owner Item 40", disposition: "unresolved", reason: "Missing owner implementation" };
    put(source, "kit.json", spec);
    const result = cli(["ds", "kit", "validate", source]);
    expect(result.code).toBe(1); expect(result.data["findings"]).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: "owner:40" })]));
  });
  it.each(["empty", "symlink", "repeat"])("refuses %s destinations without overwriting", (kind) => {
    const { source, root } = adopted(); const out = kind === "repeat" ? root : join(temp(), "occupied");
    if (kind === "empty") fs.mkdirSync(out); if (kind === "symlink") fs.symlinkSync(join(out, "missing"), out);
    const result = cli(["ds", "kit", "adopt", source, "--out", out]);
    expect(result.error?.code).toBe("KIT_TARGET_EXISTS"); expect(fs.lstatSync(out).isSymbolicLink()).toBe(kind === "symlink");
  });
  it("wrong receipt refuses before destination reservation", () => {
    const source = candidate(), out = join(temp(), "out");
    const receipt = JSON.parse(read(source, "evidence/receipt.json").toString()) as { contentHash: string };
    receipt.contentHash = canonicalHash("wrong revision"); put(source, "evidence/receipt.json", receipt);
    expect(cli(["ds", "kit", "adopt", source, "--out", out]).code).toBe(1); expect(fs.existsSync(out)).toBe(false);
  });
  it.each(["src/components.tsx", "src/theme.css", "source/tokens.json", "kit.json", "evidence/receipt.json", "evidence/build.txt"])("ordinary DS consumers detect changed %s", (path) => {
    const { root } = adopted(); fs.appendFileSync(join(root, path), "\nchanged");
    expect(cli(["ds", "status", "--dir", root]).error?.code).toBe("DS_TAMPERED");
    expect(cli(["ds", "context", "--dir", root]).error?.code).toBe("DS_TAMPERED");
  });
  it.each(["src/undeclared.tsx", "src/undeclared.css"])("new %s is tampering and reseal cannot legitimize it", (path) => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), ds = loadDesignSystem(paths);
    put(root, path, "undeclared owner artifact");
    expect(cli(["ds", "status", "--dir", root]).error?.code).toBe("DS_TAMPERED");
    expect(() => reseal({ ds, paths, tokens: ds.tokens, entry: { kind: "change-token", by: "test" }, nowIso: "2026-10-09T00:00:00.000Z" })).toThrow();
  });
  it("a partially written manifest is withdrawn from its owned incomplete reservation", () => {
    const source = candidate(), out = join(temp(), "out"), open = fs.openSync, write = fs.writeFileSync;
    let sealFd = -1;
    vi.spyOn(fs, "openSync").mockImplementation((...args: Parameters<typeof fs.openSync>) => {
      const fd = open(...args); if (String(args[0]) === join(out, "design/ds.manifest.json")) sealFd = fd; return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      if (args[0] === sealFd) { write(sealFd, "{"); throw new Error("injected partial seal failure"); } return write(...args);
    });
    expect(cli(["ds", "kit", "adopt", source, "--out", out]).error?.code).toBe("KIT_ADOPTION_INCOMPLETE");
    expect(fs.existsSync(join(out, "design/ds.manifest.json"))).toBe(false);
  });
  it("partial I/O leaves an unsealed reservation and refuses a retry", () => {
    const source = candidate(), out = join(temp(), "out"); const open = fs.openSync;
    vi.spyOn(fs, "openSync").mockImplementation((...args: Parameters<typeof fs.openSync>) => {
      if (String(args[0]) === join(out, "design/component-registry.json")) throw new Error("injected disk failure"); return open(...args);
    });
    const result = cli(["ds", "kit", "adopt", source, "--out", out]);
    expect(result.error?.code).toBe("KIT_ADOPTION_INCOMPLETE"); expect(result.data["reservation"]).toMatchObject({ path: out, incomplete: true, committed: true, complete: false });
    expect(result.data["reservation"]).toHaveProperty("committedPaths");
    expect(fs.existsSync(join(out, "design/ds.manifest.json"))).toBe(false); expect(read(source, "kit.json")).toEqual(read(out, "kit.json"));
    expect(cli(["ds", "kit", "adopt", source, "--out", out]).error?.code).toBe("KIT_TARGET_EXISTS");
  });
});

describe("bound kit Figma sidecar boundary", () => {
  it("source sidecar facts block adoption while preserving the capture", () => {
    const source = candidate(), spec = JSON.parse(read(source, "kit.json").toString()) as KitSpec;
    const registry = JSON.parse(read(source, "source/registry.json").toString()) as { components: Array<{ figmaNode?: string }> };
    registry.components[40]!.figmaNode = "components/item-40.figma.json"; put(source, "source/registry.json", registry);
    spec.sources[0]!.hash = hashKitBytes(read(source, "source/registry.json")); put(source, "kit.json", spec);
    const captured = read(source, "source/registry.json"), out = join(temp(), "out");
    const result = cli(["ds", "kit", "adopt", source, "--out", out]);
    expect(result.error?.code).toBe("KIT_BLOCKED"); expect(result.data["findings"]).toEqual(expect.arrayContaining([expect.objectContaining({ code: "KIT_FIGMA_SIDECAR", sourceId: "owner:40" })]));
    expect(fs.existsSync(out)).toBe(false); expect(read(source, "source/registry.json")).toEqual(captured);
  });
  it("projected pointers are rejected by lock validation and evolution before writes", () => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), ds = loadDesignSystem(paths), before = filesystemState(root);
    const registry = { ...ds.registry, components: ds.registry.components.map((component, index) => index === 0 ? { ...component, figmaNode: "components/owner.figma.json" } : component) };
    const lock = { ...ds.kit!, registry, registryHash: canonicalHash(registry) };
    lock.contentHash = canonicalHash({ content: lock.content, tokensHash: lock.tokensHash, registryHash: lock.registryHash });
    expect(() => validateKitLock(lock)).toThrow(/figmaNode|sidecar/);
    expect(() => reseal({ ds, paths, registry, entry: { kind: "register", by: "test" }, nowIso: "2026-10-09T00:00:00.000Z" })).toThrow(/figmaNode|sidecar/);
    expect(filesystemState(root)).toEqual(before); expect(loadDesignSystem(paths).kit?.status).toBe("verified");
  });
  it("the loader refuses a stale lock with a rebound unsupported pointer", () => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), ds = loadDesignSystem(paths);
    const registry = { ...ds.registry, components: ds.registry.components.map((component, index) => index === 0 ? { ...component, figmaNode: "components/owner.figma.json" } : component) };
    const lock = { ...ds.kit!, registry, registryHash: canonicalHash(registry), status: "stale" as const, staleReasons: ["Registry changed"] };
    lock.contentHash = canonicalHash({ content: lock.content, tokensHash: lock.tokensHash, registryHash: lock.registryHash });
    put(root, "design/component-registry.json", registry); put(root, "kit.lock.json", lock);
    put(root, "design/ds.manifest.json", { ...ds.manifest, registryHash: lock.registryHash, kit: { version: 1, lockHash: canonicalHash(lock) } });
    expect(cli(["ds", "status", "--dir", root]).error?.code).toBe("DS_TAMPERED"); expect(() => loadDesignSystem(paths)).toThrow(/figmaNode|sidecar/);
  });
  it.each(["registry", "sidecar-only", "no-change"])("reconcile --apply refuses %s writes with no filesystem change", (kind) => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), markup = join(temp(), "owner.html"); fs.writeFileSync(markup, "<button>Owner</button>");
    expect(cli(["registry", "register", "Control/Owner", "--category", "action", "--markup", markup, "--file", paths.registry]).code).toBe(0);
    const frame = { v: 1, ts: 1000, op: kind === "registry" ? "deleted" : "updated", nodeId: "1:1", nodeName: "Control/Owner", nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Owner", fileKey: "owner" };
    put(root, "design/figma.changes.jsonl", JSON.stringify(frame) + "\n");
    const capturePath = join(temp(), "capture.json"); fs.writeFileSync(capturePath, canonicalStringify({ v: 1, captured: [{ nodeId: "1:1", name: "Control/Owner", node: { type: "FRAME", name: "Control/Owner", layoutMode: "VERTICAL", itemSpacing: 24 } }], failed: [] }));
    if (kind === "sidecar-only") {
      const applyDelta = figmaApply.applyDelta;
      vi.spyOn(figmaApply, "applyDelta").mockImplementation((...args: Parameters<typeof figmaApply.applyDelta>) => {
        const result = applyDelta(...args); expect(result.sidecarWrites.length).toBeGreaterThan(0); return { ...result, changed: false };
      });
    }
    const before = filesystemState(root), writes = vi.spyOn(fs, "writeFileSync");
    const result = cli(["figma", "reconcile", "--dir", root, "--apply", ...(kind === "sidecar-only" ? ["--mirror-file", capturePath] : [])]);
    expect(result.error?.code).toBe("KIT_FIGMA_APPLY"); expect(writes).not.toHaveBeenCalled(); expect(filesystemState(root)).toEqual(before);
    expect(cli(["figma", "reconcile", "--dir", root]).code).toBe(0); expect(filesystemState(root)).toEqual(before);
  });
  it("tampered stale evidence cannot be healed by another sanctioned update", () => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design"));
    expect(cli(["ds", "change-token", "color.canvas", "--value", "#eeeeee", "--dir", root]).code).toBe(0);
    const ds = loadDesignSystem(paths); fs.appendFileSync(join(root, "evidence/build.txt"), "changed proof\n"); const before = filesystemState(root);
    expect(cli(["ds", "status", "--dir", root]).error?.code).toBe("DS_TAMPERED");
    expect(() => reseal({ ds, paths, registry: ds.registry, entry: { kind: "register", by: "test" }, nowIso: "2026-10-09T00:00:00.000Z" })).toThrow();
    expect(filesystemState(root)).toEqual(before);
  });
});

describe("orphan kit ownership boundary", () => {
  it.each(["valid", "damaged-file", "directory", "dangling-link"] as const)("missing manifest with %s lock blocks writes without filesystem changes", (kind) => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design"));
    expect(loadDesignSystem(paths).kit?.status).toBe("verified");
    const frame = { v: 1, ts: 1000, op: "deleted", nodeId: "1:1", nodeName: "Owner Item 0", nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Owner", fileKey: "owner" };
    put(root, "design/figma.changes.jsonl", JSON.stringify(frame) + "\n");
    fs.unlinkSync(paths.manifest);
    if (kind === "damaged-file") put(root, "kit.lock.json", "{broken lock");
    if (kind === "directory" || kind === "dangling-link") {
      fs.unlinkSync(join(root, "kit.lock.json"));
      if (kind === "directory") fs.mkdirSync(join(root, "kit.lock.json"));
      else fs.symlinkSync("missing-lock-target.json", join(root, "kit.lock.json"));
    }
    const markup = join(temp(), "new.html"); fs.writeFileSync(markup, "<button>New</button>");
    const before = filesystemState(root);
    expect(() => loadDesignSystem(paths)).toThrow(expect.objectContaining({ code: "DS_TAMPERED" }));
    expect(filesystemState(root)).toEqual(before);
    const register = cli(["registry", "register", "Control/New", "--category", "action", "--markup", markup, "--file", paths.registry]);
    expect(register).toMatchObject({ code: 1, error: { code: "DS_TAMPERED" } });
    expect(filesystemState(root)).toEqual(before);
    const apply = cli(["figma", "reconcile", "--dir", root, "--apply"]);
    expect(apply).toMatchObject({ code: 1, error: { code: "DS_TAMPERED" } });
    expect(filesystemState(root)).toEqual(before);
  });

  it("discovery selects the orphan kit's own root before a healthy ancestor", () => {
    const { root: parent, source } = adopted();
    const child = join(parent, "node_modules/nested-owner-kit");
    fs.mkdirSync(join(parent, "node_modules"));
    expect(cli(["ds", "kit", "adopt", source, "--out", child]).code).toBe(0);
    fs.unlinkSync(join(child, "design/ds.manifest.json"));
    const start = join(child, "work/subdir"); fs.mkdirSync(start, { recursive: true });
    expect(loadDesignSystem(pathsForDir(join(parent, "design"))).kit?.status).toBe("verified");
    const before = filesystemState(parent), discovered = discoverDesignSystem(start);
    expect(discovered.dir).toBe(join(child, "design"));
    expect(() => loadDesignSystem(discovered)).toThrow(expect.objectContaining({ code: "DS_TAMPERED" }));
    expect(filesystemState(parent)).toEqual(before);
  });

  it("a genuinely standalone registry without a kit marker remains writable and reconcile can apply", () => {
    const root = temp(), paths = pathsForDir(join(root, "design")), markup = join(temp(), "standalone.html");
    fs.writeFileSync(markup, "<button>Standalone</button>");
    expect(() => loadDesignSystem(paths)).toThrow(expect.objectContaining({ code: "DS_NOT_FOUND" }));
    expect(cli(["registry", "register", "Control/Standalone", "--category", "action", "--markup", markup, "--file", paths.registry]).code).toBe(0);
    expect(JSON.parse(read(root, "design/component-registry.json").toString()).components).toHaveLength(1);
    const frame = { v: 1, ts: 1000, op: "deleted", nodeId: "1:1", nodeName: "Control/Standalone", nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Owner", fileKey: "owner" };
    put(root, "design/figma.changes.jsonl", JSON.stringify(frame) + "\n");
    expect(cli(["figma", "reconcile", "--dir", root, "--apply"]).code).toBe(0);
    const records = JSON.parse(read(root, "design/component-registry.json").toString()).components;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: "Control/Standalone", deprecated: true });
    expect(fs.existsSync(paths.manifest)).toBe(false); expect(fs.existsSync(join(root, "kit.lock.json"))).toBe(false);
  });
});

describe("sanctioned kit evolution", () => {
  it("token writes regenerate theme, preserve captures/evidence and expose stale readiness", () => {
    const { root } = adopted(), prior = read(root, "source/tokens.json"), evidence = read(root, "evidence/receipt.json");
    const revision = lessonRevision(loadDesignSystem(pathsForDir(join(root, "design"))).manifest);
    expect(cli(["ds", "change-token", "color.canvas", "--value", "#eeeeee", "--dir", root]).code).toBe(0);
    const ds = loadDesignSystem(pathsForDir(join(root, "design")));
    expect(ds.kit?.status).toBe("stale"); expect(ds.manifest.generation).toBe(2);
    expect(read(root, "source/tokens.json")).toEqual(prior); expect(read(root, "evidence/receipt.json")).toEqual(evidence);
    expect(read(root, "src/theme.css").toString()).toContain("#eeeeee"); expect(lessonRevision(ds.manifest)).not.toBe(revision);
    expect(cli(["ds", "kit", "verify", "--dir", root])).toMatchObject({ code: 1, data: { ready: false, kitStatus: "stale" } });
    expect(cli(["ds", "status", "--dir", root]).data["kitStatus"]).toBe("stale");
    expect(cli(["ds", "context", "--dir", root, "--format", "json"]).data["kitStatus"]).toBe("stale");
    expect(loadLessonEnvironment(root)?.kitStale).toBe(true);
    const review = { id: "review", t: "2026-10-09T00:00:00.000Z", decision: "accept" as const, actor: "owner-test", reason: "Owner acceptance", approvalRef: "evidence/lesson-approval.json", approvalFingerprint: "" };
    const lesson: LessonEntry = { id: "lesson", t: review.t, text: "Owner-approved lesson", status: "accepted", dsRevision: lessonRevision(ds.manifest), reviews: [review], scope: { kind: "project" }, refs: [] };
    put(root, review.approvalRef, { lessonId: lesson.id, dsRevision: lesson.dsRevision, decision: review.decision, actor: review.actor, reason: review.reason });
    review.approvalFingerprint = hashKitBytes(read(root, review.approvalRef));
    const event: MemoryEvent = { v: 1, id: "review", t: review.t, actor: review.actor, refs: [lesson.id], type: "lesson_reviewed",
      data: { lessonId: lesson.id, decision: review.decision, reason: review.reason, approvalRef: review.approvalRef, approvalFingerprint: review.approvalFingerprint } };
    expect(() => preflightLesson(root, event, [lesson], [])).toThrow(/KIT_STALE/);
  });
  it("bound kit registration replaces an exact owner label and adds friendly Unicode labels", () => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design"));
    const capture = read(root, "source/registry.json"), spec = read(root, "kit.json"), receipt = read(root, "evidence/receipt.json");
    const markup = join(temp(), "owner.html"); fs.writeFileSync(markup, "<button>Owner replacement</button>");
    expect(cli(["registry", "register", "Owner Item 40", "--category", "display", "--markup", markup, "--file", paths.registry, "--force"]).data).toMatchObject({ replaced: true, component: { name: "Owner Item 40" } });
    for (const name of ["Button", "Owner friendly — 布局"]) expect(cli(["registry", "register", name, "--category", "action", "--markup", markup, "--file", paths.registry]).data).toMatchObject({ replaced: false, component: { name } });
    const seal = read(root, "kit.lock.json"), registry = read(root, "design/component-registry.json"), manifest = read(root, "design/ds.manifest.json");
    expect(cli(["registry", "register", "button", "--category", "action", "--markup", markup, "--file", paths.registry, "--force"]).error?.code).toBe("BAD_NAME");
    expect(read(root, "kit.lock.json")).toEqual(seal); expect(read(root, "design/component-registry.json")).toEqual(registry); expect(read(root, "design/ds.manifest.json")).toEqual(manifest);
    const ds = loadDesignSystem(paths);
    expect(ds.registry.components).toHaveLength(43); expect(ds.kit?.status).toBe("stale"); expect(ds.manifest.generation).toBe(4);
    expect(ds.registry.components.find((record) => record.name === "Owner Item 40")?.markup).toContain("Owner replacement");
    expect(ds.registry.components.map((record) => record.name)).toContain("Owner friendly — 布局");
    expect(read(root, "source/registry.json")).toEqual(capture); expect(read(root, "kit.json")).toEqual(spec); expect(read(root, "evidence/receipt.json")).toEqual(receipt);
  });
  it("explicit standalone registry files retain strict authoring even when cwd is a bound kit", () => {
    const { root } = adopted(), standalone = join(temp(), "component-registry.json"), markup = join(temp(), "legacy.html"); fs.writeFileSync(markup, "<button>Legacy</button>");
    const original = read(root, "kit.lock.json"); vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(cli(["registry", "register", "Owner friendly", "--category", "action", "--markup", markup, "--file", standalone]).error?.code).toBe("BAD_NAME");
    expect(fs.existsSync(standalone)).toBe(false); expect(read(root, "kit.lock.json")).toEqual(original);
  });
  it.each(["owner item 40", "Ｏｗｎｅｒ Item 40", "Owner   Item 40"])("kit growth rejects normalized owner-name collision %s before writing", (name) => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), markup = join(temp(), "owner.html"); fs.writeFileSync(markup, "<button>Owner</button>");
    const before = new Map(["design/component-registry.json", "design/ds.manifest.json", "kit.lock.json"].map((path) => [path, read(root, path)]));
    expect(cli(["registry", "register", name, "--category", "display", "--markup", markup, "--file", paths.registry, "--force"]).error?.code).toBe("BAD_NAME");
    for (const [path, bytes] of before) expect(read(root, path)).toEqual(bytes);
    expect(loadDesignSystem(paths).kit?.status).toBe("verified");
  });
  it.each(["   ", "Owner\nName", "Owner\x7fName", "Owner\ud800Name"])("source-authored name rejects blanks, controls and malformed Unicode: %j", (name) => {
    expect(() => validateSourceAuthoredComponentRecord({ name, category: "display", markup: "<div/>", tokensUsed: [] })).toThrow();
  });
  it("registry growth becomes stale without recapturing mappings", () => {
    const { root } = adopted(); const mappings = read(root, "kit.json"); const markup = join(temp(), "new.html"); fs.writeFileSync(markup, "<button>New</button>");
    expect(cli(["registry", "register", "Control/New", "--category", "action", "--markup", markup, "--file", join(root, "design/component-registry.json")]).code).toBe(0);
    expect(loadDesignSystem(pathsForDir(join(root, "design"))).kit?.status).toBe("stale"); expect(read(root, "kit.json")).toEqual(mappings);
  });
  it("registry-only evolution preserves nested raw DTCG and metadata before a sanctioned role write", () => {
    const { root } = adopted(true), paths = pathsForDir(join(root, "design")), prior = loadDesignSystem(paths);
    expect(canonicalHash(prior.tokens)).not.toBe(prior.manifest.compiledHash);
    const immutable = ["design/design.tokens.json", "source/tokens.json", "source/registry.json", "kit.json", "src/theme.css", "evidence/receipt.json"];
    const before = new Map(immutable.map((path) => [path, read(root, path)]));
    const markup = join(temp(), "new.html"); fs.writeFileSync(markup, "<button>New</button>");
    expect(cli(["registry", "register", "Control/New", "--category", "action", "--markup", markup, "--file", paths.registry]).code).toBe(0);
    const grown = loadDesignSystem(paths);
    expect(grown.kit?.status).toBe("stale"); expect(grown.manifest.generation).toBe(2);
    expect(grown.kit?.tokensHash).toBe(prior.kit?.tokensHash); expect(grown.manifest.compiledHash).toBe(prior.manifest.compiledHash);
    for (const path of immutable) expect(read(root, path)).toEqual(before.get(path));
    expect(cli(["ds", "kit", "verify", "--dir", root]).data).toMatchObject({ ready: false, kitStatus: "stale" });
    expect(cli(["ds", "set-role", "color.owner-muted", "muted", "--dir", root]).code).toBe(0);
    const updated = loadDesignSystem(paths), written: unknown = JSON.parse(read(root, "design/design.tokens.json").toString());
    expect(updated.kit?.status).toBe("stale"); expect(updated.manifest.generation).toBe(3);
    expect(updated.kit?.tokensHash).toBe(canonicalHash(written)); expect(updated.manifest.compiledHash).toBe(canonicalHash(written));
    expect(updated.kit?.tokensHash).not.toBe(prior.kit?.tokensHash);
    expect(updated.tokens["color"]?.["owner-muted"]?.$extensions).toMatchObject({ "owner.capture": { sourceId: "owner-muted" }, "design-os.role": "muted" });
    for (const path of immutable.filter((path) => path !== "design/design.tokens.json" && path !== "src/theme.css")) expect(read(root, path)).toEqual(before.get(path));
  });
  it.each(["stage", "commit"])("%s I/O failure preserves precommit integrity or fails loudly after commit", (phase) => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), ds = loadDesignSystem(paths);
    const manifest = read(root, "design/ds.manifest.json"), open = fs.openSync, rename = fs.renameSync;
    const tokens = { ...ds.tokens, color: { ...ds.tokens["color"], canvas: { $type: "color" as const, $value: "#dddddd" } } };
    if (phase === "stage") vi.spyOn(fs, "openSync").mockImplementation((...args: Parameters<typeof fs.openSync>) => {
      if (String(args[0]) === join(root, "kit.lock.json.tmp")) throw new Error("injected stage failure"); return open(...args);
    });
    else vi.spyOn(fs, "renameSync").mockImplementation((...args: Parameters<typeof fs.renameSync>) => {
      if (String(args[1]) === join(root, "src/theme.css")) throw new Error("injected commit failure"); return rename(...args);
    });
    expect(() => reseal({ ds, paths, tokens, entry: { kind: "change-token", by: "test" }, nowIso: "2026-10-09T00:00:00.000Z" })).toThrow(/WRITE_ERROR|failed/);
    vi.restoreAllMocks(); expect(read(root, "design/ds.manifest.json")).toEqual(manifest);
    if (phase === "stage") { expect(loadDesignSystem(paths).kit?.status).toBe("verified"); expect(fs.existsSync(join(root, "src/theme.css.tmp"))).toBe(false); }
    else expect(() => loadDesignSystem(paths)).toThrow(/hash mismatch|kit integrity/);
  });
  it("pre-existing ignored temporary files are never overwritten or removed", () => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), ds = loadDesignSystem(paths);
    put(root, "design/design.tokens.json.tmp", "other writer owns this");
    expect(() => reseal({ ds, paths, tokens: ds.tokens, entry: { kind: "change-token", by: "test" }, nowIso: "2026-10-09T00:00:00.000Z" })).toThrow(/failed to write temporary/);
    expect(read(root, "design/design.tokens.json.tmp").toString()).toBe("other writer owns this"); expect(loadDesignSystem(paths).kit?.status).toBe("verified");
  });
  it("a loaded DS cannot authorize healing a later unexpected TSX edit", () => {
    const { root } = adopted(), paths = pathsForDir(join(root, "design")), ds = loadDesignSystem(paths); const manifest = read(root, "design/ds.manifest.json");
    fs.appendFileSync(join(root, "src/components.tsx"), "// unauthorized\n");
    expect(() => reseal({ ds, paths, tokens: ds.tokens, entry: { kind: "change-token", by: "test" }, nowIso: "2026-10-09T00:00:00.000Z" })).toThrow(/kit integrity/);
    expect(read(root, "design/ds.manifest.json")).toEqual(manifest);
  });
  it.each(["init", "import"])("%s --force cannot downgrade a bound kit", (operation) => {
    const { root } = adopted(); const before = read(root, "design/ds.manifest.json");
    const args = operation === "init" ? ["ds", "init", "replacement", "--persona", "liquid-glass", "--intent", "test"] : ["ds", "import", join(root, "source/tokens.json"), "--reset-registry"];
    expect(cli([...args, "--dir", root, "--force"]).error?.code).toBe("KIT_DOWNGRADE"); expect(read(root, "design/ds.manifest.json")).toEqual(before);
  });
  it("malformed legacy manifests retain forced-init recovery", () => {
    const root = temp(); put(root, "design/ds.manifest.json", "{legacy broken");
    const result = cli(["ds", "init", "repaired", "--persona", "liquid-glass", "--intent", "legacy recovery", "--bare", "--force", "--dir", root,
      "--persona-data", fileURLToPath(new URL("../knowledge/personas/personas.json", import.meta.url))]);
    expect(result.code).toBe(0); expect(loadDesignSystem(pathsForDir(join(root, "design"))).manifest.kit).toBeUndefined();
  });
  it("owner-name validation is separate from legacy name authoring and descriptor versions fail closed", () => {
    const record = { name: "Owner Item 40", category: "display", markup: "<div/>", tokensUsed: [] };
    expect(validateSourceAuthoredComponentRecord(record).name).toBe(record.name); expect(() => validateComponentRecord(record)).toThrow(/Category\/Variant/);
    expect(() => validateSourceAuthoredComponentRecord({ ...record, states: ["invented"] })).toThrow();
    const { root } = adopted(); const manifest = JSON.parse(read(root, "design/ds.manifest.json").toString());
    expect(() => validateManifestShape({ ...manifest, kit: { ...manifest.kit, version: 2 } })).toThrow();
    expect(() => validateManifestShape({ ...manifest, kit: { ...manifest.kit, unexpected: true } })).toThrow();
    const { compiledHash, registryHash, generation } = manifest;
    const legacy = { ...manifest }; delete legacy.kit;
    expect(lessonRevision(legacy)).toBe(canonicalHash({ compiledHash, registryHash, generation }));
  });
});
