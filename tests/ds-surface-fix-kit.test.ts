/**
 * A kit-bound store (spec 033, review fix round, section J): what `ui registry register` does on one, and what the batch
 * path of `ui ds surface --register` does on the same store for a new record, a link and a `<name> · code` record.
 * The kit fixture is the one of ds-kit-integration.test.ts (a candidate kit adopted by `ui ds kit adopt`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { emitKitTheme } from "../src/core/ds-kit-theme.js";
import { hashKitBytes } from "../src/core/ds-kit-files.js";
import { prepareKit } from "../src/core/ds-kit-validate.js";
import { BatchRegisterError, registerRecordsOnce } from "../src/commands/registry-register-batch.js";

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


const NOW = "2026-11-11T09:00:00Z";
const statusOf = (root: string): { code: number; error?: { code: string; message: string } } => { const r = cli(["ds", "status", "--dir", root]); return { code: r.code, ...(r.error === undefined ? {} : { error: r.error }) }; };
const refusalsOf = (fn: () => unknown): { code: string; refusals: { name: string; code: string }[] } => {
  try { fn(); } catch (e) { if (e instanceof BatchRegisterError) return { code: e.code, refusals: e.refusals }; throw e; }
  return { code: "NONE", refusals: [] };
};
const record = (name: string): Parameters<typeof registerRecordsOnce>[1][number] => ({ name, category: "src", markup: "<div>x</div>", tokensUsed: ["color.ink"], variants: [], sourceRef: "src/components.tsx:1-1" });

const lockStatus = (root: string): string => (JSON.parse(fs.readFileSync(join(root, "kit.lock.json"), "utf8")) as { status: string }).status;
const dsFile = (root: string): string => join(root, "design", "component-registry.json");

describe("a kit-bound store", () => {
  const single = (root: string): { code: number } => {
    const markup = join(temp(), "m.html"); fs.writeFileSync(markup, "<button>x</button>");
    return cli(["registry", "register", "Single Owner", "--category", "action", "--markup", markup, "--synthetic-approved", "--reason", "fixture", "--file", dsFile(root)]);
  };
  it("ui registry register writes a new record, reseals, and the store still reads", () => {
    const { root } = adopted();
    expect(single(root).code).toBe(0);
    expect(statusOf(root)).toEqual({ code: 0 });
  });
  it("the batch does the same for a new record, a link and a separate record: written, resealed, the store still reads, the lock in the same state", () => {
    const viaSingle = adopted().root; single(viaSingle);
    const cases: [string, Parameters<typeof registerRecordsOnce>[1], Parameters<typeof registerRecordsOnce>[2]][] = [
      ["new", [record("Batch New")], []],
      ["link", [], [{ name: "Owner Item 0", sourceRef: "src/components.tsx:1-1", tokens: ["color.ink"] }]],
      ["separate", [{ ...record("Owner Item 1 · code"), separate: true }], []],
    ];
    for (const [label, records, links] of cases) {
      const root = adopted().root;
      expect(refusalsOf(() => registerRecordsOnce(root, records, links, NOW, "test")), label).toEqual({ code: "NONE", refusals: [] });
      expect(statusOf(root), label).toEqual({ code: 0 });
      expect(lockStatus(root), label).toBe(lockStatus(viaSingle));
    }
  }, 30000);
  it("a name that collides with a registered label is refused by both paths as BAD_NAME", () => {
    const { root } = adopted();
    const markup = join(temp(), "m.html"); fs.writeFileSync(markup, "<button>x</button>");
    const one = cli(["registry", "register", "owner item 0", "--category", "action", "--markup", markup, "--synthetic-approved", "--reason", "fixture", "--file", dsFile(root)]);
    expect(one.error?.code).toBe("BAD_NAME");
    expect(refusalsOf(() => registerRecordsOnce(root, [record("owner item 0")], [], NOW, "test")).refusals).toMatchObject([{ name: "owner item 0", code: "BAD_NAME" }]);
  });
  it("ui registry lookup prints the whole record, so a linked record shows its code source beside its provenance", () => {
    const { root } = adopted();
    registerRecordsOnce(root, [], [{ name: "Owner Item 0", sourceRef: "src/components.tsx:1-1", tokens: ["color.ink"] }], NOW, "test");
    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { out += String(chunk); return true; });
    run(["registry", "lookup", "Owner Item 0", "--file", dsFile(root)]);
    vi.restoreAllMocks();
    expect(out).toContain('"code": {');
    expect(out).toContain('"sourceRef": "src/components.tsx:1-1"');
  });
});
