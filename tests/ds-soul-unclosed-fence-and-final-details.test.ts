/**
 * A soul that ends inside a code fence is refused (it used to grow on every run); the fence rules the region
 * relies on; focus rings judged per selector; the omitted-directory file count; the rules-file warning for a
 * shape the loader rejects; the colour functions that are listed as limits.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { capture, errorCodeOf } from "./helpers/cli-capture.js";
import { harvestNegativeSpace } from "../src/core/negative-space-harvester.js";
import { NEGATIVE_SPACE_LIMITS } from "../src/core/negative-space-probes.js";

const BEGIN = "<!-- ds-harvest-bans:begin sha=000000000000 lines=00000000 -->";
const END = "<!-- ds-harvest-bans:end -->";
const SOUL = `---\nstatus: ratified\n---\n\n# Soul\n\n## Never\n\n- No purple.\n\n## Always\n\n- Real photos.\n\n## Voice\n\n- Plain.\n`;

function project(soul = SOUL): string {
  const root = mkdtempSync(join(tmpdir(), "ns-fence-"));
  mkdirSync(join(root, "design", "rules"), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "design", "soul.md"), soul);
  writeFileSync(join(root, "src", "app.html"), "<h1>Hi</h1>");
  return root;
}
const soulFile = (r: string): string => join(r, "design", "soul.md");
const soul = (r: string): string => readFileSync(soulFile(r), "utf8");
const harvestJson = (r: string) => capture(["ds", "harvest-bans", "--source", join(r, "src"), "--dir", r, "--write", "--json"]);
const harvest = (r: string) => capture(["ds", "harvest-bans", "--source", join(r, "src"), "--dir", r, "--write"]);
const importAgain = (r: string) => {
  const tokens = join(r, "tokens.json");
  writeFileSync(tokens, JSON.stringify({ colors: { primary: "#3366ff" } }));
  return capture(["ds", "import", tokens, "--dir", r, "--force"]);
};
const count = (t: string, needle: string): number => t.split(needle).length - 1;

describe("a soul that ends inside an unclosed code fence", () => {
  const UNCLOSED = SOUL.replace("- No purple.\n", "- No purple.\n\n```md\nan example the owner never closed\n");
  it("three harvests and one import leave the file byte-identical; the harvest exits 1 with the declared code, names the opening line and says to close it", () => {
    const root = project(UNCLOSED);
    const before = soul(root);
    const openLine = before.split("\n").indexOf("```md") + 1;
    for (let i = 0; i < 3; i++) {
      const r = harvestJson(root);
      expect(r.code).toBe(1);
      expect(errorCodeOf(r)).toBe("PROPOSED_BLOCK_EDITED");
      expect(r.out).toContain(`opened on line ${openLine}`);
      expect(r.out).toContain("close the fence");
      expect(soul(root)).toBe(before);
    }
    const imp = importAgain(root);
    expect(imp.code).toBe(0);
    expect(imp.out).toContain("warning: harvest skipped");
    expect(soul(root)).toBe(before);
  });
  it("is refused with a region above the fence as well, and soul check reports it as an error naming the line", () => {
    const root = project();
    harvest(root);
    const t = soul(root);
    writeFileSync(soulFile(root), `${t}\n~~~\nnever closed\n`);
    const before = soul(root);
    expect(harvest(root).code).toBe(1);
    expect(soul(root)).toBe(before);
    const check = capture(["ds", "soul", "check", "--dir", root]);
    expect(check.code).toBe(1);
    expect(check.out).toContain("[soul-unclosed-code-fence]");
    expect(check.out).toMatch(/line \d+/);
  });
  it("a closed fence keeps working", () => {
    const root = project(SOUL.replace("- No purple.\n", "- No purple.\n\n```md\nexample\n```\n"));
    expect(harvest(root).code).toBe(0);
    const first = soul(root);
    expect(harvest(root).code).toBe(0);
    expect(soul(root)).toBe(first);
    expect(count(first, "ds-harvest-bans:begin")).toBe(1);
    expect(capture(["ds", "soul", "check", "--dir", root]).out).not.toContain("soul-unclosed-code-fence");
  });
});

describe("the fence rules the region relies on", () => {
  it("a '## Never (proposed)' heading inside a fence is text: the section is created outside it and the fence is untouched", () => {
    const fence = "```md\n## Never (proposed)\n```";
    const root = project(SOUL.replace("- Plain.\n", `- Plain.\n\n${fence}\n`));
    expect(harvest(root).code).toBe(0);
    const t = soul(root);
    expect(t).toContain(fence);
    expect(count(t, "## Never (proposed)")).toBe(2);
    expect(t.indexOf("ds-harvest-bans:begin")).toBeLessThan(t.indexOf("```md"));
  });
  it("a backtick fence is not closed by a tilde line: markers after it are still fence text", () => {
    const fence = `\`\`\`md\n~~~\n${BEGIN}\n- NS-01 quoted\n${END}\n\`\`\``;
    const root = project(SOUL.replace("- Plain.\n", `- Plain.\n\n${fence}\n`));
    const r = harvest(root);
    expect(r.code, r.out + r.err).toBe(0);
    expect(soul(root)).toContain(fence);
  });
  it("a heading inside a fence does not become the section of the region", () => {
    const root = project();
    harvest(root);
    const t = soul(root);
    writeFileSync(soulFile(root), t.replace("<!-- ds-harvest-bans:begin", "```md\n## Voice\n```\n\n<!-- ds-harvest-bans:begin"));
    const r = harvest(root);
    expect(r.code, r.out + r.err).toBe(0);
  });
});

describe("a focus ring is exempt only when every selector of the rule is a focus selector", () => {
  const count11 = (css: string): number => {
    const dir = mkdtempSync(join(tmpdir(), "ns-focus-"));
    writeFileSync(join(dir, "s.css"), css);
    return harvestNegativeSpace({ sourceDir: dir }).probes.find((p) => p.id === "NS-11")?.count ?? -1;
  };
  it("does not count a ring on :focus, :focus-visible, :focus-within, or a focus-named class or attribute", () => {
    for (const sel of ["input:focus", "a:focus-visible", "div:focus-within", ".focus-ring", ".btn[data-focus-visible]", "a:focus, a:focus-visible"]) {
      expect(count11(`${sel}{box-shadow:0 0 0 3px #3b82f6}`), sel).toBe(0);
    }
  });
  it("counts a ring in a selector list that mixes a focus selector with another", () => {
    expect(count11(".avatar, .btn:focus{box-shadow:0 0 0 3px #3b82f6}")).toBe(1);
    expect(count11(".avatar{box-shadow:0 0 0 3px #3b82f6}")).toBe(1);
  });
});

describe("colour functions that are not judged are limits", () => {
  it("names oklch(), lab(), lch() and color-mix() in the limits", () => {
    const line = NEGATIVE_SPACE_LIMITS.find((l) => l.includes("var()")) ?? "";
    for (const f of ["oklch()", "lab()", "lch()", "color-mix()"]) expect(line, f).toContain(f);
  });
});

describe("the directory rows add up", () => {
  it("states the number of omitted directories and the files read in them", () => {
    const dir = mkdtempSync(join(tmpdir(), "ns-rows-"));
    const files: Record<string, number> = { a: 7, b: 6, c: 5, d: 4, e: 3, f: 2, g: 1 };
    for (const [d, n] of Object.entries(files)) for (let i = 0; i < n; i++) { mkdirSync(join(dir, d), { recursive: true }); writeFileSync(join(dir, d, `${i}.html`), "<p/>"); }
    const w = harvestNegativeSpace({ sourceDir: dir }).walk;
    expect(w.directoriesOmitted).toBe(2);
    expect(w.directoriesOmittedFiles).toBe(3);
    expect(w.directories.reduce((n, d) => n + d.files, 0) + w.directoriesOmittedFiles).toBe(w.uiFiles);
    expect(capture(["ds", "harvest-bans", "--source", dir, "--dir", dir]).out).toContain("+2 more directories (3 file(s))");
  });
});

describe("ui ds soul check and a rules file the loader rejects", () => {
  const rules = (text: string): string => {
    const root = project();
    writeFileSync(join(root, "design", "rules", "_adherence.rules.json"), text);
    return capture(["ds", "soul", "check", "--dir", root]).out;
  };
  it("warns once, naming the file, for valid JSON in a shape the loader rejects", () => {
    for (const bad of [`{"rules":"nope"}`, `{"rules":[{"id":"x","kind":"no-such-kind"}]}`, `{}`]) {
      const out = rules(bad);
      expect(count(out, "[soul-rules-unreadable]"), bad).toBe(1);
      expect(out).toContain("_adherence.rules.json");
    }
  });
  it("does not warn for a valid file", () => {
    expect(rules(JSON.stringify({ rules: [{ id: "no-purple", kind: "token-ban", severity: "error", message: "m", source: "s", tokens: ["purple"] }] }))).not.toContain("soul-rules-unreadable");
  });
});

