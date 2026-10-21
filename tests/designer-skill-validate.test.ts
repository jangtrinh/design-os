/**
 * build.mjs + validate.mjs through the real subprocess boundary: known-good examples pass, each
 * mechanical check has a deliberately broken input that yields exactly its one named line, and the
 * output is stable across runs. Needs the built `ui` binary (CI builds before testing).
 */
import { afterAll, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  BROKEN_DIR, EXAMPLES, SKILL_DIR, build, cleanTemps, copySkill, hasBuiltBinary, lines, makeTemp, node, readJson, validate,
} from "./helpers/designer-skill-harness.js";

afterAll(cleanTemps);
const example = (name: string): string => join(SKILL_DIR, "examples", name);

describe.skipIf(!hasBuiltBinary)("validate — known-good examples", () => {
  for (const name of EXAMPLES) {
    it(`${name}: build then validate exits 0 and prints ok, identically on a second run`, () => {
      const evidence = build(example(name));
      const first = validate(evidence);
      expect({ status: first.status, out: lines(first.stdout) }).toEqual({ status: 0, out: ["ok"] });
      expect(validate(evidence).stdout).toBe(first.stdout);
    });
  }

  it("builds byte-identical manifests for the same page into two folders", () => {
    const a = build(example("pricing-page.html"));
    const b = build(example("pricing-page.html"));
    expect(readFileSync(join(a, "manifest.json"), "utf8")).toBe(readFileSync(join(b, "manifest.json"), "utf8"));
  });
});

describe.skipIf(!hasBuiltBinary)("validate — one broken input per check yields exactly its line", () => {
  it("gate: a page without a title", () => {
    const run = validate(build(join(BROKEN_DIR, "gate-missing-title.html")));
    expect(run.status).toBe(1);
    const out = lines(run.stdout);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^gate: a11y\/document-title gate-missing-title\.html:\d+ — /);
  });

  it("external-request: a remote CSS import", () => {
    const run = validate(build(join(BROKEN_DIR, "external-request.html")));
    expect(run.status).toBe(1);
    const out = lines(run.stdout);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^external-request: external-request\.html:8 css @import loads https:\/\/fonts\.example\.test\/serif\.css — /);
  });

  it("artifact-hashes: a file changed after build, and an unlisted extra file", () => {
    const changed = build(example("pricing-page.html"));
    writeFileSync(join(changed, "site", "pricing-page.html"), readFileSync(join(changed, "site", "pricing-page.html"), "utf8") + "\n<!-- edit -->\n");
    const a = validate(changed);
    expect(a.status).toBe(1);
    expect(lines(a.stdout)).toEqual(["artifact-hashes: pricing-page.html changed after build — edit the source and rebuild"]);

    const extra = build(example("pricing-page.html"));
    writeFileSync(join(extra, "site", "stray.txt"), "x");
    const b = validate(extra);
    expect(b.status).toBe(1);
    expect(lines(b.stdout)).toEqual(["artifact-hashes: stray.txt is not in the manifest — rebuild the evidence folder"]);
  });

  it("manifest: wrong schema and a contract hash from another version", () => {
    const wrong = build(example("pricing-page.html"));
    const manifest = readJson(join(wrong, "manifest.json"));
    writeFileSync(join(wrong, "manifest.json"), JSON.stringify({ ...manifest, schema: 2 }));
    const a = validate(wrong);
    expect(a.status).toBe(1);
    expect(lines(a.stdout)).toHaveLength(1);
    expect(a.stdout).toMatch(/^manifest: manifest\.json does not match schema 1/);

    const other = build(example("pricing-page.html"));
    writeFileSync(join(other, "manifest.json"), JSON.stringify({ ...readJson(join(other, "manifest.json")), contract: "0".repeat(64) }));
    const b = validate(other);
    expect(b.status).toBe(1);
    expect(lines(b.stdout)).toEqual(["manifest: built against a different contract.md — rebuild the evidence folder with this skill version"]);
  });

  it("size: an entry over the limit", () => {
    const evidence = build(example("pricing-page.html"));
    const entry = join(evidence, "site", "pricing-page.html");
    const padded = readFileSync(entry, "utf8").replace("</body>", `${" ".repeat(600 * 1024)}\n</body>`);
    writeFileSync(entry, padded);
    const manifest = readJson(join(evidence, "manifest.json")) as { files: { path: string; bytes: number; sha256: string }[] };
    manifest.files[0] = { path: "pricing-page.html", bytes: Buffer.byteLength(padded), sha256: createHash("sha256").update(padded).digest("hex") };
    writeFileSync(join(evidence, "manifest.json"), JSON.stringify(manifest));
    const run = validate(evidence);
    expect(run.status).toBe(1);
    expect(lines(run.stdout)).toEqual(["size: pricing-page.html is larger than 524288 bytes — split the page"]);
  });

  it("contract: an edited copy is refused", () => {
    const evidence = build(example("pricing-page.html"));
    const copy = copySkill();
    writeFileSync(join(copy, "contract.md"), readFileSync(join(copy, "contract.md"), "utf8") + "\nsneaky extra flag\n");
    const run = validate(evidence, copy);
    expect(run.status).toBe(1);
    expect(lines(run.stdout)).toEqual(["contract: contract.md body does not match its sha256 header (edited copy) — reinstall ease-design to restore the shipped copy"]);
  });
});

describe.skipIf(!hasBuiltBinary)("validate and build — cannot-run and input handling", () => {
  it("exits 2 when the evidence folder has no manifest", () => {
    const run = validate(makeTemp());
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^input: .* has no manifest\.json/);
  });

  it("exits 2 with a runtime line when no ui binary can be found", () => {
    const evidence = build(example("pricing-page.html"));
    const copy = copySkill();
    const run = node(join(copy, "validate.mjs"), ["--evidence", evidence], { PATH: makeTemp(), DESIGN_OS_UI: "" });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^runtime: could not run — `ui` binary not found/);
  });

  it("prints help with exit 0 for every script", () => {
    for (const script of ["build.mjs", "validate.mjs", "look.mjs"]) {
      const run = node(join(SKILL_DIR, script), ["--help"]);
      expect({ script, status: run.status }).toEqual({ script, status: 0 });
      expect(run.stdout).toMatch(/^Usage: node /);
    }
  });

  it("build refuses an existing destination, a non-HTML target and an asset outside the page folder", () => {
    const out = makeTemp();
    const exists = node(join(SKILL_DIR, "build.mjs"), ["--target", example("pricing-page.html"), "--out", out]);
    expect(exists.status).toBe(1);
    expect(exists.stderr).toMatch(/^output: .* already exists/);

    const text = join(makeTemp(), "notes.txt");
    writeFileSync(text, "x");
    expect(node(join(SKILL_DIR, "build.mjs"), ["--target", text, "--out", join(makeTemp(), "o")]).stderr).toMatch(/^input: .* is not an \.html file/);

    const root = makeTemp();
    mkdirSync(join(root, "page"));
    writeFileSync(join(root, "page", "a.html"), '<!doctype html><link rel="stylesheet" href="../secret.css">');
    writeFileSync(join(root, "secret.css"), "body{}");
    const escape = node(join(SKILL_DIR, "build.mjs"), ["--target", join(root, "page", "a.html"), "--out", join(root, "o")]);
    expect(escape.status).toBe(1);
    expect(escape.stderr).toMatch(/outside the page folder/);
  });

  it("build copies local assets a page references and records them in the manifest", () => {
    const root = makeTemp();
    writeFileSync(join(root, "p.html"), '<!doctype html><html lang="en"><title>t</title><link rel="stylesheet" href="s.css"><body><h1>Hi there</h1></body></html>');
    writeFileSync(join(root, "s.css"), "h1{font-size:2rem}");
    copyFileSync(join(root, "s.css"), join(root, "unreferenced.css"));
    const evidence = build(join(root, "p.html"));
    const manifest = readJson(join(evidence, "manifest.json")) as { files: { path: string }[] };
    expect(manifest.files.map((f) => f.path)).toEqual(["p.html", "s.css"]);
  });
});
