import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/core/cli-args.js";
import { runTemplatesCatalogue, runTemplatesLint } from "../src/commands/templates-catalogue.js";
import { readTemplateDescription } from "../src/adapters/templates.js";
import { buildTemplateCatalogue, registeredTemplatePaths } from "../src/core/template-catalogue-build.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CATALOGUE = join(REPO_ROOT, "schemas", "template-descriptions.json");
const scratch = () => mkdtempSync(join(tmpdir(), "ease-catalogue-"));
const catalogueDoc = () => JSON.parse(readFileSync(CATALOGUE, "utf8")) as { version: 1; templates: Array<Record<string, unknown>> };
function writeVariant(mutate: (doc: ReturnType<typeof catalogueDoc>) => void): string {
  const doc = catalogueDoc(); mutate(doc);
  const file = join(scratch(), "catalogue.json");
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  return file;
}
const check = (out: string) => runTemplatesCatalogue(parseArgs(["templates", "catalogue", "--check", "--out", out, "--json"]));
const lint = (file: string) => runTemplatesLint(parseArgs(["templates", "lint", file, "--json"]));
const checkIds = (r: { stdout?: string }) =>
  (JSON.parse(r.stdout ?? "{}").data?.findings ?? []).map((f: { checkId: string }) => f.checkId);

describe("ui templates catalogue --check", () => {
  it("passes on the committed catalogue", () => {
    const r = check(CATALOGUE);
    expect(r.exitCode, r.stdout).toBe(0);
  });

  it("covers every registered template exactly once, in path order", () => {
    expect(catalogueDoc().templates.map((t) => t.path)).toEqual(registeredTemplatePaths());
  });

  it("exits 1 when a description drifts from the template frontmatter", () => {
    const file = writeVariant((d) => { d.templates[0]!["description"] = "A hand-edited description."; });
    const r = check(file);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toEqual(["catalogue-drift"]);
  });

  it("exits 1 when a template's bytes change but the catalogue does not", () => {
    const file = writeVariant((d) => { d.templates[0]!["sourceSha256"] = "0".repeat(64); });
    expect(check(file).exitCode).toBe(1);
  });

  it("exits 1 when the catalogue is missing", () => {
    const r = check(join(scratch(), "absent.json"));
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toEqual(["catalogue-missing"]);
  });

  it("emits the same bytes it checks (write then check is a fixed point)", () => {
    const out = join(scratch(), "nested", "out.json");
    const w = runTemplatesCatalogue(parseArgs(["templates", "catalogue", "--out", out, "--json"]));
    expect(w.exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(readFileSync(CATALOGUE, "utf8"));
    expect(check(out).exitCode).toBe(0);
  });
});

describe("ui templates lint — hand-edited catalogue", () => {
  it("passes on the committed catalogue", () => {
    expect(lint(CATALOGUE).exitCode).toBe(0);
  });
  it.each([
    ["traversal path", (d: ReturnType<typeof catalogueDoc>) => { d.templates[0]!["path"] = "../secrets.md"; }],
    ["multi-line description", (d: ReturnType<typeof catalogueDoc>) => { d.templates[0]!["description"] = "a\nb"; }],
    ["empty description (must be null)", (d: ReturnType<typeof catalogueDoc>) => { d.templates[0]!["description"] = ""; }],
    ["uppercase hash", (d: ReturnType<typeof catalogueDoc>) => { d.templates[0]!["sourceSha256"] = "A".repeat(64); }],
    ["unknown property", (d: ReturnType<typeof catalogueDoc>) => { d.templates[0]!["extra"] = 1; }],
    ["wrong version", (d: ReturnType<typeof catalogueDoc>) => { (d as { version: number }).version = 2; }],
  ])("rejects %s with catalogue-schema", (_name, mutate) => {
    const r = lint(writeVariant(mutate));
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("catalogue-schema");
  });

  it("rejects duplicate paths, unsorted entries and missing coverage", () => {
    const dup = lint(writeVariant((d) => { d.templates.push({ ...d.templates[0]! }); }));
    expect(checkIds(dup)).toContain("catalogue-duplicate");
    const unsorted = lint(writeVariant((d) => { d.templates.reverse(); }));
    expect(checkIds(unsorted)).toContain("catalogue-order");
    const missing = lint(writeVariant((d) => { d.templates.pop(); }));
    expect(checkIds(missing)).toContain("catalogue-coverage");
  });
});

describe("kernel runtime reads the catalogue, never the frontmatter", () => {
  function fakePackage(catalogue: unknown): string {
    const root = scratch();
    mkdirSync(join(root, "templates", "workflows"), { recursive: true });
    mkdirSync(join(root, "schemas"));
    writeFileSync(join(root, "templates", "workflows", "generate.md"), '---\ndescription: "From the frontmatter."\n---\n');
    if (catalogue !== undefined) writeFileSync(join(root, "schemas", "template-descriptions.json"), JSON.stringify(catalogue));
    return root;
  }
  const entry = (description: string | null) => ({ version: 1, templates: [{ path: "workflows/generate.md", description, sourceSha256: "0".repeat(64) }] });

  it("returns the catalogue value even when the frontmatter says otherwise", () => {
    const root = fakePackage(entry("From the catalogue."));
    expect(readTemplateDescription(join(root, "templates", "workflows", "generate.md"))).toBe("From the catalogue.");
  });
  it("returns null for an explicit null and for an unlisted template", () => {
    const root = fakePackage(entry(null));
    expect(readTemplateDescription(join(root, "templates", "workflows", "generate.md"))).toBeNull();
    expect(readTemplateDescription(join(root, "templates", "workflows", "other.md"))).toBeNull();
  });
  it("returns null for a path outside a templates/<kind>/ location", () => {
    expect(readTemplateDescription(join(scratch(), "plain.md"))).toBeNull();
  });
  it("throws, naming the regenerate command, when the catalogue is missing", () => {
    const root = fakePackage(undefined);
    expect(() => readTemplateDescription(join(root, "templates", "workflows", "generate.md"))).toThrow(/ui templates catalogue/);
  });
});

describe("buildTemplateCatalogue", () => {
  it("records null for a template without a description and hashes its bytes", () => {
    const c = buildTemplateCatalogue(new Map([["skills/a.md", Buffer.from("# no frontmatter\n")]]));
    expect(c.templates[0]!.description).toBeNull();
    expect(c.templates[0]!.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
