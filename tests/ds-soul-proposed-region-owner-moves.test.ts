/**
 * Moving a bullet out of the generated region is the owner's act, not an edit; the tool writes only under
 * `## Never (proposed)` and never reads a line between its markers as binding.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { capture, errorCodeOf } from "./helpers/cli-capture.js";
import { applyProposedRegion, bindingNeverIds, misplacedRegion } from "../src/core/ds-soul-proposed-region.js";

const BEGIN = "<!-- ds-harvest-bans:begin";
const END = "<!-- ds-harvest-bans:end -->";
const SOUL = `---\nstatus: ratified\n---\n\n# Soul\n\n## Never\n\n- No purple.\n\n## Always\n\n- Real photos.\n\n## Voice\n\n- Plain.\n`;

function project(soul = SOUL): string {
  const root = mkdtempSync(join(tmpdir(), "ns-moves-"));
  mkdirSync(join(root, "design"), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "design", "soul.md"), soul);
  writeFileSync(join(root, "src", "app.html"), "<h1>Hi</h1>");
  return root;
}
const soulFile = (root: string): string => join(root, "design", "soul.md");
const soul = (root: string): string => readFileSync(soulFile(root), "utf8");
const harvest = (root: string, extra: string[] = []) => capture(["ds", "harvest-bans", "--source", join(root, "src"), "--dir", root, "--write", ...extra]);
const importAgain = (root: string) => {
  const tokens = join(root, "tokens.json");
  writeFileSync(tokens, JSON.stringify({ colors: { primary: "#3366ff" } }));
  return capture(["ds", "import", tokens, "--dir", root, "--force"]);
};
const region = (t: string): string => t.slice(t.indexOf(BEGIN), t.indexOf(END) + END.length);
const binding = (t: string): string => t.slice(t.indexOf("## Never\n"), t.indexOf("\n## ", t.indexOf("## Never\n") + 1));
const lineOf = (t: string, id: string): string => t.split("\n").find((l) => l.startsWith(`- ${id} `)) as string;
/** The owner cuts `id`'s line out of the region and pastes it under the binding Never. */
function cutAndPaste(root: string, id: string): string {
  const t = soul(root);
  const line = lineOf(t, id);
  const moved = t.replace(`${line}\n`, "").replace("- No purple.\n", `- No purple.\n${line}\n`);
  writeFileSync(soulFile(root), moved);
  return binding(moved);
}

describe("cutting a bullet out of the region and pasting it under '## Never'", () => {
  it("an accepted probe: two harvests and an import succeed, the region no longer holds it, the binding block is untouched and it is not proposed again", () => {
    const root = project();
    harvest(root);
    capture(["ds", "harvest-bans", "--accept", "NS-01", "--dir", root]);
    harvest(root);
    const never = cutAndPaste(root, "NS-01");
    for (let i = 0; i < 2; i++) {
      const r = harvest(root);
      expect(r.code, r.out + r.err).toBe(0);
      expect(region(soul(root))).not.toContain("- NS-01 ");
      expect(binding(soul(root))).toBe(never);
      expect(r.out).not.toMatch(/NS-01 monospace-ui-leak: .*-> propose/);
    }
    const imp = importAgain(root);
    expect(imp.code).toBe(0);
    expect(imp.out).not.toContain("warning: harvest skipped");
    expect(region(soul(root))).not.toContain("- NS-01 ");
    expect(binding(soul(root))).toBe(never);
  });

  it("a bullet-only probe moved by hand behaves the same", () => {
    const root = project();
    harvest(root);
    const never = cutAndPaste(root, "NS-05");
    for (let i = 0; i < 2; i++) {
      expect(harvest(root).code).toBe(0);
      expect(region(soul(root))).not.toContain("- NS-05 ");
      expect(binding(soul(root))).toBe(never);
    }
    expect(importAgain(root).out).not.toContain("warning: harvest skipped");
  });

  it("a generated line deleted without being moved comes back, and the instruction comment says so", () => {
    const root = project();
    harvest(root);
    const t = soul(root);
    writeFileSync(soulFile(root), t.replace(`${lineOf(t, "NS-06")}\n`, ""));
    expect(harvest(root).code).toBe(0);
    expect(soul(root)).toBe(t);
    expect(region(t)).toContain("A line you delete without moving it comes back on the next harvest while its count is still zero");
  });

  it("reordered generated lines and blank lines between the markers are accepted", () => {
    const root = project();
    harvest(root);
    const t = soul(root);
    const lines = region(t).split("\n");
    const inner = lines.slice(1, -1);
    const shuffled = [...inner.slice(0, 1), "", ...inner.slice(1).reverse(), ""];
    writeFileSync(soulFile(root), t.replace(region(t), [lines[0], ...shuffled, lines[lines.length - 1]].join("\n")));
    const r = harvest(root);
    expect(r.code).toBe(0);
    expect(soul(root)).toBe(t);
  });

  it("an edited line and an added line are each refused with the line named and nothing written", () => {
    const root = project();
    harvest(root);
    for (const [edit, named] of [
      [(r: string) => r.replace("- NS-02 pastel", "- NS-02 EDITED pastel"), "EDITED"],
      [(r: string) => r.replace(END, `- an added line\n${END}`), "an added line"],
    ] as [(r: string) => string, string][]) {
      const t = soul(root);
      writeFileSync(soulFile(root), t.replace(region(t), edit(region(t))));
      const before = soul(root);
      const r = capture(["ds", "harvest-bans", "--source", join(root, "src"), "--dir", root, "--write", "--json"]);
      expect(r.code).toBe(1);
      expect(errorCodeOf(r)).toBe("PROPOSED_BLOCK_EDITED");
      expect(r.out).toContain(named);
      expect(soul(root)).toBe(before);
      writeFileSync(soulFile(root), t);
    }
  });

  it("a generated line copied twice is refused (the second copy is not one the tool wrote)", () => {
    const root = project();
    harvest(root);
    const t = soul(root);
    const line = lineOf(t, "NS-03");
    writeFileSync(soulFile(root), t.replace(line, `${line}\n${line}`));
    expect(harvest(root).code).toBe(1);
  });
});

describe("the tool writes only under '## Never (proposed)'", () => {
  it("ignores a marker pair quoted in a fenced code block, leaving the fence byte-identical", () => {
    const fence = ["```md", BEGIN + " sha=000000000000 lines=00000000 -->", "- NS-01 quoted", END, "```"].join("\n");
    const root = project(SOUL.replace("- Plain.\n", `- Plain.\n\n${fence}\n`));
    for (let i = 0; i < 2; i++) {
      expect(harvest(root).code).toBe(0);
      expect(soul(root)).toContain(fence);
    }
    expect(soul(root).split(BEGIN).length).toBe(3); // the quoted one and the real one
    expect(binding(soul(root))).toContain("- No purple.");
  });

  it("refuses markers that sit inside the binding '## Never' after the heading was deleted, from harvest and from import, and writes nothing", () => {
    const root = project();
    harvest(root);
    writeFileSync(soulFile(root), soul(root).replace("## Never (proposed)\n", ""));
    const before = soul(root);
    const proposed = readFileSync(join(root, "design", "rules", "_adherence.proposed.json"), "utf8");
    for (let i = 0; i < 2; i++) {
      const r = capture(["ds", "harvest-bans", "--source", join(root, "src"), "--dir", root, "--write", "--json"]);
      expect(r.code).toBe(1);
      expect(errorCodeOf(r)).toBe("PROPOSED_BLOCK_EDITED");
      expect(r.out).toContain("put the '## Never (proposed)' heading back above the begin marker");
      expect(soul(root)).toBe(before);
    }
    const imp = importAgain(root);
    expect(imp.out).toContain("warning: harvest skipped");
    expect(soul(root)).toBe(before);
    expect(readFileSync(join(root, "design", "rules", "_adherence.proposed.json"), "utf8")).toBe(proposed);
  });

  it("soul check reports the misplaced region as an error, and a comment-only '## Never' plus that region still fails", () => {
    const root = project();
    capture(["ds", "soul", "init", "--dir", root]);
    harvest(root);
    writeFileSync(soulFile(root), soul(root).replace("## Never (proposed)\n", ""));
    const check = capture(["ds", "soul", "check", "--dir", root]);
    expect(check.code).toBe(1);
    expect(check.out).toContain("[soul-harvest-region-misplaced]");
    expect(misplacedRegion(soul(root))?.heading).toBe("## Never");
  });

  it("the reader of the binding '## Never' never returns an id from a line between markers or from a fence", () => {
    const t = `## Never\n\n- NS-02 real\n${BEGIN} sha=000000000000 lines=00000000 -->\n- NS-01 generated\n${END}\n\n\`\`\`\n- NS-03 quoted\n\`\`\`\n\n## Always\n\n- NS-04 elsewhere\n`;
    expect(bindingNeverIds(t)).toEqual(["NS-02"]);
  });

  it("applyProposedRegion refuses a region under another heading and names it", () => {
    const placed = applyProposedRegion(SOUL, ["- NS-01 x"]);
    const moved = placed.replace("## Never (proposed)\n", "");
    expect(() => applyProposedRegion(moved, ["- NS-01 x"])).toThrowError(/sit under '## Never'/);
  });
});
