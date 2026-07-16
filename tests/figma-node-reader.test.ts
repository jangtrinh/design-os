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
