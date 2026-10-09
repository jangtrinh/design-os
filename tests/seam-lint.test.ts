import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runSeamLint } from "../src/commands/seam-lint.js";
import { parseArgs } from "../src/core/cli-args.js";
import { scanProseReads } from "../src/core/seam-scan.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const source = 'import { readFileSync } from "node:fs";\nreadFileSync("knowledge/rules.md", "utf8");\n';
function fixture(contents = source): string {
  const root = mkdtempSync(join(tmpdir(), "seam-lint-")); roots.push(root);
  mkdirSync(join(root, "src")); mkdirSync(join(root, "schemas"));
  writeFileSync(join(root, "src/read.ts"), contents);
  writeFileSync(join(root, "schemas/seam-allowlist.json"), JSON.stringify({ version: 1, reads: [] }));
  return root;
}
function lint(root: string, flags: string[] = []) {
  return runSeamLint(parseArgs(["seam", "lint", ...flags]), root);
}
function allow(root: string, reads: unknown[]) {
  writeFileSync(join(root, "schemas/seam-allowlist.json"), JSON.stringify({ version: 1, reads }));
}

describe("prose read ratchet", () => {
  it("rejects an unlisted read with a finding and summary", () => {
    const result = lint(fixture());
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("reads 1 / allowed 0 / new 1");
    expect(result.stdout).toContain("seam-new-read");
  });
  it("accepts an exact allowance, then rejects its stale entry after removal", () => {
    const root = fixture();
    const reads = scanProseReads({ "src/read.ts": source });
    allow(root, reads.map((read) => ({ ...read, data: "rules", proposedJsonHome: "schemas/rules.json" })));
    expect(lint(root).exitCode).toBe(0);
    writeFileSync(join(root, "src/read.ts"), "export {};\n");
    const result = lint(root, ["--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout!).data.findings[0].checkId).toBe("seam-stale-entry");
  });
  it("does not permit another read through an already allowed file", () => {
    const root = fixture();
    allow(root, scanProseReads({ "src/read.ts": source }).map((read) => ({ ...read, data: "rules", proposedJsonHome: "schemas/rules.json" })));
    writeFileSync(join(root, "src/read.ts"), source + 'readFileSync("docs/new.md", "utf8");\n');
    expect(lint(root).exitCode).toBe(1);
  });
  it("rejects malformed allowlists, missing src, and bad arguments", () => {
    const root = fixture();
    for (const contents of ["{", "[]", '{"version":1,"reads":[{}]}']) {
      writeFileSync(join(root, "schemas/seam-allowlist.json"), contents);
      expect(lint(root, ["--json"]).exitCode).toBe(1);
    }
    expect(lint(root, ["--allowlist"]).exitCode).toBe(1);
    expect(lint(root, ["--unknown"]).exitCode).toBe(1);
    expect(lint(root, ["extra"]).exitCode).toBe(1);
    rmSync(join(root, "src"), { recursive: true });
    expect(lint(root).exitCode).toBe(1);
  });
  it("scans only source even when sibling generated output contains reads", () => {
    const root = fixture("export {};\n");
    mkdirSync(join(root, "out")); writeFileSync(join(root, "out/generated.js"), source);
    expect(lint(root).exitCode).toBe(0);
  });
  it("keeps identity stable across unrelated line insertions and counts duplicate calls", () => {
    const root = fixture();
    allow(root, scanProseReads({ "src/read.ts": source }).map((read) => ({ ...read, data: "rules", proposedJsonHome: "schemas/rules.json" })));
    writeFileSync(join(root, "src/read.ts"), "// moved line\n" + source);
    expect(lint(root).exitCode).toBe(0);
    writeFileSync(join(root, "src/read.ts"), source + 'readFileSync("knowledge/rules.md", "utf8");\n');
    expect(lint(root).exitCode).toBe(1);
  });
  it("uses an explicit allowlist relative to the scanned root", () => {
    const root = fixture("export {};\n");
    writeFileSync(join(root, "empty.json"), '{"version":1,"reads":[]}');
    expect(lint(root, ["--allowlist", "empty.json"]).exitCode).toBe(0);
  });
});

describe("read path measurement", () => {
  it("keeps imported aliases, same-named functions, and successive corpora separate", () => {
    const sources = {
      "src/a.ts": `import { readFileSync } from 'node:fs';
export function load(input) { return readFileSync(input.root + '/a.md'); }`,
      "src/b.ts": `import { readFileSync } from 'node:fs';
export function load(input) { return readFileSync(input.root + '/b.md'); }`,
      "src/main.ts": `import { load as first } from './a.js';
import { load as second } from './b.js';
first({ root: 'knowledge' }); first({ root: 'templates' }); first();
second({ root: 'docs' });`,
    };
    expect(scanProseReads(sources).map(({ file, paths }) => ({ file, paths }))).toEqual([
      { file: "src/a.ts", paths: ["knowledge/a.md", "templates/a.md"] },
      { file: "src/b.ts", paths: ["docs/b.md"] },
    ]);
    expect(scanProseReads({ ...sources, "src/main.ts": "export {};" })).toEqual([]);
  });

  it("resolves declarations terminated by newlines rather than semicolons", () => {
    const reads = scanProseReads({ "src/read.ts": `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const base = 'knowledge'
const path = join(base, 'rules.md')
readFileSync(path, 'utf8')` });
    expect(reads).toHaveLength(1);
    expect(reads[0]?.paths).toEqual(["knowledge/rules.md"]);
  });

  it("recognizes namespace promise reads and write-only opens", () => {
    const reads = scanProseReads({ "src/read.ts": `import * as fs from 'node:fs';
fs.promises.readFile('docs/guide.md', 'utf8');
fs.readFileSync('README.md');
fs.openSync('docs/generated.md', 'wx');` });
    expect(reads.map((read) => read.line)).toEqual([2, 3]);
  });
  it("follows object parameters across module imports", () => {
    const reads = scanProseReads({
      "src/main.ts": `import { load } from './helper.js'; load({ root: 'knowledge' });`,
      "src/helper.ts": `import { readFileSync } from 'node:fs'; import { join } from 'node:path';
export function load(input: { root: string }) { const { root } = input; return readFileSync(join(root, 'rules.md')); }`,
    });
    expect(reads).toHaveLength(1);
  });

  it("ignores comments, string mentions, existence checks, and non-prose assets", () => {
    expect(scanProseReads({ "src/read.ts": readFileSync(resolve("tests/fixtures/seam/non-reads.ts"), "utf8") })).toEqual([]);
  });
  it("resolves literal, joined, interpolated and aliased filesystem reads", () => {
    const reads = scanProseReads({ "src/read.ts": readFileSync(resolve("tests/fixtures/seam/reads.ts"), "utf8") });
    expect(reads).toHaveLength(5);
    expect(reads.map((read) => read.line)).toEqual([4, 5, 6, 7, 8]);
  });
  it("follows helper parameters and return paths without conflating shadowed locals", () => {
    const reads = scanProseReads({ "src/read.ts": `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function read(path: string) { return readFileSync(path, 'utf8'); }
function pathFor(name: string) { return join('templates', name + '.md'); }
read(pathFor('guide'));
function unrelated() { const path = 'data.json'; return readFileSync(path, 'utf8'); }` });
    expect(reads).toHaveLength(1);
    expect(reads[0]?.line).toBe(3);
  });
  it("does not count a path that normalizes outside prose roots", () => {
    expect(scanProseReads({ "src/read.ts": 'import { readFileSync } from "node:fs"; readFileSync("knowledge/../data.json");' })).toEqual([]);
  });

  // Negative control matching the W3c revert scenario (see reports/dev-w3c.md finding 1):
  // a read function with a SINGLE caller, reached through a try/catch wrapper whose
  // catch branch resolves to unknown, and whose literal prose-root segment is only
  // reachable via a member-expression parameter (`input.root`). Before the
  // member-access fix in seam-paths.ts, this collapsed to zero reads.
  it("still reports a runtime read with a single caller through a try/catch wrapper reached via an object parameter", () => {
    const reads = scanProseReads({
      "src/hasher.ts": `import { readFileSync } from "node:fs";
export function hashFile(absPath: string): string { return readFileSync(absPath, "utf8"); }
export function resolveTemplate(root: string, name: string): string { return root + "/" + name + ".md"; }`,
      "src/roots.ts": `export function packageRoot(): string { return dynamicBase() + "/templates"; }`,
      "src/lint.ts": `import { hashFile, resolveTemplate } from "./hasher.js";
import { packageRoot } from "./roots.js";
function resolveSafe(root: string, name: string): string | null {
  try {
    return resolveTemplate(root, name);
  } catch {
    return null;
  }
}
function liveHashes(input: { root: string; name: string }): void {
  const p = resolveSafe(input.root, input.name);
  if (p !== null) hashFile(p);
}
export function lint(): void {
  liveHashes({ root: packageRoot(), name: "generate" });
}`,
    });
    expect(reads).toHaveLength(1);
    expect(reads[0]?.file).toBe("src/hasher.ts");
  });
});
