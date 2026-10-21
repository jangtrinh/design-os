/**
 * Shape of the public design-os-designer skill (tool-product profile): router size and identity, every
 * file named, every rule homed, no private strings, no symlinks, code files under 200 lines.
 */
import { describe, expect, it } from "vitest";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { REPO_ROOT, SKILL_DIR, BROKEN_DIR } from "./helpers/designer-skill-harness.js";

const read = (name: string): string => readFileSync(join(SKILL_DIR, name), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    return entry.isDirectory() ? walk(abs) : [abs];
  });
}

/** Markdown link targets that are local paths (no scheme, no anchor-only). */
function localLinks(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = (m[1] ?? "").split("#")[0] ?? "";
    if (target !== "" && !/^[a-z]+:/i.test(target)) out.push(target);
  }
  return out;
}

/** Drop `//` and `#` comment lines so assertions match instructions, never their documentation. */
const stripComments = (code: string): string => code.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("design-os-designer router", () => {
  it("is at most 120 lines with name == folder and a short 'Use when' description", () => {
    const text = read("SKILL.md");
    expect(text.split("\n").length - 1).toBeLessThanOrEqual(120);
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    expect(front).toMatch(/^name: design-os-designer$/m);
    const description = /^description: "(.*)"$/m.exec(front)?.[1] ?? "";
    expect(description.startsWith("Use when ")).toBe(true);
    expect(description.length).toBeLessThanOrEqual(200);
    expect(front).not.toMatch(/^name:.*:.*$/m);
  });

  it("links every sibling file and every link resolves", () => {
    const links = new Set(localLinks(read("SKILL.md")));
    const required = walk(SKILL_DIR).map((f) => relative(SKILL_DIR, f)).filter((f) => f !== "SKILL.md");
    expect(required.filter((f) => !links.has(f))).toEqual([]);
    const missing = [...links].filter((l) => !existsSync(resolve(SKILL_DIR, l)));
    expect(missing).toEqual([]);
  });

  it("links only files that exist from every markdown file in the skill", () => {
    for (const file of walk(SKILL_DIR).filter((f) => f.endsWith(".md"))) {
      const missing = localLinks(readFileSync(file, "utf8")).filter((l) => !existsSync(resolve(dirname(file), l)));
      expect({ file: relative(SKILL_DIR, file), missing }).toEqual({ file: relative(SKILL_DIR, file), missing: [] });
    }
  });

  it("ships no symlinks and no code file over 200 lines", () => {
    for (const file of walk(SKILL_DIR)) {
      expect(lstatSync(file).isSymbolicLink(), file).toBe(false);
      if (/\.(mjs|js|ts)$/.test(file)) expect(readFileSync(file, "utf8").split("\n").length - 1, file).toBeLessThanOrEqual(200);
    }
  });

  it("holds at least two known-good HTML examples", () => {
    const examples = readdirSync(join(SKILL_DIR, "examples")).filter((f) => f.endsWith(".html"));
    expect(examples.length).toBeGreaterThanOrEqual(2);
  });
});

describe("design-os-designer rules and look homes", () => {
  const rules = read("rules.md");
  const sections = rules.split(/^## \d+\. /m).slice(1);

  it("gives every rule a statement, an API line and a Rejected-when home", () => {
    expect(sections.length).toBe(14);
    for (const section of sections) {
      for (const marker of ["Statement:", "Keep it (API):", "Rejected when:"]) expect(section).toContain(marker);
    }
  });

  it("names every validate check and every look item in the rules", () => {
    const code = stripComments(read("validate.mjs"));
    for (const check of ["contract", "manifest", "artifact-hashes", "size", "external-request", "gate"]) {
      expect(rules, check).toContain(`\`${check}\``);
      expect(code, check).toMatch(new RegExp("[`\"]" + check + "(?::|[ /])"));
    }
    const look = read("look.md");
    for (let n = 1; n <= 10; n++) {
      expect(look).toContain(`| L${n} |`);
      expect(rules).toMatch(new RegExp("`L" + n + "`"));
    }
    expect(look).toContain("## Without a browser");
  });

  it("states the exact SKIPPED line look.mjs prints", () => {
    const skipped = "look: SKIPPED (no Playwright) — capture 375, 768, 1440 with your host's own browser or screenshot tool";
    expect(read("look.md")).toContain(skipped);
  });
});

describe("public repo hygiene", () => {
  it("lists every source with a licence in ATTRIBUTION.md", () => {
    const text = read("ATTRIBUTION.md");
    for (const needle of ["PolyForm Shield 1.0.0", "Hairline", "Permission is hereby granted", "Playwright", "Apache-2.0", "WCAG"]) {
      expect(text).toContain(needle);
    }
  });

  it("contains no private product or client strings", () => {
    // The two private product codenames are assembled from parts so this file does not contain them.
    const codenames = new RegExp(`\\b(${["vs", "f"].join("")}|${["pc", "p"].join("")})\\b`, "i");
    const files = [...walk(SKILL_DIR), ...walk(BROKEN_DIR), join(REPO_ROOT, "scripts", "designer-skill-contract.mjs"),
      join(REPO_ROOT, "src", "adapters", "designer-skill.ts")];
    for (const file of files) {
      expect(codenames.test(readFileSync(file, "utf8")), file).toBe(false);
    }
  });

  it("never tells a user to install or fetch a private skill", () => {
    for (const file of walk(SKILL_DIR).filter((f) => f.endsWith(".md"))) {
      expect(/es[:-]designer/i.test(readFileSync(file, "utf8")), file).toBe(false);
    }
  });
});
