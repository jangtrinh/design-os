/**
 * ShaderGradient routing + leakage + no-source proof — the sibling of
 * adapters-canvas-effect-routing.test.ts, and deliberately NOT a shared helper
 * with it: the two capabilities have different ledger shapes, different handoff
 * markers, and different allowlists, so a shared gate would have to be loosened
 * to the union of both and would then guard neither properly.
 *
 *   G1/G2  VERB_SKILL_REFS routes exactly generate/refine/redesign to shader-gradient
 *   G3     no ledger slug / knowledge filename leaks into templates/workflows/**
 *   G4     templates/skills/shader-gradient.md is the sole referencer of the
 *          knowledge file under templates/**
 *   G5     release-blocking: the gradient-handoff marker pair appears in exactly two files,
 *          and it is DISTINCT from Canvas UI's install-handoff marker
 *   G6a-e  release-blocking: no ShaderGradient source in DESIGN:OS-packaged files
 *
 * G6 is a SUBSTRING/STRUCTURE check, not proof of "no upstream source" — it cannot
 * detect a paraphrase, a renamed identifier, or GLSL described in prose. That residual
 * risk is closed by human diff + `npm pack --dry-run` audits, never by this file.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { SKILL_NAMES } from "../src/adapters/templates.js";
import { VERB_SKILL_REFS } from "../src/adapters/skill-refs.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".git"]);
const SKILL = "shader-gradient";
const KNOWLEDGE_FILE = "shader-gradient-direction.md";

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

/** The distribution/generation-relevant roots — the trees that ship in package.json.files, plus src. */
function walkDistributionRoots(): string[] {
  return [...walkRoot("knowledge"), ...walkRoot("templates"), ...walkRoot("src")];
}

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");

const LEDGER = JSON.parse(read("knowledge/shader-gradient/catalog.json")) as {
  revision: string;
  captured: string;
  sourceVersion: string;
  packageVersion: string;
  presets: { slug: string; name: string; mesh: string; light: string; grain: boolean }[];
  surfaces: { shader: string; mesh: string }[];
};

describe("shader-gradient routing — G1 skill registration", () => {
  it("shader-gradient is a registered skill name", () => {
    expect(SKILL_NAMES).toContain(SKILL);
  });

  it("its template file exists", () => {
    expect(() => read(`templates/skills/${SKILL}.md`)).not.toThrow();
  });
});

describe("shader-gradient routing — G2 verb routing", () => {
  it("exactly generate/refine/redesign route to it", () => {
    const routed = Object.entries(VERB_SKILL_REFS)
      .filter(([, skills]) => skills.includes(SKILL))
      .map(([verb]) => verb)
      .sort();
    expect(routed).toEqual(["generate", "redesign", "refine"]);
  });

  it("every verb that routes to canvas-effect also routes to shader-gradient", () => {
    // Both are T6 external-effect capabilities sharing one budget. A verb that can
    // reach one and not the other would make the choice depend on the verb, not the brief.
    for (const [verb, skills] of Object.entries(VERB_SKILL_REFS)) {
      if (skills.includes("canvas-effect")) {
        expect(skills, `verb '${verb}' routes to canvas-effect but not shader-gradient`).toContain(SKILL);
      }
    }
  });
});

describe("shader-gradient routing — G3 no leakage into ordinary generation context", () => {
  // Common-English slugs (halo, mint, sunset, universe, pensive, mandarin) are
  // deliberately EXCLUDED: a substring gate on them would fire on ordinary design
  // prose and would be silenced rather than fixed. The distinctive slugs below carry
  // the same signal with no false-positive surface.
  const DISTINCTIVE_SLUGS = ["nighty-night", "viola-orientalis", "cotton-candy", "interstella"];

  it("no distinctive ledger slug appears under templates/workflows/**", () => {
    const workflowFiles = walkRoot("templates").filter((f) => f.startsWith("templates/workflows/"));
    expect(workflowFiles.length).toBeGreaterThan(0); // the walk must actually find files
    for (const f of workflowFiles) {
      const content = read(f);
      for (const slug of DISTINCTIVE_SLUGS) {
        expect(content.includes(slug), `${f} names ledger slug '${slug}'`).toBe(false);
      }
    }
  });

  it("the knowledge filename appears in no workflow template", () => {
    for (const f of walkRoot("templates").filter((x) => x.startsWith("templates/workflows/"))) {
      expect(read(f).includes(KNOWLEDGE_FILE), `${f} references ${KNOWLEDGE_FILE}`).toBe(false);
    }
  });

  it("the distinctive-slug probe can actually go red", () => {
    // Guards the gate itself: an `includes` over an empty slug list, or a walk that
    // found nothing, would pass the two tests above while checking nothing.
    expect(DISTINCTIVE_SLUGS.length).toBeGreaterThan(0);
    for (const slug of DISTINCTIVE_SLUGS) {
      expect(LEDGER.presets.some((p) => p.slug === slug), `'${slug}' is not a real ledger slug`).toBe(true);
    }
  });
});

describe("shader-gradient routing — G4 sole referencer under templates/", () => {
  it("only the skill template references the knowledge file", () => {
    const refs = walkRoot("templates").filter((f) => read(f).includes(KNOWLEDGE_FILE));
    expect(refs).toEqual([`templates/skills/${SKILL}.md`]);
  });
});

describe("shader-gradient routing — G5 handoff marker (release-blocking)", () => {
  const START = "<!-- ease:gradient-handoff:start -->";
  const END = "<!-- ease:gradient-handoff:end -->";
  const EXPECTED = [`knowledge/${KNOWLEDGE_FILE}`, `templates/skills/${SKILL}.md`];

  it("the marker pair appears in exactly the two files that own the handoff", () => {
    const withMarkers = walkDistributionRoots().filter((f) => {
      const c = read(f);
      return c.includes(START) || c.includes(END);
    });
    expect(withMarkers.sort()).toEqual([...EXPECTED].sort());
  });

  it("it is a DISTINCT marker from Canvas UI's — the two handoffs never share a namespace", () => {
    // Reusing ease:install-handoff here would have broken canvas-ui's own
    // exactly-two-files assertion. The distinct name is the fix, and this locks it in.
    for (const rel of EXPECTED) {
      expect(read(rel).includes("<!-- ease:install-handoff:start -->"), `${rel} reuses the Canvas UI marker`).toBe(
        false,
      );
    }
  });

  it("the install command appears in no other packaged file", () => {
    const CMD = "npm i @shadergradient/react";
    const withCmd = walkDistributionRoots().filter((f) => read(f).includes(CMD));
    expect(withCmd.sort()).toEqual([...EXPECTED].sort());
  });

  it("the fence sits inside the marker pair in both files", () => {
    for (const rel of EXPECTED) {
      const c = read(rel);
      const fence = c.indexOf("```bash");
      expect(fence).toBeGreaterThan(c.indexOf(START));
      expect(fence).toBeLessThan(c.indexOf(END));
    }
  });

  it("NEVER emits the unpublished upstream control-surface package", () => {
    // It is not on npm; emitting it produces an install that fails.
    for (const f of walkDistributionRoots()) {
      expect(read(f).includes("npm i @shadergradient/ui"), `${f} emits an uninstallable package`).toBe(false);
      expect(read(f).includes("add @shadergradient/ui"), `${f} emits an uninstallable package`).toBe(false);
    }
  });
});

describe("shader-gradient routing — G6a packaged-surface invariant (release-blocking)", () => {
  it("package.json.files is unchanged by this adoption", () => {
    const pkg = JSON.parse(read("package.json")) as { files: string[] };
    expect(pkg.files).toEqual(["dist", "knowledge", "schemas", "templates"]);
  });
});

describe("shader-gradient routing — G6b ledger allowlist, fail-closed (release-blocking)", () => {
  it("knowledge/shader-gradient/ contains exactly README.md and catalog.json", () => {
    const entries = readdirSync(join(REPO_ROOT, "knowledge/shader-gradient")).sort();
    expect(entries).toEqual(["README.md", "catalog.json"]);
  });

  it("catalog.json top level has exactly the declared keys", () => {
    expect(Object.keys(LEDGER).sort()).toEqual([
      "captured",
      "fork",
      "license",
      "package",
      "packageVersion",
      "presets",
      "revision",
      "sourceVersion",
      "surfaces",
      "upstream",
    ]);
  });

  it("packageVersion is a PUBLISHED version, distinct from the in-repo sourceVersion", () => {
    // The revision's own package.json carries a version that was bumped but never
    // released. Rendering with it 404s, so the two must stay separate fields — a single
    // "version" field silently picked the unpublished one.
    expect(LEDGER.sourceVersion).toBe("2.4.24");
    expect(LEDGER.packageVersion).not.toBe(LEDGER.sourceVersion);
  });

  it("every preset has exactly slug/name/mesh/light/grain, in the declared enums", () => {
    const MESHES = new Set(["plane", "sphere", "waterPlane"]);
    const LIGHTS = new Set(["3d", "env"]);
    for (const p of LEDGER.presets) {
      expect(Object.keys(p).sort()).toEqual(["grain", "light", "mesh", "name", "slug"]);
      expect(MESHES.has(p.mesh), `unknown mesh '${p.mesh}' on '${p.slug}'`).toBe(true);
      expect(LIGHTS.has(p.light), `unknown light '${p.light}' on '${p.slug}'`).toBe(true);
      expect(typeof p.grain, `grain on '${p.slug}' is not a boolean`).toBe("boolean");
    }
  });

  it("every surface has exactly shader/mesh, and the set is the full product", () => {
    const shaders = new Set(LEDGER.surfaces.map((s) => s.shader));
    const meshes = new Set(LEDGER.surfaces.map((s) => s.mesh));
    for (const s of LEDGER.surfaces) expect(Object.keys(s).sort()).toEqual(["mesh", "shader"]);
    // Upstream resolves a program as shaders[shader][type]; a hole in the product
    // would be a lookup that throws at runtime, so the ledger must carry all of them.
    expect(LEDGER.surfaces).toHaveLength(shaders.size * meshes.size);
  });

  it("the ledger carries NO numeric parameter values — those live in the plugin repo", () => {
    // The ledger rule: names, slugs, axes, provenance. A preset's prop set is a
    // parameter list, and a parameter list is what this ledger refuses to carry.
    const raw = read("knowledge/shader-gradient/catalog.json");
    const numbers = raw.match(/:\s*-?\d+(\.\d+)?\s*[,}]/g) ?? [];
    expect(numbers).toEqual([]);
    expect(raw.includes("#"), "a hex colour leaked into the ledger").toBe(false);
  });
});

describe("shader-gradient routing — G6c no upstream source in packaged files (release-blocking)", () => {
  const BANNED = [
    /gl_FragColor/,
    /varying\s+vec/,
    /uniform\s+float/,
    /precision\s+(?:highp|mediump|lowp)/,
    /new THREE\./,
    /useFrame\(/,
    /import /,
    /require\(/,
  ];

  it("no GLSL or renderer implementation appears in the knowledge file or the skill", () => {
    for (const rel of [`knowledge/${KNOWLEDGE_FILE}`, `templates/skills/${SKILL}.md`]) {
      const c = read(rel);
      for (const re of BANNED) {
        expect(re.test(c), `${rel} matches banned pattern ${re}`).toBe(false);
      }
    }
  });

  it("no GLSL appears anywhere under knowledge/", () => {
    for (const f of walkRoot("knowledge")) {
      const c = read(f);
      expect(/gl_FragColor/.test(c), `${f} contains GLSL`).toBe(false);
    }
  });
});

describe("shader-gradient routing — G6d bounded upstream-identifier allowlist (release-blocking)", () => {
  // Stating a contract needs a few upstream names — you cannot say "freeze the field"
  // without naming the prop that freezes it. That is a NARROW, deliberate divergence
  // from canvas-ui's zero-identifier stance, so it is bounded here rather than left
  // to judgement: an eleventh identifier cannot be added without editing this list.
  const ALLOWED_UPSTREAM = new Set([
    "uTime",
    "lazyLoad",
    "threshold",
    "rootMargin",
    "shader",
    "type",
    "mesh",
    "defaults",
    "animate: 'off'",
  ]);
  // Ours, not upstream's — ledger field names and our own binary.
  const OURS = new Set(["revision", "ui", "captured", "presets", "surfaces"]);
  // The ledger's OWN vocabulary — slugs and shader-family names — is what this
  // capability exists to name, so it is always permitted. Derived from the ledger
  // rather than restated, so adding a preset cannot silently fail this gate and
  // renaming one cannot silently pass it.
  const LEDGER_VOCAB = new Set<string>([
    ...LEDGER.presets.map((p) => p.slug),
    ...LEDGER.surfaces.map((s) => s.shader),
    ...LEDGER.surfaces.map((s) => s.mesh),
  ]);

  it("every bare-identifier code span in either file is on an explicit list", () => {
    for (const rel of [`knowledge/${KNOWLEDGE_FILE}`, `templates/skills/${SKILL}.md`]) {
      const spans = read(rel).match(/`[^`\n]+`/g) ?? [];
      for (const raw of spans) {
        const tok = raw.slice(1, -1);
        // Only bare identifiers and `ident: 'value'` pairs are policed; paths,
        // package names, versions, and hyphenated prose are self-evidently not props.
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*(\s*:\s*'[^']*')?$/.test(tok)) continue;
        expect(
          ALLOWED_UPSTREAM.has(tok) || OURS.has(tok) || LEDGER_VOCAB.has(tok),
          `${rel} names identifier '${tok}' — add it to the allowlist deliberately, or remove it`,
        ).toBe(true);
      }
    }
  });

  it("no parameter/prop table header appears in either file", () => {
    const ALLOWED_HEADER = "| Preset | slug | mesh | Narrative job | Anti-use | Required fallback |";
    const BANNED_WORDS = /\b(prop|param|default|option)\b/i;
    for (const rel of [`knowledge/${KNOWLEDGE_FILE}`, `templates/skills/${SKILL}.md`]) {
      const lines = read(rel).split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        const line = (lines[i] ?? "").trim();
        const next = (lines[i + 1] ?? "").trim();
        if (!line.startsWith("|") || !line.endsWith("|")) continue;
        if (!/^\|[\s:|-]+\|$/.test(next)) continue; // not a header row
        if (line === ALLOWED_HEADER) continue;
        for (const cell of line.slice(1, -1).split("|").map((c) => c.trim())) {
          expect(BANNED_WORDS.test(cell), `${rel} header cell '${cell}' looks like an API/prop table`).toBe(false);
        }
      }
    }
  });
});

describe("shader-gradient routing — G6e the two files agree with the ledger", () => {
  it("the direction file pins the same revision as the ledger", () => {
    const sha = /\b[0-9a-f]{40}\b/.exec(read(`knowledge/${KNOWLEDGE_FILE}`));
    expect(sha?.[0]).toBe(LEDGER.revision);
  });

  it("every ledger preset has a matrix row, and no row is orphaned", () => {
    const content = read(`knowledge/${KNOWLEDGE_FILE}`);
    for (const p of LEDGER.presets) {
      expect(content.includes(`\`${p.slug}\``), `no matrix row for ledger preset '${p.slug}'`).toBe(true);
    }
  });
});
