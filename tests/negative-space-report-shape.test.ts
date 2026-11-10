/**
 * The shape of a harvest report: where the files came from (first-level directories, most first, the root as
 * its own row), the "met" count that equals read plus skipped, one count per line per probe, and the
 * `styled.pre` / `styled.code` exemption that matches the `<pre>` / `<code>` one.
 */
import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { capture } from "./helpers/cli-capture.js";
import { harvestNegativeSpace } from "../src/core/negative-space-harvester.js";
import type { ProbeResult } from "../src/core/negative-space-harvester.js";

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ns-shape-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, "utf8");
  }
  return dir;
}
const probe = (files: Record<string, string>, id: string): ProbeResult => harvestNegativeSpace({ sourceDir: scratch(files) }).probes.find((p) => p.id === id) as ProbeResult;

describe("where the files read came from", () => {
  const files: Record<string, string> = {
    "root-a.html": "<p>a</p>", "root-b.html": "<p>b</p>",
    "a/1.html": "<p/>", "a/2.html": "<p/>", "a/deep/3.html": "<p/>",
    "b/1.html": "<p/>", "b/2.css": ".x{color:red}", "b/3.html": "<p/>",
    "c/1.html": "<p/>", "c/2.html": "<p/>",
    "d/1.html": "<p/>", "e/1.html": "<p/>", "f/1.html": "<p/>", "g/1.html": "<p/>",
  };
  it("lists at most five first-level directories, largest first, ties by path, then the root as its own row", () => {
    const w = harvestNegativeSpace({ sourceDir: scratch(files) }).walk;
    expect(w.directories).toEqual([
      { path: "a/", files: 3 }, { path: "b/", files: 3 }, { path: "c/", files: 2 }, { path: "d/", files: 1 }, { path: "e/", files: 1 },
      { path: "./", files: 2 },
    ]);
    expect(w.directoriesOmitted).toBe(2);
  });
  it("prints the rows and one line on narrowing the source, in text and in --json", () => {
    const root = scratch(files);
    const text = capture(["ds", "harvest-bans", "--source", root, "--dir", root]).out;
    expect(text).toContain("where the files read came from");
    expect(text).toMatch(/\n {4}a\/ {2}3 file\(s\)\n {4}b\/ {2}3 file\(s\)/);
    expect(text).toContain("./ (files directly in the source root)  2 file(s)");
    expect(text).toContain("+2 more directories");
    expect(text.match(/to narrow the source: ui ds harvest-bans --source <dir> --write/g)).toHaveLength(1);
    const json = JSON.parse(capture(["ds", "harvest-bans", "--source", root, "--dir", root, "--json"]).out) as { data: { report: { walk: { directories: unknown[]; directoriesOmitted: number } } } };
    expect(json.data.report.walk.directories).toHaveLength(6);
    expect(json.data.report.walk.directoriesOmitted).toBe(2);
  });
  it("is identical on two runs", () => {
    const dir = scratch(files);
    expect(harvestNegativeSpace({ sourceDir: dir }).walk.directories).toEqual(harvestNegativeSpace({ sourceDir: dir }).walk.directories);
  });
});

describe("the met count is read plus skipped", () => {
  it.skipIf(process.getuid?.() === 0)("counts an unreadable token JSON, an oversized file and a symlink", () => {
    const dir = scratch({
      "pages/settings.html": "<h1>x</h1>", "components/badge.tsx": "export const A = 1;",
      "styles/a.css": ".a{color:red}", "styles/b.css": ".b{color:red}",
      "design-tokens.json": `{"a":"#fff"}`, "locked-tokens.json": `{"b":"#000"}`,
      "vendor/big.js": "x".repeat(2 * 1024 * 1024 + 10), "outside/real.css": ".z{}",
    });
    symlinkSync(join(dir, "outside", "real.css"), join(dir, "styles", "linked.css"));
    chmodSync(join(dir, "locked-tokens.json"), 0o000);
    const { walk } = harvestNegativeSpace({ sourceDir: dir });
    chmodSync(join(dir, "locked-tokens.json"), 0o644);
    const read = walk.uiFiles + walk.styleFiles + walk.tokenJsonFiles;
    const skippedFiles = walk.skipped.filter((s) => !s.path.endsWith("/")).length;
    expect(read).toBe(2 + 3 + 1); // outside/real.css is a stylesheet too
    expect(skippedFiles).toBe(3);
    expect(walk.total).toBe(read + skippedFiles);
  });
});

describe("one line counts once per probe", () => {
  it("two monospace tokens on a line are one hit", () => {
    const p = probe({ "a.html": `<p style="font-family: 'JetBrains Mono', monospace">x</p>` }, "NS-01");
    expect(p.count).toBe(1);
    expect(p.hits).toHaveLength(1);
  });
  it("two lines are two hits", () => {
    expect(probe({ "a.html": `<p class="font-mono">x</p>\n<p class="font-mono">y</p>` }, "NS-01").count).toBe(2);
  });
});

describe("monospace in CSS-in-JS follows the <pre> and <code> exemption", () => {
  const mono = (tag: string): string => `export const B = styled.${tag}\`\n  font-family: "JetBrains Mono", monospace;\n\`;`;
  it("styled.pre and styled.code are excluded with a reason and not counted", () => {
    for (const tag of ["pre", "code"]) {
      const p = probe({ "a.tsx": mono(tag) }, "NS-01");
      expect(p.count, tag).toBe(0);
      expect(p.excluded.map((e) => e.reason), tag).toContain(`inside styled.${tag}`);
    }
  });
  it("styled.div with the same family counts, and so does a plain style outside the styled.pre literal", () => {
    expect(probe({ "a.tsx": mono("div") }, "NS-01").count).toBe(1);
    expect(probe({ "a.tsx": `${mono("pre")}\nexport const C = styled.div\`font-family: monospace;\`;` }, "NS-01").count).toBe(1);
  });
});
