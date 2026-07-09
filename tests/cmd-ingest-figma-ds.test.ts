/**
 * `ui ingest-figma-ds` — onboarding an existing Figma design system (C0).
 * Asserts: token tiers (primitive literals + semantic aliases), Light/Dark modes,
 * component/variant capture, style mapping into DESIGN.md, memory seeding,
 * determinism, tokens.json compilability, and every error path.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const DS = resolve(__dirname, "fixtures/figma-ds/ds.json");
const savedHome = process.env["EASE_DESIGN_HOME"];
let home: string;
let out: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ease-home-"));
  out = mkdtempSync(join(tmpdir(), "ease-ingest-"));
  process.env["EASE_DESIGN_HOME"] = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
});

interface Env { ok: boolean; command: string; data: Record<string, unknown>; error?: { code: string } }
function json(args: string[]): { code: number; env: Env } {
  const { code, out: o } = capture(args);
  return { code, env: JSON.parse(o) as Env };
}

describe("ui ingest-figma-ds — happy path", () => {
  it("compiles ds.json into tokens + registry + DESIGN.md with correct tiers", () => {
    const { code, env } = json(["ingest-figma-ds", DS, "--out", out, "--json"]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const counts = env.data.counts as { tokens: number; components: number; styles: number };
    expect(counts).toEqual({ tokens: 12, components: 3, styles: 5 });
    const tiers = env.data.tiers as { primitives: number; semantics: number; skippedTokens: number };
    expect(tiers.primitives).toBe(7); // 4 colors + space + weight + family
    expect(tiers.semantics).toBe(3);  // primary, text-body, section (all aliases)
    expect(tiers.skippedTokens).toBe(2); // boolean + non-font string
    expect(env.data.componentsRegistered).toBe(3);
  });

  it("emits DTCG primitives as literals and semantics as aliases, with Light/Dark modes", () => {
    capture(["ingest-figma-ds", DS, "--out", out]);
    const tree = JSON.parse(readFileSync(join(out, "tokens.json"), "utf8")) as Record<string, Record<string, { $value: unknown; $type: string; $extensions?: Record<string, { $value: unknown }> }>>;

    // Primitive color literal — exact hex from rgba floats.
    expect(tree["blue"]?.["500"]).toMatchObject({ $value: "#3B82F6", $type: "color" });
    // Primitive dimension / weight / family.
    expect(tree["space"]?.["4"]).toMatchObject({ $value: "16px", $type: "dimension" });
    expect(tree["font-weight"]?.["bold"]).toMatchObject({ $value: 700, $type: "fontWeight" });
    expect(tree["font-family"]?.["sans"]).toMatchObject({ $value: "Inter", $type: "fontFamily" });

    // Semantic alias with a Dark-mode override under $extensions.
    const primary = tree["color"]?.["primary"];
    expect(primary?.$value).toBe("{blue.500}");
    expect(primary?.$type).toBe("color");
    expect(primary?.$extensions?.["mode.dark"]?.$value).toBe("{blue.400}");
    // 3-segment name flattens to a 2-level path (color.text-body).
    expect(tree["color"]?.["text-body"]?.$value).toBe("{gray.900}");
    // FLOAT alias inherits the target's dimension type.
    expect(tree["space"]?.["section"]).toMatchObject({ $value: "{space.4}", $type: "dimension" });
  });

  it("produces a tokens.json that `ui tokens compile` resolves (no dangling aliases)", () => {
    capture(["ingest-figma-ds", DS, "--out", out]);
    const { code, env } = json(["tokens", "compile", join(out, "tokens.json"), "--json"]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    // The compiled CSS carries the resolved semantic token.
    expect(String(env.data.css)).toContain("--color-primary");
  });

  it("registers components with their exact names, variants, and category", () => {
    capture(["ingest-figma-ds", DS, "--out", out]);
    const reg = join(out, "component-registry.json");
    const list = json(["registry", "list", "--file", reg, "--json"]);
    expect(list.env.data.count).toBe(3);
    const names = (list.env.data.components as Array<{ name: string }>).map((c) => c.name);
    expect(names).toEqual(["Button", "Card/Elevated", "Icon"]); // sorted by name

    const button = json(["registry", "lookup", "Button", "--file", reg, "--json"]);
    const comp = button.env.data.component as { category: string; variants: string[]; description: string };
    expect(comp.category).toBe("COMPONENT_SET");
    expect(comp.variants).toContain("Size=Small");
    expect(comp.variants).toContain("Tone=Ghost");
    expect(comp.description).toContain("props: Size(Small,Large)");

    // A slash-named component takes its category from the first segment.
    const card = json(["registry", "lookup", "Card/Elevated", "--file", reg, "--json"]);
    expect((card.env.data.component as { category: string }).category).toBe("Card");
  });

  it("writes a DESIGN.md documenting tiers, components, and styles", () => {
    capture(["ingest-figma-ds", DS, "--out", out, "--name", "Acme DS"]);
    const md = readFileSync(join(out, "DESIGN.md"), "utf8");
    expect(md).toContain("# Acme DS — Design System");
    expect(md).toContain("### Primitives");
    expect(md).toContain("### Semantic tokens");
    expect(md).toContain("`color.primary`");
    expect(md).toContain("dark: {blue.400}"); // mode override rendered
    expect(md).toContain("## Components");
    expect(md).toContain("`Button`");
    expect(md).toContain("## Styles");
    expect(md).toContain("`Heading/H1`");   // text style
    expect(md).toContain("`Shadow/Card`");  // effect style
    expect(md).toContain("`Brand/Primary`"); // paint style
  });

  it("seeds ui memory when --seed-memory is given", () => {
    const nowIso = "2026-07-09T00:00:00.000Z";
    const { code } = capture(["ingest-figma-ds", DS, "--out", out, "--seed-memory", "--now", nowIso]);
    expect(code).toBe(0);
    expect(existsSync(join(out, "design", "memory.events.jsonl"))).toBe(true);
    const q = json(["memory", "query", "--dir", out, "--json"]);
    const types = (q.env.data.events as Array<{ type: string }>).map((e) => e.type).sort();
    // 1 harvested + 3 component_registered.
    expect(types.filter((t) => t === "harvested")).toHaveLength(1);
    expect(types.filter((t) => t === "component_registered")).toHaveLength(3);
  });

  it("does NOT seed memory by default", () => {
    capture(["ingest-figma-ds", DS, "--out", out]);
    expect(existsSync(join(out, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("is deterministic — identical ds.json + name + now → identical bytes", () => {
    const a = mkdtempSync(join(tmpdir(), "ease-a-"));
    const b = mkdtempSync(join(tmpdir(), "ease-b-"));
    const args = (o: string): string[] => ["ingest-figma-ds", DS, "--out", o, "--name", "X", "--now", "2026-07-09T00:00:00.000Z"];
    capture(args(a));
    capture(args(b));
    for (const f of ["tokens.json", "component-registry.json", "DESIGN.md"]) {
      expect(readFileSync(join(a, f), "utf8")).toBe(readFileSync(join(b, f), "utf8"));
    }
  });
});

describe("ui ingest-figma-ds — error paths", () => {
  it("BAD_ARG when the ds.json positional is missing", () => {
    const { code, env } = json(["ingest-figma-ds", "--json"]);
    expect(code).toBe(1);
    expect(env.error?.code).toBe("BAD_ARG");
  });

  it("FILE_NOT_FOUND for a nonexistent ds.json", () => {
    const { code, env } = json(["ingest-figma-ds", join(out, "nope.json"), "--json"]);
    expect(code).toBe(1);
    expect(env.error?.code).toBe("FILE_NOT_FOUND");
  });

  it("BAD_JSON for a malformed ds.json", () => {
    const bad = join(out, "bad.json");
    writeFileSync(bad, "{ not json", "utf8");
    const { code, env } = json(["ingest-figma-ds", bad, "--json"]);
    expect(code).toBe(1);
    expect(env.error?.code).toBe("BAD_JSON");
  });

  it("BAD_DS when JSON is valid but not a scan output", () => {
    const wrong = join(out, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ hello: "world" }), "utf8");
    const { code, env } = json(["ingest-figma-ds", wrong, "--json"]);
    expect(code).toBe(1);
    expect(env.error?.code).toBe("BAD_DS");
  });

  it("UNKNOWN_FLAG for a hallucinated flag", () => {
    const { code, env } = json(["ingest-figma-ds", DS, "--brand-color", "red", "--json"]);
    expect(code).toBe(1);
    expect(env.error?.code).toBe("UNKNOWN_FLAG");
  });

  it("BAD_ARG for an invalid --now", () => {
    const { code, env } = json(["ingest-figma-ds", DS, "--out", out, "--now", "not-a-date", "--json"]);
    expect(code).toBe(1);
    expect(env.error?.code).toBe("BAD_ARG");
  });
});
