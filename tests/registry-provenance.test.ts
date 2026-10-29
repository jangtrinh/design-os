/**
 * `ui registry register` provenance: once a design system is sealed (design/ds.manifest.json exists),
 * a component is accepted only with a verified source reference or an explicit, reasoned synthetic
 * approval. Covers flag validation, code and Figma refs, the recorded provenance, the unsealed
 * path, the record's shape and the guarantee that a refusal writes nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalHash } from "../src/core/ds-manifest.js";
import { loadDesignSystem, pathsForDir } from "../src/core/design-system.js";
import { loadRegistry, saveRegistry, validateComponentRecord } from "../src/core/registry-store.js";
import {
  CLEAN_MARKUP, FAKE_MONOSPACE, SOURCE_FILE_TEXT, cleanupProjects, sealedProject, sha256Text, snapshot, unsealedProject,
} from "./registry-provenance-harness.js";
import type { Captured, Project } from "./registry-provenance-harness.js";

afterEach(() => cleanupProjects());

const errorOf = (r: Captured): { code: string; message: string } =>
  (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
const registered = (p: Project): { name: string; provenance?: Record<string, unknown> }[] =>
  loadRegistry(p.registryFile).components.filter((c) => c.name === "Table/Fake") as never;
const SLICE_1_3 = SOURCE_FILE_TEXT.split("\n").slice(0, 3).join("\n");

/** Run `extra` against a sealed project and assert it was refused with `code`, writing nothing. */
function expectRefusal(extra: string[], code: string, p: Project = sealedProject()): string {
  const before = snapshot(p.designDir);
  const r = p.register([...extra, "--json"]);
  expect(r.code, r.out + r.err).toBe(1);
  expect(errorOf(r).code).toBe(code);
  expect(snapshot(p.designDir), "a refused register must not touch the store").toEqual(before);
  return errorOf(r).message;
}

describe("flag validation", () => {
  it("refuses both a source ref and a synthetic approval with BAD_ARG", () => {
    expectRefusal(["--source-ref", "src/widget.svelte:1-3", "--synthetic-approved", "--reason", "why"], "BAD_ARG");
  });

  it("refuses --reason without --synthetic-approved with BAD_ARG", () => {
    expectRefusal(["--source-ref", "src/widget.svelte:1-3", "--reason", "why"], "BAD_ARG");
  });

  it.each([[""], ["   "]])("refuses an empty or whitespace-only reason (%j) with BAD_ARG", (reason) => {
    expectRefusal(["--synthetic-approved", "--reason", reason], "BAD_ARG");
  });

  it("refuses --synthetic-approved with no --reason with BAD_ARG", () => {
    expectRefusal(["--synthetic-approved"], "BAD_ARG");
  });

  it("refuses --source-ref given no value with BAD_ARG", () => {
    expectRefusal(["--source-ref"], "BAD_ARG");
  });

  it("applies the same validation on an unsealed store", () => {
    const p = unsealedProject();
    const r = p.register(["--synthetic-approved", "--reason", "  ", "--json"]);
    expect(r.code).toBe(1);
    expect(errorOf(r).code).toBe("BAD_ARG");
    expect(existsSync(p.registryFile)).toBe(false);
  });
});

describe("sealed store requires a source", () => {
  it("refuses a register with no ref and no synthetic approval: REGISTRY_MISSING_SOURCE_REF", () => {
    const message = expectRefusal([], "REGISTRY_MISSING_SOURCE_REF");
    expect(message).toMatch(/--source-ref/);
    expect(message).toMatch(/--synthetic-approved --reason/);
  });

  it("text mode names the code on stderr and exits 1", () => {
    const p = sealedProject();
    const r = p.register([]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("REGISTRY_MISSING_SOURCE_REF");
  });

  it("accepts a synthetic approval with a reason and records it", () => {
    const p = sealedProject();
    const r = p.register(["--synthetic-approved", "--reason", "  no source exists yet  "]);
    expect(r.code, r.err).toBe(0);
    expect(registered(p)[0]!.provenance).toEqual({
      kind: "synthetic-approved", sourceRef: "synthetic", sha256: sha256Text(CLEAN_MARKUP), reason: "no source exists yet",
    });
  });
});

describe("code refs", () => {
  it("records a verified ref with the hash of the exact slice, lines joined with \\n", () => {
    const p = sealedProject();
    const r = p.register(["--source-ref", "src/widget.svelte:1-3"]);
    expect(r.code, r.err).toBe(0);
    expect(registered(p)[0]!.provenance).toEqual({ kind: "code", sourceRef: "src/widget.svelte:1-3", sha256: sha256Text(SLICE_1_3) });
  });

  it("allows a single line ref: path:4", () => {
    const p = sealedProject();
    expect(p.register(["--source-ref", "src/widget.svelte:4"]).code).toBe(0);
    expect(registered(p)[0]!.provenance).toMatchObject({ sourceRef: "src/widget.svelte:4", sha256: sha256Text("<button>{label}</button>") });
  });

  it("hashes CRLF files by their lines, not their line endings", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "src", "crlf.txt"), "one\r\ntwo\r\nthree\r\n");
    expect(p.register(["--source-ref", "src/crlf.txt:1-2"]).code).toBe(0);
    expect(registered(p)[0]!.provenance!["sha256"]).toBe(sha256Text("one\ntwo"));
  });

  it.each([
    ["no line range", "src/widget.svelte"],
    ["a non-numeric range", "src/widget.svelte:a-b"],
    ["line zero", "src/widget.svelte:0-2"],
    ["an inverted range", "src/widget.svelte:5-3"],
    ["an empty path", ":1-2"],
  ])("refuses a malformed ref (%s) with REGISTRY_BAD_SOURCE_REF", (_label, ref) => {
    expectRefusal(["--source-ref", ref], "REGISTRY_BAD_SOURCE_REF");
  });

  it("refuses a missing file and names the path", () => {
    expect(expectRefusal(["--source-ref", "src/nope.svelte:1-2"], "REGISTRY_BAD_SOURCE_REF")).toContain("src/nope.svelte");
  });

  it("refuses a directory", () => {
    expectRefusal(["--source-ref", "src:1-2"], "REGISTRY_BAD_SOURCE_REF");
  });

  it("refuses a range past the end of the file and states the line count", () => {
    const message = expectRefusal(["--source-ref", "src/widget.svelte:5-7"], "REGISTRY_BAD_SOURCE_REF");
    expect(message).toMatch(/6 line/);
  });

  it("refuses a range in an empty file", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "src", "empty.txt"), "");
    expectRefusal(["--source-ref", "src/empty.txt:1-1"], "REGISTRY_BAD_SOURCE_REF", p);
  });

  it("refuses an absolute path", () => {
    const p = sealedProject();
    expectRefusal(["--source-ref", `${join(p.root, "src", "widget.svelte")}:1-2`], "REGISTRY_BAD_SOURCE_REF", p);
  });

  it("refuses a path that escapes the project root, even though the target exists", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "..", "outside-the-project.txt"), "secret\n");
    const message = expectRefusal(["--source-ref", "../outside-the-project.txt:1-1"], "REGISTRY_BAD_SOURCE_REF", p);
    expect(message).toMatch(/escape|outside/);
  });

  it("refuses a symlink inside the project that points outside it", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "..", "outside-link-target.txt"), "secret\n");
    symlinkSync(join(p.root, "..", "outside-link-target.txt"), join(p.root, "src", "link.txt"));
    expectRefusal(["--source-ref", "src/link.txt:1-1"], "REGISTRY_BAD_SOURCE_REF", p);
  });
});

describe("figma refs", () => {
  const dsJson = { components: [{ id: "6326:20179", key: "k1", name: "Section Header", type: "COMPONENT_SET", page: { id: "220:7791", name: "P" } }, { id: "7:8", key: "k2", name: "Dot", type: "COMPONENT", page: { id: "1:1", name: "P" } }], tokens: [], styles: [], counts: { components: 2, tokens: 0, styles: 0 } };
  const canvas = { schema: 2, components: [{ id: "10427:182798", key: "k3", name: "Cell", type: "COMPONENT", pageId: "1:1", page: "P", flags: [], users: 0, w: 1, h: 1 }], componentSets: [{ id: "55:66", key: "k4", name: "Set", type: "COMPONENT_SET", pageId: "1:1", page: "P", flags: [], variants: [], props: [], users: 1, propsError: false }] };
  const withInventories = (): Project => {
    const p = sealedProject();
    writeFileSync(join(p.designDir, "ds.json"), JSON.stringify(dsJson));
    writeFileSync(join(p.designDir, "canvas-inventory.json"), JSON.stringify(canvas));
    return p;
  };

  it.each([
    ["a component set in ds.json", "figma:6326:20179", dsJson.components[0]],
    ["a component in ds.json", "figma:7:8", dsJson.components[1]],
    ["a component in canvas-inventory.json", "figma:10427:182798", canvas.components[0]],
    ["a component set in canvas-inventory.json", "figma:55:66", canvas.componentSets[0]],
  ])("accepts %s and records the canonical hash of the matched entry", (_label, ref, entry) => {
    const p = withInventories();
    const r = p.register(["--source-ref", ref]);
    expect(r.code, r.err).toBe(0);
    expect(registered(p)[0]!.provenance).toEqual({ kind: "figma", sourceRef: ref, sha256: canonicalHash(entry) });
  });

  it("refuses an unknown node and names it", () => {
    const p = withInventories();
    expect(expectRefusal(["--source-ref", "figma:9:9"], "REGISTRY_BAD_SOURCE_REF", p)).toContain("9:9");
  });

  it("works with only one of the two inventories present", () => {
    const p = sealedProject();
    writeFileSync(join(p.designDir, "canvas-inventory.json"), JSON.stringify(canvas));
    expect(p.register(["--source-ref", "figma:55:66"]).code).toBe(0);
    expectRefusal(["--source-ref", "figma:7:8"], "REGISTRY_BAD_SOURCE_REF", p);
  });

  it("refuses when neither inventory exists and says which files it looked for", () => {
    const message = expectRefusal(["--source-ref", "figma:1:2"], "REGISTRY_BAD_SOURCE_REF");
    expect(message).toContain("ds.json");
    expect(message).toContain("canvas-inventory.json");
  });

  it.each([["figma:abc"], ["figma:1"], ["figma:1:2:3"], ["figma:"]])("refuses a malformed node id %s", (ref) => {
    expectRefusal(["--source-ref", ref], "REGISTRY_BAD_SOURCE_REF", withInventories());
  });

  it("refuses an inventory that is not valid JSON, naming the file", () => {
    const p = sealedProject();
    writeFileSync(join(p.designDir, "ds.json"), "{ not json");
    expect(expectRefusal(["--source-ref", "figma:1:2"], "REGISTRY_BAD_SOURCE_REF", p)).toContain("ds.json");
  });
});

describe("unsealed store", () => {
  it("registers with no provenance flags, exactly as before", () => {
    const p = unsealedProject();
    const r = p.register([]);
    expect(r.code, r.err).toBe(0);
    expect(registered(p)[0]!.provenance).toBeUndefined();
  });

  it("verifies and records a ref when one is given", () => {
    const p = unsealedProject();
    expect(p.register(["--source-ref", "src/widget.svelte:1-3"]).code).toBe(0);
    expect(registered(p)[0]!.provenance).toEqual({ kind: "code", sourceRef: "src/widget.svelte:1-3", sha256: sha256Text(SLICE_1_3) });
  });

  it("still refuses a ref that does not verify, and writes nothing", () => {
    const p = unsealedProject();
    const r = p.register(["--source-ref", "src/nope.svelte:1-2", "--json"]);
    expect(r.code).toBe(1);
    expect(errorOf(r).code).toBe("REGISTRY_BAD_SOURCE_REF");
    expect(existsSync(p.registryFile)).toBe(false);
  });

  it("records a synthetic approval when given", () => {
    const p = unsealedProject();
    expect(p.register(["--synthetic-approved", "--reason", "prototype"]).code).toBe(0);
    expect(registered(p)[0]!.provenance).toMatchObject({ kind: "synthetic-approved", sourceRef: "synthetic", reason: "prototype" });
  });

  it("does not lint markup before the seal", () => {
    const p = unsealedProject();
    expect(p.register([], { markup: FAKE_MONOSPACE }).code).toBe(0);
  });
});

describe("what a successful register reports", () => {
  it("JSON mode carries the provenance on the component", () => {
    const p = sealedProject();
    const env = JSON.parse(p.register(["--source-ref", "src/widget.svelte:1-3", "--json"]).out) as { ok: boolean; data: { component: { provenance: { kind: string } } } };
    expect(env.ok).toBe(true);
    expect(env.data.component.provenance.kind).toBe("code");
  });

  it("text mode names the provenance kind and ref", () => {
    const r = sealedProject().register(["--source-ref", "src/widget.svelte:1-3"]);
    expect(r.out).toMatch(/registered: Table\/Fake/);
    expect(r.out).toContain("provenance: code src/widget.svelte:1-3");
  });

  it("--force replaces the record, provenance included", () => {
    const p = sealedProject();
    expect(p.register(["--source-ref", "src/widget.svelte:1-3"]).code).toBe(0);
    expect(p.register(["--synthetic-approved", "--reason", "now synthetic", "--force"]).code).toBe(0);
    expect(registered(p)[0]!.provenance).toMatchObject({ kind: "synthetic-approved" });
  });

  it("reseals the manifest on success", () => {
    const p = sealedProject();
    const before = snapshot(p.designDir)["ds.manifest.json"];
    expect(p.register(["--source-ref", "src/widget.svelte:1-3"]).code).toBe(0);
    expect(snapshot(p.designDir)["ds.manifest.json"]).not.toBe(before);
    expect(() => loadDesignSystem(pathsForDir(p.designDir))).not.toThrow();
  });
});

describe("the record's provenance shape", () => {
  const base = { name: "Table/Fake", category: "data", markup: CLEAN_MARKUP, tokensUsed: [] };
  const valid = { kind: "code", sourceRef: "src/a.svelte:1-2", sha256: sha256Text("x") };

  it("round-trips through validate, save and load", () => {
    const rec = validateComponentRecord({ ...base, provenance: valid });
    const p = unsealedProject();
    saveRegistry(p.registryFile, { version: "0.1.0", components: [rec] });
    expect(loadRegistry(p.registryFile).components[0]!.provenance).toEqual(valid);
  });

  it("keeps a record with no provenance valid", () => {
    expect(validateComponentRecord(base).provenance).toBeUndefined();
  });

  it.each([
    ["an unknown key", { ...valid, extra: 1 }],
    ["an unknown kind", { ...valid, kind: "guess" }],
    ["a missing sourceRef", { kind: "code", sha256: valid.sha256 }],
    ["a malformed sha256", { ...valid, sha256: "abc" }],
    ["a reason on a non-synthetic record", { ...valid, reason: "why" }],
    ["a synthetic record with no reason", { kind: "synthetic-approved", sourceRef: "synthetic", sha256: valid.sha256 }],
    ["a synthetic record with a blank reason", { kind: "synthetic-approved", sourceRef: "synthetic", sha256: valid.sha256, reason: " " }],
    ["a non-object", "code"],
  ])("rejects %s", (_label, provenance) => {
    expect(() => validateComponentRecord({ ...base, provenance })).toThrow();
  });
});
