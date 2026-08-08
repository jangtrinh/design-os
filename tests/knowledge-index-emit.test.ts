/**
 * The routing-index pair (Art II): knowledge-index-emit.ts (emitter) and
 * knowledge-frontmatter-check.ts (linter). Pure and FS-free on both halves, so
 * every case here is content in / findings out — no tmpdir, no build artifact.
 *
 * The linter cases are written the way the repo's own scar asks for: each one
 * BREAKS something deliberately and asserts the check goes red. A check that has
 * only ever been observed green has not been shown to run.
 */
import { describe, expect, it } from "vitest";

import { buildIndex, emitIndex, parseFrontMatter } from "../src/core/knowledge-index-emit.js";
import { frontMatterChecks, topLevelMarkdown } from "../src/core/knowledge-frontmatter-check.js";

const GOOD = `---
id: motion-craft
description: "The animation decision ladder."
when: [motion, animation, easing]
---

# Motion Craft
`;

const OTHER = `---
id: color-science
description: "OKLCH reasoning and contrast targets."
when: [color, contrast]
---

# Color Science
`;

/** The two-file core every linter case starts from, plus a README that is exempt. */
function core(extra: Record<string, string> = {}): Record<string, string> {
  return { "motion-craft.md": GOOD, "color-science.md": OTHER, "README.md": "# index\n", ...extra };
}

/** The index bytes a given content map is expected to produce. */
function expected(md: Record<string, string>): string {
  return emitIndex(buildIndex(topLevelMarkdown(md)));
}

const ids = (f: { checkId: string }[]): string[] => f.map((x) => x.checkId).sort();

describe("parseFrontMatter", () => {
  it("reads id, description, and when, stripping quotes", () => {
    const r = parseFrontMatter(GOOD);
    expect(r).toEqual({ ok: true, id: "motion-craft", description: "The animation decision ladder.", when: ["motion", "animation", "easing"] });
  });

  it("returns null — not an error — when there is no block at all", () => {
    // null and {ok:false} mean different things to the linter: absent vs malformed.
    expect(parseFrontMatter("# Motion Craft\n")).toBeNull();
  });

  it.each([
    ["never closed", "---\nid: x\n"],
    ["missing id", '---\ndescription: "d"\nwhen: [a]\n---\n'],
    ["missing description", "---\nid: x\nwhen: [a]\n---\n"],
    ["empty when", '---\nid: x\ndescription: "d"\nwhen: []\n---\n'],
    ["when is not a list", '---\nid: x\ndescription: "d"\nwhen: motion\n---\n'],
    ["unknown key", '---\nid: x\ndescription: "d"\nwhen: [a]\ntier: knowledge\n---\n'],
    ["line is not key: value", '---\nid: x\ndescription: "d"\nwhen: [a]\njust-a-word\n---\n'],
  ])("rejects front-matter that is %s", (_label, content) => {
    const r = parseFrontMatter(content);
    expect(r?.ok).toBe(false);
  });
});

describe("buildIndex / emitIndex", () => {
  it("sorts entries by id and keeps each file's authored tag order", () => {
    const idx = buildIndex(topLevelMarkdown(core()));
    expect(idx.entries.map((e) => e.id)).toEqual(["color-science", "motion-craft"]);
    expect(idx.entries[1]?.when).toEqual(["motion", "animation", "easing"]);
  });

  it("records the knowledge-relative path so a consumer can open the file", () => {
    const idx = buildIndex(topLevelMarkdown(core()));
    expect(idx.entries[0]?.path).toBe("knowledge/color-science.md");
  });

  it("is deterministic — same input, same bytes (Art I.2)", () => {
    expect(emitIndex(buildIndex(topLevelMarkdown(core())))).toBe(emitIndex(buildIndex(topLevelMarkdown(core()))));
  });

  it("skips an untagged file rather than inventing an entry for it", () => {
    const md = core({ "page-structures.md": "# Page Structures\n" });
    const idx = buildIndex(topLevelMarkdown(md));
    expect(idx.entries.map((e) => e.id)).not.toContain("page-structures");
  });

  it("ignores subdirectory files — personas/** route through persona-index", () => {
    const md = core({ "personas/editorial.md": GOOD });
    expect(buildIndex(topLevelMarkdown(md)).entries).toHaveLength(2);
  });
});

describe("frontMatterChecks — green only when nothing is broken", () => {
  it("passes a core whose committed index matches its front-matter", () => {
    const md = core();
    expect(frontMatterChecks(md, expected(md))).toEqual([]);
  });

  it("exempts README.md, which is the map rather than a destination", () => {
    const md = core();
    expect(ids(frontMatterChecks(md, expected(md)))).not.toContain("index-frontmatter-missing");
  });
});

describe("frontMatterChecks — each check, broken on purpose", () => {
  it("index-frontmatter-missing: a top-level file with no block", () => {
    const md = core({ "page-structures.md": "# Page Structures\n" });
    const f = frontMatterChecks(md, expected(md));
    expect(ids(f)).toContain("index-frontmatter-missing");
    expect(f.find((x) => x.checkId === "index-frontmatter-missing")?.message).toContain("page-structures.md");
  });

  it("index-frontmatter-bad: a block that does not parse", () => {
    const md = core({ "flow-craft.md": '---\nid: flow-craft\ndescription: "d"\nwhen: []\n---\n' });
    expect(ids(frontMatterChecks(md, expected(md)))).toContain("index-frontmatter-bad");
  });

  it("index-frontmatter-bad: id that disagrees with the filename", () => {
    const md = core({ "color-science.md": OTHER.replace("id: color-science", "id: colour-science") });
    const f = frontMatterChecks(md, expected(md));
    expect(f.find((x) => x.checkId === "index-frontmatter-bad")?.message).toContain("must match the filename");
  });

  it("index-drift: committed index is stale", () => {
    const md = core();
    const stale = expected(md).replace("The animation decision ladder.", "Something else entirely");
    expect(ids(frontMatterChecks(md, stale))).toContain("index-drift");
  });

  it("index-drift: committed index is absent", () => {
    const f = frontMatterChecks(core(), null);
    expect(f.find((x) => x.checkId === "index-drift")?.message).toContain("is missing");
  });

  it("every finding is error severity — a stale map is not advisory", () => {
    const md = core({ "page-structures.md": "# Page Structures\n" });
    for (const finding of frontMatterChecks(md, null)) expect(finding.severity).toBe("error");
  });
});
