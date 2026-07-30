import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  figmaNodeRelPath,
  readFigmaNode,
  validateFigmaNodeSidecar,
  writeFigmaNode,
  SIDECAR_VERSION,
  type FigmaNodeSpec,
} from "../src/core/figma-node-reader.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const dirs: string[] = [];
function tmpDesignDir(): string {
  const d = mkdtempSync(join(tmpdir(), "figma-node-reader-test-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A small but non-trivial node: nested children, bindings and an INSTANCE (P1+P2 output). */
function sampleNode(): FigmaNodeSpec {
  return {
    type: "FRAME",
    name: "Button/Primary",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    paddingTop: 12,
    fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.9, a: 1 } }],
    boundVariables: { fills: [{ type: "VARIABLE_ALIAS", name: "color.primary" }] },
    children: [
      { type: "TEXT", name: "Label", characters: "Click", fontSize: 14 },
      {
        type: "INSTANCE",
        name: "Icon/Chevron",
        componentRef: { key: "abc123" },
        properties: { size: "small" },
      },
    ],
  };
}

// ─── figmaNodeRelPath (pure) ──────────────────────────────────────────────────

describe("figmaNodeRelPath", () => {
  it("derives components/<slug>.figma.json from a Category/Variant name", () => {
    expect(figmaNodeRelPath("Button/Primary")).toBe("components/button-primary.figma.json");
    expect(figmaNodeRelPath("Card/Pricing")).toBe("components/card-pricing.figma.json");
  });

  it("is deterministic — same name always yields the same pointer", () => {
    expect(figmaNodeRelPath("Button/Primary")).toBe(figmaNodeRelPath("Button/Primary"));
  });

  it("produces a pointer the registry pointer validator accepts", async () => {
    const { validateFigmaNodePointer } = await import("../src/core/registry-store.js");
    expect(validateFigmaNodePointer(figmaNodeRelPath("Button/Primary"))).toBe(
      "components/button-primary.figma.json",
    );
  });

  // Registry-integrity phase 03 (5.2), §3 — the file slug kills a cross-file name collision.
  describe("with fileSlug (additive — kills a cross-file name collision)", () => {
    it("nests under components/<file-slug>/ instead of the flat layout", () => {
      expect(figmaNodeRelPath("Button/Primary", "fileA")).toBe("components/fileA/button-primary.figma.json");
    });

    it("two files' SAME name never collide on disk", () => {
      const a = figmaNodeRelPath("Button/Primary", "fileA");
      const b = figmaNodeRelPath("Button/Primary", "fileB");
      expect(a).not.toBe(b);
    });

    // Registry-integrity phase 03 fix round (F5) — a safe (`[A-Za-z0-9_-]+`) fileSlug
    // must pass through CASE-PRESERVING: two real Figma file identities differing only by
    // case ("fileA" vs "filea") are DISTINCT and must never be lowercased onto the same
    // directory — the exact collision this finding exists to close.
    it("a safe fileSlug is never lowercased — case-differing slugs stay distinct", () => {
      const upper = figmaNodeRelPath("Button/Primary", "fileA");
      const lower = figmaNodeRelPath("Button/Primary", "filea");
      expect(upper).toBe("components/fileA/button-primary.figma.json");
      expect(lower).toBe("components/filea/button-primary.figma.json");
      expect(upper).not.toBe(lower);
    });

    it("the fileSlug segment is itself sanitized (defense in depth, not trusted verbatim) — safe form + short hash, never a lossy lowercase", () => {
      const relPath = figmaNodeRelPath("Button/Primary", "File With Spaces!");
      // Stage-4 MINOR13 — `--` (double dash) separates the safe form from the hash,
      // reserved so the hashed namespace can never collide with a safe-passthrough one.
      expect(relPath).toMatch(/^components\/file-with-spaces--[0-9a-f]{8}\/button-primary\.figma\.json$/);
      // deterministic — the same raw slug always derives the same hashed directory
      expect(figmaNodeRelPath("Button/Primary", "File With Spaces!")).toBe(relPath);
      // round-trips distinctly from a DIFFERENT unsafe slug that strips to the same safe form
      const other = figmaNodeRelPath("Button/Primary", "File With Spaces?");
      expect(other).not.toBe(relPath);
    });

    // Stage-4 MINOR13 — a SAFE slug that happens to already contain the reserved `--`
    // marker must route through the hash path too, so a passthrough segment NEVER
    // contains `--` and a hashed one ALWAYS does — the two namespaces stay disjoint.
    it("a safe slug containing the reserved `--` marker is routed through the hash path, not passed through raw", () => {
      const relPath = figmaNodeRelPath("Button/Primary", "my--file");
      expect(relPath).not.toBe("components/my--file/button-primary.figma.json");
      // `toSafeFilename` collapses the "--" run to a single dash ("my-file"), so the
      // hashed form is `my-file--<hash>` — still unambiguously distinguishable (via the
      // reserved `--` before the hash) from any safe-passthrough segment.
      expect(relPath).toMatch(/^components\/my-file--[0-9a-f]{8}\/button-primary\.figma\.json$/);
    });

    it("still produces a pointer the registry validator accepts", async () => {
      const { validateFigmaNodePointer } = await import("../src/core/registry-store.js");
      expect(validateFigmaNodePointer(figmaNodeRelPath("Button/Primary", "fileA"))).toBe(
        "components/fileA/button-primary.figma.json",
      );
    });
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("writeFigmaNode → readFigmaNode round-trip", () => {
  it("reads back a written node identical to the input (deep, incl. bindings + instance)", () => {
    const dir = tmpDesignDir();
    const node = sampleNode();

    const res = writeFigmaNode(dir, "Button/Primary", node);
    expect(res.written).toBe(true);
    expect(res.relPath).toBe("components/button-primary.figma.json");

    const back = readFigmaNode(dir, res.relPath);
    expect(back).toEqual(node);
  });

  it("creates the components/ sub-directory when absent", () => {
    const dir = tmpDesignDir();
    const res = writeFigmaNode(dir, "Card/Pricing", sampleNode());
    expect(statSync(join(dir, "components")).isDirectory()).toBe(true);
    expect(statSync(res.path).isFile()).toBe(true);
  });

  it("writes the envelope: version + name + node, JSON, newline-terminated", () => {
    const dir = tmpDesignDir();
    const res = writeFigmaNode(dir, "Button/Primary", sampleNode());
    const raw = readFileSync(res.path, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(SIDECAR_VERSION);
    expect(parsed.name).toBe("Button/Primary");
    expect(parsed.node.type).toBe("FRAME");
  });

  it("stores the node under a pointer that resolves from the design dir", () => {
    const dir = tmpDesignDir();
    const { relPath } = writeFigmaNode(dir, "Button/Primary", sampleNode());
    // The pointer is exactly what a ComponentRecord.figmaNode holds — reading it back
    // with only (designDir, pointer) is the whole P4 contract.
    expect(() => readFigmaNode(dir, relPath)).not.toThrow();
  });

  it("with a fileSlug, writes under components/<file-slug>/ and reads back identically", () => {
    const dir = tmpDesignDir();
    const node = sampleNode();
    const res = writeFigmaNode(dir, "Button/Primary", node, "fileA");
    expect(res.written).toBe(true);
    expect(res.relPath).toBe("components/fileA/button-primary.figma.json");
    expect(statSync(join(dir, "components", "fileA")).isDirectory()).toBe(true);
    expect(readFigmaNode(dir, res.relPath)).toEqual(node);
  });

  it("two files' same-named component never collide on disk when fileSlug is given", () => {
    const dir = tmpDesignDir();
    const nodeA = { ...sampleNode(), itemSpacing: 1 };
    const nodeB = { ...sampleNode(), itemSpacing: 2 };
    const resA = writeFigmaNode(dir, "Button/Primary", nodeA, "fileA");
    const resB = writeFigmaNode(dir, "Button/Primary", nodeB, "fileB");
    expect(resA.relPath).not.toBe(resB.relPath);
    expect(readFigmaNode(dir, resA.relPath)["itemSpacing"]).toBe(1);
    expect(readFigmaNode(dir, resB.relPath)["itemSpacing"]).toBe(2); // ← would clobber without partitioning
  });
});

// ─── Content guard ────────────────────────────────────────────────────────────

describe("writeFigmaNode — content guard", () => {
  it("does not rewrite when content is unchanged", () => {
    const dir = tmpDesignDir();
    const first = writeFigmaNode(dir, "Button/Primary", sampleNode());
    expect(first.written).toBe(true);
    const mtimeBefore = statSync(first.path).mtimeMs;

    // A structurally identical re-capture must produce zero churn.
    const second = writeFigmaNode(dir, "Button/Primary", sampleNode());
    expect(second.written).toBe(false);
    expect(second.relPath).toBe(first.relPath);
    expect(statSync(first.path).mtimeMs).toBe(mtimeBefore);
  });

  it("rewrites when the node content changed", () => {
    const dir = tmpDesignDir();
    writeFigmaNode(dir, "Button/Primary", sampleNode());

    const changed = sampleNode();
    changed["itemSpacing"] = 16;
    const res = writeFigmaNode(dir, "Button/Primary", changed);
    expect(res.written).toBe(true);
    expect(readFigmaNode(dir, res.relPath)["itemSpacing"]).toBe(16);
  });
});

// ─── Read failures ────────────────────────────────────────────────────────────

describe("readFigmaNode — failures", () => {
  it("throws FILE_NOT_FOUND when the sidecar is missing", () => {
    const dir = tmpDesignDir();
    expect(() => readFigmaNode(dir, "components/absent.figma.json")).toThrow(
      expect.objectContaining({ code: "FILE_NOT_FOUND" }),
    );
  });

  it("throws BAD_ARG for a pointer escaping the design dir", () => {
    const dir = tmpDesignDir();
    expect(() => readFigmaNode(dir, "../../etc/passwd.figma.json")).toThrow(
      expect.objectContaining({ code: "BAD_ARG" }),
    );
  });

  it("throws BAD_SIDECAR for malformed JSON", () => {
    const dir = tmpDesignDir();
    mkdirSync(join(dir, "components"), { recursive: true });
    writeFileSync(join(dir, "components", "broken.figma.json"), "{not json", "utf8");
    expect(() => readFigmaNode(dir, "components/broken.figma.json")).toThrow(
      expect.objectContaining({ code: "BAD_SIDECAR" }),
    );
  });
});

// ─── Envelope validation (pure) ───────────────────────────────────────────────

describe("validateFigmaNodeSidecar", () => {
  const ok = { version: SIDECAR_VERSION, name: "Button/Primary", node: { type: "FRAME", name: "Root" } };

  it("accepts a well-formed envelope and returns the node", () => {
    expect(validateFigmaNodeSidecar(ok, "t").node).toEqual({ type: "FRAME", name: "Root" });
  });

  it("passes an unknown node field through untouched (payload is owned by figma-agent)", () => {
    const withFuture = { ...ok, node: { type: "FRAME", name: "Root", someFutureField: 7 } };
    expect(validateFigmaNodeSidecar(withFuture, "t").node["someFutureField"]).toBe(7);
  });

  it("rejects a non-object root, a missing version/name, and a missing node", () => {
    for (const bad of [null, [], "x", {}, { version: "0.1.0" }, { version: "0.1.0", name: "A" }]) {
      expect(() => validateFigmaNodeSidecar(bad, "t")).toThrow(
        expect.objectContaining({ code: "BAD_SIDECAR" }),
      );
    }
  });

  it("rejects an unknown node.type", () => {
    expect(() => validateFigmaNodeSidecar({ ...ok, node: { type: "WIDGET", name: "R" } }, "t")).toThrow(
      expect.objectContaining({
        code: "BAD_SIDECAR",
        message: expect.stringMatching(/node\.type 'WIDGET' must be one of/),
      }),
    );
  });

  it("accepts every FigmaExportNode type the build path can construct", () => {
    for (const type of ["FRAME", "TEXT", "RECTANGLE", "IMAGE", "GROUP", "INSTANCE"]) {
      expect(validateFigmaNodeSidecar({ ...ok, node: { type, name: "R" } }, "t").node.type).toBe(type);
    }
  });
});
