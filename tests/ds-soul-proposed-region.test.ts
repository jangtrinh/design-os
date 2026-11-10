/**
 * The generated region of `## Never (proposed)`: only the text between the markers is the tool's. Owner
 * lines anywhere else survive byte-identical through repeated harvests; an edit between the markers is
 * refused with the differing lines named and nothing written; a section without markers gets the region
 * appended; two harvests in a row leave the file byte-identical.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { capture, errorCodeOf } from "./helpers/cli-capture.js";
import { applyProposedRegion, PROPOSED_BLOCK_EDITED } from "../src/core/ds-soul-proposed-region.js";
import { DSError } from "../src/core/design-system.js";

const BEGIN = /^<!-- ds-harvest-bans:begin sha=[0-9a-f]{12} lines=[0-9a-f,]+ -->$/m;
const END = "<!-- ds-harvest-bans:end -->";
const SOUL = `---\nstatus: ratified\n---\n\n# Soul\n\n## Never\n\n- No purple.\n\n## Always\n\n- Real photos.\n\n## Voice\n\n- Plain.\n`;
const BULLETS = ["- NS-01 monospace — 0 hits", "- NS-10 gradients — 0 hits"];

function project(soul: string): string {
  const root = mkdtempSync(join(tmpdir(), "ns-region-"));
  mkdirSync(join(root, "design"), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "design", "soul.md"), soul);
  writeFileSync(join(root, "src", "app.html"), "<h1>Hi</h1>");
  return root;
}
const soulPath = (root: string): string => join(root, "design", "soul.md");
const harvest = (root: string) => capture(["ds", "harvest-bans", "--source", join(root, "src"), "--dir", root, "--write", "--json"]);
const read = (p: string): string => readFileSync(p, "utf8");
const count = (text: string, needle: string): number => text.split(needle).length - 1;
const regionOf = (text: string): string => text.slice(text.search(BEGIN), text.indexOf(END) + END.length);

describe("owner lines outside the markers are never touched", () => {
  const OWNER_SECTION = [
    "## Never (proposed)",
    "",
    "Owner note: these came from the Q3 audit.",
    "- NS-12 owner: we keep the credit meter on the billing page.",
    "- NS-04 old bullet kept by hand — the owner wrote this line",
    "A second owner note between bullets.",
    "- NS-05 another hand-written bullet",
    "",
  ].join("\n");
  const SOUL_WITH_SECTION = SOUL.replace("## Always", `${OWNER_SECTION}\n## Always`);

  it("keeps an owner note, an owner bullet starting with a probe id and a note between bullets, byte-identical over three harvests", () => {
    const root = project(SOUL_WITH_SECTION);
    const runs: string[] = [];
    for (let i = 0; i < 3; i++) {
      expect(harvest(root).code).toBe(0);
      runs.push(read(soulPath(root)));
    }
    for (const text of runs) {
      expect(text).toContain(OWNER_SECTION.trimEnd());
      expect(text.replace(regionOf(text), "").replace(/\n{3,}/g, "\n\n")).toContain("- NS-12 owner: we keep the credit meter on the billing page.");
      expect(count(text, "- NS-12 owner: we keep the credit meter")).toBe(1);
      expect(count(text, "- NS-04 old bullet kept by hand")).toBe(1);
      expect(count(text, "A second owner note between bullets.")).toBe(1);
      expect(count(text, "ds-harvest-bans:begin")).toBe(1);
      expect(count(text, END)).toBe(1);
      expect(count(regionOf(text), "- NS-04 ")).toBe(1);
    }
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  });

  it("keeps owner text above the begin marker and below the end marker through a harvest that changes the region", () => {
    const root = project(SOUL);
    expect(harvest(root).code).toBe(0);
    const first = read(soulPath(root));
    const edited = first.replace("<!-- ds-harvest-bans:begin", "My note above the region.\n\n<!-- ds-harvest-bans:begin").replace(END, `${END}\n\n- NS-02 my own bullet below the region`);
    writeFileSync(soulPath(root), edited);
    writeFileSync(join(root, "src", "gradient.html"), `<a class="bg-linear-to-r from-a to-b">x</a>`); // NS-10 now has a hit: the region changes
    expect(harvest(root).code).toBe(0);
    const after = read(soulPath(root));
    expect(after).not.toBe(edited);
    expect(after).toContain("My note above the region.\n\n<!-- ds-harvest-bans:begin");
    expect(after).toContain(`${END}\n\n- NS-02 my own bullet below the region`);
    expect(regionOf(after)).not.toContain("- NS-10 ");
    expect(after.replace(regionOf(after), "")).toBe(edited.replace(regionOf(edited), ""));
  });

  it("a section without markers gets the region appended at its end, existing lines untouched", () => {
    const next = applyProposedRegion(SOUL_WITH_SECTION, BULLETS);
    expect(next.startsWith(SOUL_WITH_SECTION.slice(0, SOUL_WITH_SECTION.indexOf("- NS-05 another hand-written bullet") + "- NS-05 another hand-written bullet".length))).toBe(true);
    expect(next.replace(regionOf(next), "").replace(/\n{3,}/g, "\n\n")).toBe(SOUL_WITH_SECTION);
    expect(next.indexOf(END)).toBeLessThan(next.indexOf("## Always"));
    expect(count(next, "## Never (proposed)")).toBe(1);
  });

  it("creates the section right after the binding Never, and writes nothing when there are no lines and no region", () => {
    const next = applyProposedRegion(SOUL, BULLETS);
    expect(next.indexOf("## Never\n")).toBeLessThan(next.indexOf("## Never (proposed)"));
    expect(next.indexOf("## Never (proposed)")).toBeLessThan(next.indexOf("## Always"));
    expect(applyProposedRegion(SOUL, [])).toBe(SOUL);
  });

  it("two harvests in a row leave the file byte-identical, and the second says unchanged", () => {
    const root = project(SOUL);
    harvest(root);
    const first = read(soulPath(root));
    const second = harvest(root);
    expect(read(soulPath(root))).toBe(first);
    expect(JSON.parse(second.out).data.written.soul.changed).toBe(false);
  });

  it("keeps a CRLF file CRLF", () => {
    const crlf = SOUL.replace(/\n/g, "\r\n");
    const next = applyProposedRegion(crlf, BULLETS);
    expect(next.replace(/\r\n/g, "")).not.toContain("\n");
    expect(applyProposedRegion(next, BULLETS)).toBe(next);
    expect(applyProposedRegion(next, [BULLETS[0] as string])).not.toBe(next);
  });
});

describe("an edit between the markers is refused", () => {
  function editedProject(edit: (region: string) => string): { root: string; before: string; rulesBefore: string } {
    const root = project(SOUL);
    harvest(root);
    const text = read(soulPath(root));
    writeFileSync(soulPath(root), text.replace(regionOf(text), edit(regionOf(text))));
    return { root, before: read(soulPath(root)), rulesBefore: read(join(root, "design", "rules", "_adherence.proposed.json")) };
  }

  it("exits 1 with the declared code, names the differing line and the next action, and writes nothing", () => {
    const { root, before, rulesBefore } = editedProject((r) => r.replace("- NS-02 pastel", "- NS-02 MY EDIT pastel"));
    writeFileSync(join(root, "src", "gradient.html"), `<a class="bg-linear-to-r from-a to-b">x</a>`); // a change the harvest would otherwise write
    const r = harvest(root);
    expect(r.code).toBe(1);
    expect(errorCodeOf(r)).toBe(PROPOSED_BLOCK_EDITED);
    const message = (JSON.parse(r.out) as { error: { message: string } }).error.message;
    expect(message).toContain("MY EDIT");
    expect(message).toMatch(/line \d+/);
    expect(message).toContain("move your text outside the markers");
    expect(read(soulPath(root))).toBe(before);
    expect(read(join(root, "design", "rules", "_adherence.proposed.json"))).toBe(rulesBefore);
  });

  it("refuses an added line and a removed line, naming each", () => {
    const added = editedProject((r) => r.replace(END, `- my own bullet inside\n${END}`));
    expect((JSON.parse(harvest(added.root).out) as { error: { message: string } }).error.message).toContain("my own bullet inside");
    const removed = editedProject((r) => r.replace(/^- NS-03 .*\n/m, ""));
    const message = (JSON.parse(harvest(removed.root).out) as { error: { message: string } }).error.message;
    expect(message).toContain("removed or changed");
    expect(read(soulPath(removed.root))).toBe(removed.before);
  });

  it("refuses damaged markers: a missing end, a doubled begin, an edited begin line", () => {
    for (const edit of [(r: string) => r.replace(END, ""), (r: string) => `${r.split("\n")[0]}\n${r}`, (r: string) => r.replace(" sha=", " hash=")]) {
      const { root, before } = editedProject(edit);
      const r = harvest(root);
      expect(r.code).toBe(1);
      expect(errorCodeOf(r)).toBe(PROPOSED_BLOCK_EDITED);
      expect(read(soulPath(root))).toBe(before);
    }
  });

  it("the pure function throws the same error code", () => {
    const text = applyProposedRegion(SOUL, BULLETS);
    expect(() => applyProposedRegion(text.replace("- NS-10 gradients", "- NS-10 changed"), BULLETS)).toThrowError(DSError);
    try { applyProposedRegion(text.replace("- NS-10 gradients", "- NS-10 changed"), BULLETS); } catch (e) { expect((e as DSError).code).toBe(PROPOSED_BLOCK_EDITED); }
  });
});

describe("the binding Never block is never written", () => {
  it("is byte-identical after every harvest, including a refused one", () => {
    const root = project(SOUL);
    const never = (): string => { const t = read(soulPath(root)); return t.slice(t.indexOf("## Never\n"), t.indexOf("\n## ", t.indexOf("## Never\n") + 1)); };
    const before = never();
    harvest(root);
    expect(never()).toBe(before);
    const t = read(soulPath(root));
    writeFileSync(soulPath(root), t.replace("- NS-02 pastel", "- NS-02 edited pastel"));
    expect(harvest(root).code).toBe(1);
    expect(never()).toBe(before);
  });
});
