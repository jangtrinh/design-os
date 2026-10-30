/**
 * `CLI_GENERATED_STORE_PATHS` is kept by hand, so this test ties it to the writers themselves: it runs
 * each offline `ui` command that writes into a design system's `design/` folder by default, in a
 * scratch project, and asserts that every file or empty directory the command created is classified
 * as a design-system file. A new writer whose output is not listed fails here.
 *
 * Not run, with the reason:
 *   - `ui ds docs`, `ui designmd snapshot` / `extract-tokens` / `synthesize-conventions` and
 *     `knowledge-promote`: write only to an `--out` the caller chooses, or to stdout.
 *   - `ui ds kit adopt` and `ui ds kit plan`: write to a caller-chosen absent directory, not `design/`.
 *   - `ui ingest-figma-ds`: refuses an `--out` named `design`, so it never writes into a store by default.
 *     (The `DESIGN.md` it produces is listed because the folder it fills is the one later used as a store.)
 *   - `ui figma reconcile --apply` and the other figma commands: need the Figma plugin bridge.
 *   - `ui ds guidelines export` runs on a pack whose open slots this test answers by hand, because the
 *     command refuses a pack with an unanswered question.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { designSystemFileKind } from "../src/commands/registry-provenance-store-files.js";
import { capture } from "./registry-provenance-harness.js";

const PERSONA_DATA = fileURLToPath(new URL("../knowledge/personas/personas.json", import.meta.url));
const FIGMA_DS = fileURLToPath(new URL("./fixtures/figma-ds/ds.json", import.meta.url));

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });
const scratch = (): string => { const d = mkdtempSync(join(tmpdir(), "generated-paths-")); made.push(d); return d; };

/** Every file, plus every directory that holds nothing, under `dir`, as forward-slash paths relative to it. */
function listing(dir: string): Set<string> {
  const out = new Set<string>();
  const walk = (d: string): void => {
    const entries = readdirSync(d, { withFileTypes: true });
    if (entries.length === 0 && d !== dir) out.add(relative(dir, d).split("\\").join("/"));
    for (const e of entries) {
      if (e.isDirectory()) walk(join(d, e.name));
      else out.add(relative(dir, join(d, e.name)).split("\\").join("/"));
    }
  };
  walk(dir);
  return out;
}

/** Run `args`, return what it created under `designDir` and which of those are not classified. */
function runWriter(designDir: string, args: string[]): { created: string[]; unclassified: string[] } {
  mkdirSync(designDir, { recursive: true });
  const before = listing(designDir);
  const r = capture(args);
  expect(r.code === 0 || r.code === 1 || r.code === 2, `${args.join(" ")} → ${r.out}${r.err}`).toBe(true);
  const created = [...listing(designDir)].filter((f) => !before.has(f)).sort();
  return { created, unclassified: created.filter((f) => designSystemFileKind(f) === undefined) };
}

function expectClassified(label: string, result: { created: string[]; unclassified: string[] }): void {
  expect(result.created.length, `${label} created nothing: the scenario does not exercise the writer`).toBeGreaterThan(0);
  expect(result.unclassified, `${label} wrote files that designSystemFileKind does not classify: add them to CLI_GENERATED_STORE_PATHS`).toEqual([]);
}

describe("every default output of a ui writer inside design/ is classified as a design-system file", () => {
  it("ds init, ds soul init, ds preview, ds guidelines build and export, designmd audit", () => {
    const root = scratch();
    const design = join(root, "design");
    const init = runWriter(design, ["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument", "--dir", root, "--persona-data", PERSONA_DATA]);
    expectClassified("ds init", init);
    expect(init.created).toEqual(expect.arrayContaining(["soul.md", "harvest-inbox"]));

    unlinkSync(join(design, "soul.md"));
    expectClassified("ds soul init", runWriter(design, ["ds", "soul", "init", "--dir", root]));

    expectClassified("ds preview", runWriter(design, ["ds", "preview", "--dir", root]));
    expectClassified("ds guidelines build", runWriter(design, ["ds", "guidelines", "build", "--dir", root]));

    // The export refuses an unanswered pack: answer every open question in the generated file first.
    const antiPatterns = join(design, "guidelines", "anti-patterns.md");
    writeFileSync(antiPatterns, readFileSync(antiPatterns, "utf8").replace(/^> QUESTION\([^)]*\):.*$/gm, "**Do:** Use the declared tokens.\n**Don't:** Reach for a literal value.\n**Why:** The persona forbids it."));
    const exported = runWriter(design, ["ds", "guidelines", "export", "--target", "figma", "--dir", root]);
    expectClassified("ds guidelines export", exported);
    expect(exported.created).toContain("figma-export/UPLOAD.md");

    // The audit needs a DESIGN.md in the folder; that input is the author's, the audit's output is what is judged.
    writeFileSync(join(design, "DESIGN.md"), "---\nname: probe\n---\n# Probe\n");
    const audit = runWriter(design, ["designmd", "audit", design]);
    expectClassified("designmd audit", audit);
    expect(audit.created).toEqual(expect.arrayContaining(["audit.md", "audit.json"]));
  });

  it("ingest-figma-ds refuses a store folder as its --out, so it is not a default writer into design/", () => {
    const root = scratch();
    const design = join(root, "design");
    const result = runWriter(design, ["ingest-figma-ds", FIGMA_DS, "--out", design, "--name", "probe"]);
    expect(result.created).toEqual([]);
  });

  it("ds import", () => {
    const root = scratch();
    const tokens = join(root, "tokens.json");
    writeFileSync(tokens, JSON.stringify({ colors: { primary: "#3366ff", bg: "#ffffff" }, spacing: { "space-1": 4 } }));
    expectClassified("ds import", runWriter(join(root, "design"), ["ds", "import", tokens, "--dir", root]));
  });

  it("memory record", () => {
    const root = scratch();
    expectClassified("memory record", runWriter(join(root, "design"), ["memory", "record", "harvested", "--data", '{"source":"x","what":"y"}', "--dir", root]));
  });
});
