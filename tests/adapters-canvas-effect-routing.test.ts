/**
 * Canvas UI routing + leakage + no-source proof (spec 028 §9, T1-T6d). Composes:
 *   T1/T2  VERB_SKILL_REFS routes exactly generate/refine/redesign to canvas-effect
 *   T3     release-blocking: no ledger slug/knowledge-filename leaks into
 *          templates/workflows/** (ordinary generation context)
 *   T4     templates/skills/canvas-effect.md is the sole referencer of the
 *          knowledge file under templates/**
 *   T5     release-blocking: the install-handoff marker pair + command string
 *          appear in exactly the two files named in spec §7 (adverse-branch cut line)
 *   T6a-d  release-blocking: no Canvas UI source in DESIGN:OS-packaged files
 *
 * T6a-d are SUBSTRING/STRUCTURE checks, not proof of "no upstream source" — they
 * cannot detect a paraphrase, a renamed identifier, an algorithm described in
 * prose, or source pasted into a file this spec does not touch. That residual
 * risk is closed by two human audits (diff audit + `npm pack --dry-run`
 * package audit), release gates recorded separately, never by this file.
 *
 * T5's "walk the tree" is scoped to the distribution/generation-relevant roots
 * (knowledge/, templates/, src/ — [R] "references/" REMOVED, spec 028 reopen §9: it is a
 * gitignored symlink into a private repo and a literal fourth root throws ENOENT on a clean
 * clone; the ledger now lives under knowledge/, so the coverage is retained) rather than the
 * literal repo root: specs/028-canvas-ui-effects/** necessarily quotes the exact marker syntax
 * and (in places) the install command as part of SPECIFYING this feature — including it would
 * make the assertion permanently unsatisfiable against the spec's own contract text, and specs/
 * ships in none of package.json's `files` trees, so it carries none of the leakage risk these
 * checks exist to catch. tests/ is covered separately by T7, not by T5.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { SKILL_NAMES } from "../src/adapters/templates.js";
import { VERB_SKILL_REFS } from "../src/adapters/skill-refs.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Walk one root under REPO_ROOT (working tree, not the git index), posix-relative to REPO_ROOT. */
function walkRoot(root: string): string[] {
  const abs = join(REPO_ROOT, root);
  const out: string[] = [];
  const rec = (base: string): void => {
    for (const ent of readdirSync(join(abs, base), { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      const rel = base === "" ? ent.name : `${base}/${ent.name}`;
      if (ent.isDirectory()) rec(rel);
      else if (ent.isFile()) out.push(`${root}/${rel}`);
    }
  };
  rec("");
  return out;
}

/** The distribution/generation-relevant roots — see file header for why specs/docs/references are excluded. */
function walkDistributionRoots(): string[] {
  return [...walkRoot("knowledge"), ...walkRoot("templates"), ...walkRoot("src")];
}

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");

const LEDGER = JSON.parse(read("knowledge/canvas-ui/catalog.json")) as {
  upstream: string;
  revision: string;
  captured: string;
  license: string;
  effects: { slug: string; name: string; family: string; overlayFallback: boolean }[];
};

describe("canvas-effect routing — T1/T2 VERB_SKILL_REFS", () => {
  it("T1: generate/refine/redesign each reference canvas-effect", () => {
    for (const verb of ["generate", "refine", "redesign"] as const) {
      expect(VERB_SKILL_REFS[verb]).toContain("canvas-effect");
    }
  });

  it("T2: every other registered verb does not (fails closed on a new verb)", () => {
    for (const [verb, refs] of Object.entries(VERB_SKILL_REFS)) {
      if (verb === "generate" || verb === "refine" || verb === "redesign") continue;
      expect(refs, `verb '${verb}' unexpectedly references canvas-effect`).not.toContain("canvas-effect");
    }
  });

  it("canvas-effect is a registered skill", () => {
    expect(SKILL_NAMES).toContain("canvas-effect");
  });
});

describe("canvas-effect routing — T3 catalog leakage (release-blocking)", () => {
  it("no file under templates/workflows/** contains a ledger slug or the knowledge filename", () => {
    const workflowFiles = walkRoot("templates").filter((f) => f.startsWith("templates/workflows/"));
    expect(workflowFiles.length).toBeGreaterThan(0);
    for (const rel of workflowFiles) {
      const content = read(rel);
      expect(content.includes("canvas-effect-direction.md"), `${rel} leaks the knowledge filename`).toBe(false);
      // Match the backtick-code-span form the matrix always uses (`slug`), not a bare
      // substring — several slugs (grid, glass, liquid, …) are ordinary CSS/design
      // vocabulary already present in these workflows for unrelated reasons, and a
      // bare-substring check would false-positive on every one of them.
      for (const effect of LEDGER.effects) {
        expect(content.includes(`\`${effect.slug}\``), `${rel} leaks ledger slug '${effect.slug}'`).toBe(false);
      }
    }
  });
});

describe("canvas-effect routing — T4 sole referencer", () => {
  it("templates/skills/canvas-effect.md is the only templates/** file referencing the knowledge file", () => {
    const referencers = walkRoot("templates")
      .filter((f) => f.endsWith(".md"))
      .filter((f) => read(f).includes("knowledge/canvas-effect-direction.md"));
    expect(referencers).toEqual(["templates/skills/canvas-effect.md"]);
  });
});

describe("canvas-effect routing — T5 adverse-branch cut line (release-blocking)", () => {
  const MARKER_START = "<!-- ease:install-handoff:start -->";
  const MARKER_END = "<!-- ease:install-handoff:end -->";
  const EXPECTED = ["knowledge/canvas-effect-direction.md", "templates/skills/canvas-effect.md"];

  it("the marker pair appears in exactly the two files named in spec §7", () => {
    const withMarkers = walkDistributionRoots().filter((f) => {
      const content = read(f);
      return content.includes(MARKER_START) || content.includes(MARKER_END);
    });
    expect(withMarkers.sort()).toEqual([...EXPECTED].sort());
  });

  it("the upstream install command string appears in no other file", () => {
    const INSTALL_CMD = "npx shadcn@latest add @canvas-ui/";
    const withCmd = walkDistributionRoots().filter((f) => read(f).includes(INSTALL_CMD));
    expect(withCmd.sort()).toEqual([...EXPECTED].sort());
  });
});

describe("canvas-effect routing — T6a packaged-surface invariant (release-blocking)", () => {
  it("package.json.files equals exactly [dist, knowledge, schemas, templates]", () => {
    const pkg = JSON.parse(read("package.json")) as { files: string[] };
    expect(pkg.files).toEqual(["dist", "knowledge", "schemas", "templates"]);
  });
});

describe("canvas-effect routing — T6b ledger allowlist, fail-closed (release-blocking)", () => {
  it("[R] knowledge/canvas-ui/ contains exactly README.md and catalog.json", () => {
    const entries = readdirSync(join(REPO_ROOT, "knowledge/canvas-ui")).sort();
    expect(entries).toEqual(["README.md", "catalog.json"]);
  });

  it("catalog.json top level has exactly upstream/revision/captured/license/effects", () => {
    expect(Object.keys(LEDGER).sort()).toEqual(["captured", "effects", "license", "revision", "upstream"]);
  });

  it("[R] every effect has exactly slug/name/family/overlayFallback, family in the two-value enum, overlayFallback boolean", () => {
    const FAMILIES = new Set(["live-html", "object"]);
    for (const e of LEDGER.effects) {
      expect(Object.keys(e).sort()).toEqual(["family", "name", "overlayFallback", "slug"]);
      expect(FAMILIES.has(e.family), `unknown family '${e.family}' on '${e.slug}'`).toBe(true);
      expect(typeof e.overlayFallback, `overlayFallback on '${e.slug}' is not a boolean`).toBe("boolean");
      if (e.family === "object") {
        expect(e.overlayFallback, `object-family '${e.slug}' must have overlayFallback:false`).toBe(false);
      }
    }
  });
});

describe("canvas-effect routing — T6c content gate (release-blocking)", () => {
  const FILES = ["knowledge/canvas-effect-direction.md", "templates/skills/canvas-effect.md"];

  it("the only fence in either file is the single-line install command inside the handoff markers", () => {
    for (const rel of FILES) {
      const content = read(rel);
      const fences = content.match(/```[a-zA-Z]*\n[\s\S]*?```/g) ?? [];
      expect(fences.length, `${rel} has ${fences.length} fenced blocks, expected exactly 1`).toBe(1);
      const fence = fences[0]!;
      const infoMatch = /^```([a-zA-Z]*)\n([\s\S]*?)```$/.exec(fence);
      expect(infoMatch, `${rel} fence did not parse`).not.toBeNull();
      const info = infoMatch![1]!;
      const body = infoMatch![2]!.trim();
      expect(["", "bash", "sh"]).toContain(info);
      expect(body.split("\n").length).toBe(1);
      expect(body.startsWith("npx shadcn@latest add @canvas-ui/")).toBe(true);
      // the fence must sit inside the marker pair
      const startIdx = content.indexOf("<!-- ease:install-handoff:start -->");
      const endIdx = content.indexOf("<!-- ease:install-handoff:end -->");
      const fenceIdx = content.indexOf(fence);
      expect(fenceIdx).toBeGreaterThan(startIdx);
      expect(fenceIdx).toBeLessThan(endIdx);
    }
  });

  it("no implementation identifiers anywhere in either file", () => {
    const BANNED = [/import /, /from "/, /require\(/, /export /, /<[A-Z][A-Za-z0-9]*/, /useEffect/, /useRef/, /new THREE\./, /=>/];
    for (const rel of FILES) {
      const content = read(rel);
      for (const re of BANNED) {
        expect(re.test(content), `${rel} matches banned pattern ${re}`).toBe(false);
      }
    }
  });

  it("no table header row contains prop/param/type/default/option, except the exact matrix header", () => {
    const ALLOWED_HEADER = "| Effect | slug | family | Narrative job | Anti-use | Required fallback |";
    const BANNED_WORDS = /\b(prop|param|type|default|option)\b/i;
    for (const rel of FILES) {
      const lines = read(rel).split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        const line = (lines[i] ?? "").trim();
        const next = (lines[i + 1] ?? "").trim();
        if (!line.startsWith("|") || !line.endsWith("|")) continue;
        const isSeparator = /^\|[\s:|-]+\|$/.test(next);
        if (!isSeparator) continue; // this line is not a table header
        if (line === ALLOWED_HEADER) continue;
        const cells = line.slice(1, -1).split("|").map((c) => c.trim());
        for (const cell of cells) {
          expect(BANNED_WORDS.test(cell), `${rel} header cell '${cell}' looks like an API/prop table`).toBe(false);
        }
      }
    }
  });

  it("the upstream package identifier appears only inside the handoff markers", () => {
    for (const rel of FILES) {
      const content = read(rel);
      const startIdx = content.indexOf("<!-- ease:install-handoff:start -->");
      const endIdx = content.indexOf("<!-- ease:install-handoff:end -->");
      const outside = content.slice(0, startIdx) + content.slice(endIdx + "<!-- ease:install-handoff:end -->".length);
      expect(outside.includes("@canvas-ui/"), `${rel} references @canvas-ui/ outside the handoff block`).toBe(false);
    }
  });
});

describe("canvas-effect routing — T6d source-tree sweep (weaker, release-blocking)", () => {
  it("no file under src/** contains the upstream package identifier", () => {
    for (const rel of walkRoot("src")) {
      expect(read(rel).includes("@canvas-ui"), `${rel} contains the upstream package identifier`).toBe(false);
    }
  });
});

describe("canvas-effect routing — T6e packaged upstream-content gate (release-blocking, new — C2/E7d, Amendment 2)", () => {
  // Limits (Art VIII): substring + quotation-shape only. Cannot detect a paraphrase, a
  // renamed identifier, an algorithm described in prose, or upstream text reflowed into our
  // own voice. The diff audit (spec E7c) closes what this test narrows.
  const FILES = [
    "knowledge/canvas-effect-direction.md",
    "knowledge/canvas-ui/README.md",
    "templates/skills/canvas-effect.md",
  ];
  // A named, auditable list (spec E7d(a)) — never a clever regex over API-shaped words.
  const BANNED_IDENTIFIERS: readonly [RegExp, string][] = [
    [/drawElementImage/, "drawElementImage (2D draw-API name)"],
    [/texElementImage2D/, "texElementImage2D (WebGL draw-API name)"],
    [/copyElementImageToTexture/, "copyElementImageToTexture (WebGPU draw-API name)"],
    [/chrome:\/\/flags/, "chrome://flags/"],
    [/THREE\./, "THREE. (code identifier)"],
    [/`three`/i, "`three` (code identifier)"],
  ];

  it("(a) no upstream/browser API identifier in any of the three packaged files", () => {
    for (const rel of FILES) {
      const content = read(rel);
      for (const [re, label] of BANNED_IDENTIFIERS) {
        expect(re.test(content), `${rel} contains banned identifier: ${label}`).toBe(false);
      }
    }
  });

  it("(b) no verbatim upstream quotation over 12 words (straight or curly double quotes)", () => {
    // Strip a leading YAML frontmatter block first — its `description: "…"` is DESIGN:OS's own
    // prose wrapped in YAML string syntax, not an upstream quotation, and would otherwise
    // false-positive on quote *syntax* rather than quoted *content*.
    const stripFrontmatter = (s: string): string =>
      s.startsWith("---\n") ? s.replace(/^---\n[\s\S]*?\n---\n/, "") : s;
    const quoteRe = /"([^"]{0,600})"|“([^”]{0,600})”/g;
    for (const rel of FILES) {
      const content = stripFrontmatter(read(rel));
      let m: RegExpExecArray | null;
      while ((m = quoteRe.exec(content)) !== null) {
        const span = (m[1] ?? m[2] ?? "").trim();
        const wordCount = span.length === 0 ? 0 : span.split(/\s+/).length;
        expect(wordCount, `${rel} has a ${wordCount}-word quoted span: "${span}"`).toBeLessThanOrEqual(12);
      }
    }
  });

  it("(c) preservation, asserted positively: official Chrome URL, checked date, and pinned revision survive the purge", () => {
    const PRESERVED = [
      "knowledge/canvas-effect-direction.md",
      "knowledge/canvas-ui/README.md",
    ];
    const CHROME_URL = "https://developer.chrome.com/blog/html-in-canvas-origin-trial";
    const CHECKED_DATE_RE = /checked:?\*{0,2}\s*20\d{2}-\d{2}-\d{2}/i;
    const REVISION = "728550d4523e1b8bef834b64b3e936c215cad630";
    for (const rel of PRESERVED) {
      const content = read(rel);
      expect(content.includes(CHROME_URL), `${rel} is missing the official Chrome URL`).toBe(true);
      expect(CHECKED_DATE_RE.test(content), `${rel} is missing a checked: YYYY-MM-DD date`).toBe(true);
      expect(content.includes(REVISION), `${rel} is missing the pinned revision`).toBe(true);
    }
  });
});

describe("canvas-effect routing — T7 symlink-independence sweep (release-blocking)", () => {
  const SWEPT_ROOTS = [...walkRoot("knowledge"), ...walkRoot("templates"), ...walkRoot("src"), ...walkRoot("tests")];
  // Built at runtime, never written as a contiguous literal in this file's own source —
  // this test walks tests/ (itself included), so a literal copy of the needle would make
  // the check fail on its own source the moment it is written.
  const MACHINE_LOCAL_LEDGER_PATH = ["references", "canvas-ui"].join("/");

  it("no file under knowledge/, templates/, src/, or tests/ names the machine-local ledger path", () => {
    for (const rel of SWEPT_ROOTS) {
      expect(
        read(rel).includes(MACHINE_LOCAL_LEDGER_PATH),
        `${rel} still names the machine-local ledger path`,
      ).toBe(false);
    }
  });

  it("[R] no ease:source marker under knowledge/ carries a ref beginning references/ or taste/", () => {
    const markerRe = /<!--\s*ease:source\b([^>]*?)-->/g;
    for (const rel of walkRoot("knowledge").filter((f) => f.endsWith(".md"))) {
      const content = read(rel);
      let m: RegExpExecArray | null;
      while ((m = markerRe.exec(content)) !== null) {
        const ref = /\bref="([^"]*)"/.exec(m[1] ?? "");
        const target = ref?.[1] ?? "";
        expect(
          target.startsWith("references/") || target.startsWith("taste/"),
          `${rel} ease:source ref="${target}" points into a machine-local symlink`,
        ).toBe(false);
      }
    }
  });
});
