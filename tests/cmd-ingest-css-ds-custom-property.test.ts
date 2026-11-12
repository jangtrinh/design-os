/**
 * A token written from CSS keeps the custom property it came from (`design-os.custom-property`), through the sealed
 * store and the outputs an agent reads: `ui tokens compile --target css`, `ui ds context`, and the ontology's token
 * node. A store sealed without the extension behaves exactly as before.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingestCssTokens } from "../src/core/css-token-ingest.js";
import { importFlatTokens } from "../src/core/token-import.js";
import type { CustomPropertyObservation } from "../src/core/designmd-token-extractor.js";
import { capture } from "./owner-rulings-helpers.js";
import { DIST_CLI, runBuilt, writeSheets } from "./css-door-packaged-theme-fixture.js";

const KEY = "design-os.custom-property";
const cp = (name: string, value: string, selector = ":root"): CustomPropertyObservation => ({ name, value, sources: ["a.css:L1"], selectors: [selector] });

describe("the ingest writes the source custom property on every token", () => {
  it("a primitive, an alias and a token with a mode each carry their own property name", () => {
    const { tree } = ingestCssTokens([
      cp("--ds-surface", "#fff"),
      cp("--ds-surface", "#111", "[data-theme=dark]"),
      cp("--color-surface", "var(--ds-surface)", "@theme inline"),
    ]);
    expect(tree["color"]?.["ds-surface"]).toEqual({
      $value: "#fff", $type: "color",
      $extensions: { "mode.dark": { $value: "#111" }, [KEY]: "--ds-surface" },
    });
    expect(tree["color"]?.["color-surface"]).toEqual({ $value: "{color.ds-surface}", $type: "color", $extensions: { [KEY]: "--color-surface" } });
  });
});

const built = existsSync(DIST_CLI);
let root = "";
let project = "";
let sealed = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ease-css-door-property-"));
  if (!built) return;
  const { html, css } = writeSheets(join(root, "sheets"));
  const extractFile = join(root, "t.json");
  const e = runBuilt(["designmd", "extract-tokens", html, "--css", css, "--out", extractFile], root);
  if (e.code !== 0) throw new Error(`extract-tokens failed: ${e.err}${e.out}`);
  const i = runBuilt(["ingest-css-ds", extractFile, "--out", join(root, "out"), "--json"], root);
  if (i.code !== 0) throw new Error(`ingest-css-ds failed: ${i.err}${i.out}`);
  project = join(root, "project");
  const imp = runBuilt(["ds", "import", join(root, "out", "tokens.json"), "--dir", project, "--name", "acme", "--json"], root);
  if (imp.code !== 0) throw new Error(`ds import failed: ${imp.err}${imp.out}`);
  sealed = join(project, "design", "design.tokens.json");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Leaf = { $value: unknown; $type: string; $extensions?: Record<string, unknown> };
const sealedTree = (): Record<string, Record<string, Leaf>> => JSON.parse(readFileSync(sealed, "utf8"));

describe.skipIf(!built)("a packaged theme, ingest to the outputs an agent reads (built CLI)", () => {
  it("ds import keeps the property in the sealed store, beside the modes", () => {
    const t = sealedTree();
    expect(t["color"]?.["ds-border"]?.$extensions?.[KEY]).toBe("--ds-border");
    expect(t["font"]?.["ds-font-sans"]?.$extensions).toEqual({ [KEY]: "--ds-font-sans" });
    expect(t["color"]?.["ds-surface"]?.$extensions).toMatchObject({ [KEY]: "--ds-surface", "mode.dark": { $value: "#111" }, "mode.paper": { $value: "#f5f0e6" } });
    expect(t["color"]?.["color-surface"]?.$extensions).toMatchObject({ [KEY]: "--color-surface" });
  });

  it("ui tokens compile --target css emits each token under the property it came from", () => {
    const r = runBuilt(["tokens", "compile", sealed, "--target", "css"], root);
    expect(r.code).toBe(0);
    const decls = r.out.split("\n").filter((l) => l.startsWith("  --"));
    expect([...decls].sort()).toEqual([
      "  --color-surface: #fff;",
      "  --color-text: #111;",
      "  --ds-border: #ddd;",
      "  --ds-font-sans: \"Inter\",system-ui,sans-serif;",
      "  --ds-motion-base: .15s;",
      "  --ds-motion-fast: .1s;",
      "  --ds-radius: .5rem;",
      "  --ds-surface: #fff;",
      "  --ds-text: #111;",
      "  --font-sans: \"Inter\",system-ui,sans-serif;",
      "  --radius-md: .5rem;",
    ]);
  });

  it("the tailwind target keeps the namespace names it always emitted", () => {
    const r = runBuilt(["tokens", "compile", sealed, "--target", "tailwind"], root);
    expect(r.code).toBe(0);
    const decls = r.out.split("\n").filter((l) => /ds-surface|ds-font-sans/.test(l));
    expect(decls).toEqual(["  --color-ds-surface: #fff;", "  --font-ds-font-sans: \"Inter\",system-ui,sans-serif;"]);
  });

  it("ui ds context shows the property name of every semantic token it prints, in the table and in the JSON", () => {
    const md = runBuilt(["ds", "context", "--dir", project, "--include", "tokens"], root);
    expect(md.code).toBe(0);
    const row = md.out.split("\n").find((l) => l.startsWith("| color.color-surface"));
    expect(row).toBeDefined();
    expect((row as string).split("|").map((c) => c.trim()).filter((c) => c.length > 0)).toEqual(["color.color-surface", "#fff", "--color-surface"]);
    const roles = md.out.split("\n").filter((l) => /^- [a-z-]+ → /.test(l));
    expect(roles).toEqual([
      "- background → color.color-surface (--color-surface)",
      "- border → color.ds-border (--ds-border)",
      "- foreground → color.color-text (--color-text)",
    ]);
    const js = runBuilt(["ds", "context", "--dir", project, "--include", "tokens", "--format", "json"], root);
    const semantic = (JSON.parse(js.out) as { semantic: { path: string; value: string; customProperty?: string }[] }).semantic;
    expect(semantic.find((s) => s.path === "color.color-surface")).toEqual({ path: "color.color-surface", value: "#fff", customProperty: "--color-surface" });
  });

  it("the ontology token node carries the property, and a query for the property finds it and prints it", () => {
    const b = capture(["ontology", "build", "--dir", project, "--json"]);
    expect(b.code, b.out + b.err).toBe(0);
    const ontology = JSON.parse(readFileSync(join(project, "design", "knowledge", "ontology.json"), "utf8")) as { nodes: { id: string; customProperty?: string }[] };
    expect(ontology.nodes.find((n) => n.id === "token:color.ds-surface")?.customProperty).toBe("--ds-surface");
    const q = capture(["ontology", "query", "--dir", project, "--", "--ds-surface"]);
    expect(q.code, q.out + q.err).toBe(0);
    const line = q.out.split("\n").find((l) => l.startsWith("- color.ds-surface (token:color.ds-surface)"));
    expect(line).toBe("- color.ds-surface (token:color.ds-surface) — design/design.tokens.json = #fff [--ds-surface]");
  });
});

describe("a custom property carried twice, and a store sealed without the extension", () => {
  const tokensFile = (tokens: unknown): string => {
    const dir = mkdtempSync(join(tmpdir(), "ease-css-door-dup-"));
    const f = join(dir, "tokens.json");
    writeFileSync(f, JSON.stringify(tokens), "utf8");
    return f;
  };

  it("two tokens carrying one property name are an error with its own code, never a last-wins", () => {
    const f = tokensFile({ color: {
      a: { $value: "#111", $type: "color", $extensions: { [KEY]: "--ds-x" } },
      b: { $value: "#222", $type: "color", $extensions: { [KEY]: "--ds-x" } },
    } });
    const r = capture(["tokens", "compile", f, "--target", "css", "--json"]);
    expect(r.code).toBe(1);
    const err = (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
    expect(err.code).toBe("DUPLICATE_CUSTOM_PROPERTY");
    expect(err.message).toContain("'--ds-x'");
    expect(err.message).toContain("color.a");
    expect(err.message).toContain("color.b");
  });

  const clash = (): string => tokensFile({ color: {
    a: { $value: "#111111", $type: "color" },
    c: { $value: "{color.a}", $type: "color", $extensions: { [KEY]: "--color-d" } },
    d: { $value: "#333333", $type: "color" },
  } });

  it("a source name equal to another token's path-derived name is refused too, naming both token paths", () => {
    for (const args of [[], ["--target", "css"], ["--json"]]) {
      const r = capture(["tokens", "compile", clash(), ...args]);
      expect(r.code, args.join(" ")).toBe(1);
      const text = args.includes("--json") ? (JSON.parse(r.out) as { error: { code: string; message: string } }).error.message : r.err;
      if (args.includes("--json")) expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("DUPLICATE_CUSTOM_PROPERTY");
      expect(text).toContain("'color.c'");
      expect(text).toContain("'color.d'");
      expect(text).toContain("'--color-d'");
    }
  });

  it("the tailwind and figma targets do not emit source names and so do not refuse", () => {
    const tw = capture(["tokens", "compile", clash(), "--target", "tailwind"]);
    expect(tw.code).toBe(0);
    expect(tw.out).toBe("@theme {\n  --color-a: #111111;\n  --color-c: #111111;\n  --color-d: #333333;\n}\n");
    const fg = capture(["tokens", "compile", clash(), "--target", "figma"]);
    expect(fg.code).toBe(0);
    expect(Object.keys(JSON.parse(fg.out).color)).toEqual(["a", "c", "d"]);
  });

  it("two tokens carrying one property: css and --json refuse, tailwind and figma still compile", () => {
    const twice = (): string => tokensFile({ color: {
      a: { $value: "#111", $type: "color", $extensions: { [KEY]: "--ds-x" } },
      b: { $value: "#222", $type: "color", $extensions: { [KEY]: "--ds-x" } },
    } });
    expect(capture(["tokens", "compile", twice(), "--target", "css"]).code).toBe(1);
    expect(capture(["tokens", "compile", twice(), "--json"]).code).toBe(1);
    expect(capture(["tokens", "compile", twice(), "--json", "--target", "tailwind"]).code).toBe(1); // --json ignores --target and carries the css artifact
    expect(capture(["tokens", "compile", twice(), "--target", "tailwind"]).out).toBe("@theme {\n  --color-a: #111;\n  --color-b: #222;\n}\n");
    expect(capture(["tokens", "compile", twice(), "--target", "figma"]).code).toBe(0);
  });

  it("a store with no carried name behaves exactly as before: two colliding path-derived names compile, both declarations written", () => {
    const f = tokensFile(importFlatTokens({ spacing: { "gap-sm": "4px", gap: { sm: "8px" } } }).dtcg);
    const css = ":root {\n  --spacing-gap-sm: 4px;\n  --spacing-gap-sm: 8px;\n}\n";
    const r = capture(["tokens", "compile", f]);
    expect([r.code, r.out]).toEqual([0, css]);
    expect(capture(["tokens", "compile", f, "--target", "css"]).out).toBe(css);
    expect(capture(["tokens", "compile", f, "--json"]).code).toBe(0);
    expect(capture(["tokens", "compile", f, "--target", "tailwind"]).code).toBe(0);
  });

  it("a composite token that carries a name equal to one of its own derived sub-properties is refused", () => {
    const f = tokensFile({ shadow: { card: {
      $value: { offsetX: "0px", offsetY: "2px", blur: "4px", spread: "0px", color: "#000000" }, $type: "shadow",
      $extensions: { [KEY]: "--shadow-card-color" },
    } } });
    const r = capture(["tokens", "compile", f, "--target", "css", "--json"]);
    expect(r.code).toBe(1);
    const err = (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
    expect(err.code).toBe("DUPLICATE_CUSTOM_PROPERTY");
    expect(err.message).toBe("token 'shadow.card' emits the custom property '--shadow-card-color' twice in the css target — rename the carried name");
  });

  it("a duplicate that involves no carried name stays unrefused even when another token carries a name", () => {
    const f = tokensFile({
      spacing: { "gap-sm": { $value: "4px", $type: "dimension" } },
      "spacing-gap": { sm: { $value: "8px", $type: "dimension" } },
      color: { a: { $value: "#111", $type: "color", $extensions: { [KEY]: "--ds-a" } } },
    });
    expect(capture(["tokens", "compile", f]).out).toBe(":root {\n  --spacing-gap-sm: 4px;\n  --spacing-gap-sm: 8px;\n  --ds-a: #111;\n}\n");
  });

  it("a token without the extension is emitted under its path-derived name, beside one that has it", () => {
    const f = tokensFile({ color: {
      plain: { $value: "#111", $type: "color" },
      sourced: { $value: "#222", $type: "color", $extensions: { [KEY]: "--ds-sourced" } },
    } });
    const r = capture(["tokens", "compile", f, "--target", "css"]);
    expect(r.out).toBe(":root {\n  --color-plain: #111;\n  --ds-sourced: #222;\n}\n");
  });

  it("a property name that is not a custom property is ignored and the path-derived name is used", () => {
    const f = tokensFile({ color: { odd: { $value: "#111", $type: "color", $extensions: { [KEY]: "ds-no-dashes" } } } });
    expect(capture(["tokens", "compile", f, "--target", "css"]).out).toBe(":root {\n  --color-odd: #111;\n}\n");
  });
});

describe.skipIf(!built)("a store sealed before the extension existed behaves exactly as before (built CLI)", () => {
  let oldProject = "";
  beforeAll(() => {
    const stripped = sealedTree();
    for (const group of Object.values(stripped)) for (const leaf of Object.values(group)) if (leaf.$extensions !== undefined) delete leaf.$extensions[KEY];
    const file = join(root, "old-tokens.json");
    writeFileSync(file, JSON.stringify(stripped), "utf8");
    oldProject = join(root, "old-project");
    const imp = runBuilt(["ds", "import", file, "--dir", oldProject, "--name", "old", "--json"], root);
    if (imp.code !== 0) throw new Error(`ds import failed: ${imp.err}${imp.out}`);
  });

  it("compile css emits path-derived names only", () => {
    const r = runBuilt(["tokens", "compile", join(oldProject, "design", "design.tokens.json"), "--target", "css"], root);
    expect(r.code).toBe(0);
    expect(r.out.split("\n").filter((l) => /surface/.test(l))).toEqual(["  --color-color-surface: #fff;", "  --color-ds-surface: #fff;"]);
  });

  it("ds context prints the two-column table and no customProperty field", () => {
    const md = runBuilt(["ds", "context", "--dir", oldProject, "--include", "tokens"], root).out;
    const header = md.split("\n").find((l) => l.startsWith("| Token"));
    expect(header?.split("|").map((c) => c.trim()).filter((c) => c.length > 0)).toEqual(["Token", "Resolves to"]);
    expect(md).not.toContain("Custom property");
    const js = JSON.parse(runBuilt(["ds", "context", "--dir", oldProject, "--include", "tokens", "--format", "json"], root).out) as { semantic: Record<string, unknown>[] };
    expect(js.semantic.length).toBeGreaterThan(0);
    expect(js.semantic.filter((x) => "customProperty" in x)).toEqual([]);
  });

  it("the ontology token node has no customProperty", () => {
    const b = runBuilt(["ontology", "build", "--dir", oldProject, "--json"], root);
    expect(b.code, b.out + b.err).toBe(0);
    const ontology = JSON.parse(readFileSync(join(oldProject, "design", "knowledge", "ontology.json"), "utf8")) as { nodes: { id: string; kind: string; customProperty?: string }[] };
    const tokens = ontology.nodes.filter((n) => n.kind === "token");
    expect(tokens.length).toBe(11);
    expect(tokens.filter((n) => "customProperty" in n)).toEqual([]);
  });
});

describe.skipIf(!built)("a token whose property name shares no word with its path (built CLI)", () => {
  it("the ontology query finds it by the property alone and prints the property", () => {
    const file = join(root, "renamed-tokens.json");
    writeFileSync(file, JSON.stringify({ color: { accent: { $value: "#0a84ff", $type: "color", $extensions: { [KEY]: "--brand-signal" } } } }), "utf8");
    const dir = join(root, "renamed-project");
    const imp = runBuilt(["ds", "import", file, "--dir", dir, "--name", "renamed", "--json"], root);
    expect(imp.code, imp.out + imp.err).toBe(0);
    expect(runBuilt(["ontology", "build", "--dir", dir, "--json"], root).code).toBe(0);
    const q = runBuilt(["ontology", "query", "--dir", dir, "--", "--brand-signal"], root);
    expect(q.code, q.out + q.err).toBe(0);
    expect(q.out.split("\n").find((l) => l.startsWith("- color.accent"))).toBe("- color.accent (token:color.accent) — design/design.tokens.json = #0a84ff [--brand-signal]");
  });
});
