/**
 * `ui registry register` provenance: once a design system is sealed (design/ds.manifest.json exists),
 * a component is accepted only with a verified source reference or an explicit, reasoned synthetic
 * approval. Covers flag validation, code and Figma refs, the recorded provenance, the unsealed
 * path, the record's shape and the guarantee that a refusal writes nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalHash } from "../src/core/ds-manifest.js";
import { loadDesignSystem, pathsForDir } from "../src/core/design-system.js";
import { RegistryError, loadRegistry, saveRegistry, validateComponentRecord } from "../src/core/registry-store.js";
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

  it("reads a path that contains a colon: a:b:1 is file 'a:b', line 1", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "a:b"), "only line\n");
    const r = p.register(["--source-ref", "a:b:1"]);
    expect(r.code, r.err).toBe(0);
    expect(registered(p)[0]!.provenance).toEqual({ kind: "code", sourceRef: "a:b:1", sha256: sha256Text("only line") });
  });

  it("accepts a file whose name starts with two dots: it does not escape the root", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "..notes.txt"), "dots\n");
    expect(p.register(["--source-ref", "..notes.txt:1"]).code).toBe(0);
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

describe("a ref must point at the component's real source", () => {
  const MESSAGE = /real source/;

  it("refuses the markup file being registered", () => {
    const message = expectRefusal(["--source-ref", "clean.html:1"], "REGISTRY_BAD_SOURCE_REF");
    expect(message).toMatch(MESSAGE);
    expect(message).toContain("markup");
  });

  it("refuses the markup file reached through another spelling of its path", () => {
    const p = sealedProject();
    expectRefusal(["--source-ref", "src/../clean.html:1"], "REGISTRY_BAD_SOURCE_REF", p);
  });

  it("refuses a file inside the design system store: the manifest", () => {
    const message = expectRefusal(["--source-ref", "design/ds.manifest.json:1-2"], "REGISTRY_BAD_SOURCE_REF");
    expect(message).toMatch(MESSAGE);
    expect(message).toContain("design system");
  });

  it("refuses the registry file itself", () => {
    expectRefusal(["--source-ref", "design/component-registry.json:1-2"], "REGISTRY_BAD_SOURCE_REF");
  });

  it("accepts a source file that is not the markup and is outside the store", () => {
    expect(sealedProject().register(["--source-ref", "src/widget.svelte:1-3"]).code).toBe(0);
  });
});

describe("a ref whose file cannot be read", () => {
  const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

  it.skipIf(asRoot)("is REGISTRY_BAD_SOURCE_REF with the path and the OS error code, as JSON", () => {
    const p = sealedProject();
    const locked = join(p.root, "src", "locked.txt");
    writeFileSync(locked, "secret\n");
    chmodSync(locked, 0o000);
    try {
      const message = expectRefusal(["--source-ref", "src/locked.txt:1"], "REGISTRY_BAD_SOURCE_REF", p);
      expect(message).toContain("src/locked.txt");
      expect(message).toContain("EACCES");
    } finally {
      chmodSync(locked, 0o644);
    }
  });

  it.skipIf(asRoot)("exits 1 on stderr in text mode, not an internal error", () => {
    const p = sealedProject();
    const locked = join(p.root, "src", "locked.txt");
    writeFileSync(locked, "secret\n");
    chmodSync(locked, 0o000);
    try {
      const before = snapshot(p.designDir);
      const r = p.register(["--source-ref", "src/locked.txt:1"]);
      expect(r.code).toBe(1);
      expect(r.err).toContain("REGISTRY_BAD_SOURCE_REF");
      expect(r.err).toContain("EACCES");
      expect(r.err).not.toContain("internal error");
      expect(snapshot(p.designDir)).toEqual(before);
    } finally {
      chmodSync(locked, 0o644);
    }
  });
});

describe("arguments are validated before anything is read", () => {
  const CONFLICT = ["--source-ref", "src/widget.svelte:1", "--synthetic-approved", "--reason", "y"];

  it("a missing markup file does not hide conflicting provenance flags (sealed)", () => {
    expectRefusal(CONFLICT, "BAD_ARG", sealedProject());
    const p = sealedProject();
    const r = p.register([...CONFLICT, "--json"], { markup: join(p.root, "no-such-markup.html") });
    expect(errorOf(r).code).toBe("BAD_ARG");
  });

  it("same on an unsealed store", () => {
    const p = unsealedProject();
    const r = p.register([...CONFLICT, "--json"], { markup: join(p.root, "no-such-markup.html") });
    expect(errorOf(r).code).toBe("BAD_ARG");
  });

  it("conflicting flags beat an invalid component name", () => {
    const p = sealedProject();
    const r = p.register([...CONFLICT, "--json"], { name: "not a valid name" });
    expect(errorOf(r).code).toBe("BAD_ARG");
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

  it("ds.json wins over canvas-inventory.json when both hold the node with different entries", () => {
    const p = sealedProject();
    const fromDs = { id: "77:88", key: "from-ds", name: "Same node in ds.json", type: "COMPONENT" };
    const fromCanvas = { id: "77:88", key: "from-canvas", name: "Same node in canvas", type: "COMPONENT", users: 3 };
    writeFileSync(join(p.designDir, "ds.json"), JSON.stringify({ components: [fromDs], tokens: [], styles: [], counts: {} }));
    writeFileSync(join(p.designDir, "canvas-inventory.json"), JSON.stringify({ schema: 2, components: [fromCanvas], componentSets: [] }));
    expect(p.register(["--source-ref", "figma:77:88"]).code).toBe(0);
    expect(registered(p)[0]!.provenance!["sha256"]).toBe(canonicalHash(fromDs));
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

  it("does not lint markup before the seal, even when the design tokens are already there", () => {
    const p = unsealedProject({ withTokens: true });
    expect(existsSync(join(p.designDir, "design.tokens.json"))).toBe(true);
    expect(existsSync(p.manifestFile)).toBe(false);
    const r = p.register([], { markup: FAKE_MONOSPACE });
    expect(r.code, r.err).toBe(0);
    expect(r.out + r.err).not.toContain("off-system-font");
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
    ["an unknown key", { ...valid, extra: 1 }, "BAD_REGISTRY"],
    ["an unknown kind", { ...valid, kind: "guess" }, "BAD_ARG"],
    ["a missing sourceRef", { kind: "code", sha256: valid.sha256 }, "BAD_ARG"],
    ["a malformed sha256", { ...valid, sha256: "abc" }, "BAD_ARG"],
    ["a reason on a non-synthetic record", { ...valid, reason: "why" }, "BAD_ARG"],
    ["a synthetic record with no reason", { kind: "synthetic-approved", sourceRef: "synthetic", sha256: valid.sha256 }, "BAD_ARG"],
    ["a synthetic record with a blank reason", { kind: "synthetic-approved", sourceRef: "synthetic", sha256: valid.sha256, reason: " " }, "BAD_ARG"],
    ["a non-object", "code", "BAD_ARG"],
  ])("rejects %s with %s-coded RegistryError", (_label, provenance, code) => {
    let caught: unknown;
    try { validateComponentRecord({ ...base, provenance }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RegistryError);
    expect((caught as RegistryError).code).toBe(code);
  });
});
