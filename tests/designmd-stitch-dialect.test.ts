import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "../src/core/cli-args.js";
import { parseDesignMd } from "../src/core/designmd-parser.js";
import { detectDesignMdDialect } from "../src/core/designmd-dialect.js";
import { auditFormat } from "../src/core/designmd-audit-format.js";
import { auditAccessibility } from "../src/core/designmd-audit-accessibility.js";
import { runAudit } from "../src/commands/designmd-audit-impl.js";
import { scanProject } from "../src/core/project-scan.js";

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const ALPHA_DOC = `---
name: "AlphaSample"
version: "alpha"
colors:
  brand:
    primary: "#0f172a"
typography:
  body:
    md:
      fontFamily: "Inter, sans-serif"
      fontSize: "16px"
---

## Overview
## Colors
## Typography
## Layout
## Elevation & Depth
## Shapes
## Components
## Do's and Don'ts
`;

const STITCH_V1_NUMBERED = `---
name: "StitchV1"
version: "1.0"
colors:
  primary: "#0f172a"
  on-primary: "#ffffff"
  inverse-surface: "#0f172a"
  inverse-on-surface: "#ffffff"
typography:
  headline-large:
    fontFamily: "Inter, sans-serif"
    fontSize: "32px"
---

## 1. Visual Theme & Atmosphere
## 2. Color Palette & Roles
## 3. Typography Rules
## 4. Component Stylings
## 5. Layout Principles
## 6. Design System Notes for Stitch Generation
`;

const STITCH_V1_UNNUMBERED = `---
name: "StitchUnnumbered"
colors:
  primary: "#0f172a"
  on-primary: "#ffffff"
---

## Visual Theme & Atmosphere
## Color Palette & Roles
## Typography Rules
## Component Stylings
## Layout Principles
## Design System Notes for Stitch Generation
`;

const STITCH_CLASSIC_7 = `---
name: "StitchClassic"
colors:
  primary: "#0f172a"
  on-primary: "#ffffff"
typography:
  headline-large:
    fontFamily: "Inter, sans-serif"
    fontSize: "32px"
---

## Brand & Style
## Colors
## Typography
## Layout & Spacing
## Elevation & Depth
## Shapes
## Components
`;

describe("detectDesignMdDialect", () => {
  it("detects explicit version 'alpha' vs '1.0'", () => {
    expect(detectDesignMdDialect(parseDesignMd(ALPHA_DOC))).toBe("alpha");
    expect(detectDesignMdDialect(parseDesignMd(STITCH_V1_NUMBERED))).toBe("stitch");
  });

  it("detects stitch from .stitch/DESIGN.md path", () => {
    const doc = parseDesignMd("---\nname: \"Neutral\"\n---\n\n## Overview\n");
    expect(detectDesignMdDialect(doc, "/tmp/proj/.stitch/DESIGN.md")).toBe("stitch");
    expect(detectDesignMdDialect(doc, ".stitch/DESIGN.md")).toBe("stitch");
  });

  it("detects numbered and unnumbered 6-section Stitch v1.0 headings", () => {
    const numberedNoVer = STITCH_V1_NUMBERED.replace('version: "1.0"\n', "");
    expect(detectDesignMdDialect(parseDesignMd(numberedNoVer))).toBe("stitch");
    expect(detectDesignMdDialect(parseDesignMd(STITCH_V1_UNNUMBERED))).toBe("stitch");
  });

  it("detects 7-section Google Labs classic examples/DESIGN.md layout with flat tokens", () => {
    expect(detectDesignMdDialect(parseDesignMd(STITCH_CLASSIC_7))).toBe("stitch");
  });
});

describe("auditFormat for Stitch dialect", () => {
  it("passes stitch-sections-present on 6-section Stitch v1.0 and 7-section classic docs", () => {
    for (const raw of [STITCH_V1_NUMBERED, STITCH_V1_UNNUMBERED, STITCH_CLASSIC_7]) {
      const rows = auditFormat(parseDesignMd(raw));
      const row = rows.find(r => r.rule === "stitch-sections-present");
      expect(row?.status).toBe("PASS");
    }
  });

  it("fails stitch-sections-present when a required Stitch section is missing", () => {
    const missing = STITCH_V1_NUMBERED.replace("## 6. Design System Notes for Stitch Generation\n", "");
    const rows = auditFormat(parseDesignMd(missing), { dialect: "stitch" });
    const row = rows.find(r => r.rule === "stitch-sections-present");
    expect(row?.status).toBe("FAIL");
  });
});

describe("auditAccessibility for flat M3 role pairs", () => {
  it("passes WCAG contrast for #0f172a on #ffffff (and inverse-surface pairs) when components: is omitted", () => {
    const rows = auditAccessibility(parseDesignMd(STITCH_V1_NUMBERED));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rule).toBe("wcag-body-contrast");
    expect(rows[0]!.status).toBe("PASS");
  });

  it("fails WCAG contrast when flat M3 pair is #94a3b8 vs #cbd5e1 (< 3.0:1)", () => {
    const lowContrast = `---\nname: "LowContrast"\nversion: "1.0"\ncolors:\n  primary: "#cbd5e1"\n  on-primary: "#94a3b8"\n---\n\n## 1. Visual Theme & Atmosphere\n`;
    const rows = auditAccessibility(parseDesignMd(lowContrast));
    const failRow = rows.find(r => r.rule === "wcag-body-contrast");
    expect(failRow?.status).toBe("FAIL");
    expect(failRow?.detail).toContain("on-primary on primary");
  });
});

describe("runAudit CLI and scanProject for .stitch/DESIGN.md", () => {
  it("resolves .stitch/DESIGN.md and .stitch/tokens.json, emits dialect: stitch, and honours --dialect", () => {
    const dir = makeTmpDir("stitch-audit-");
    mkdirSync(join(dir, ".stitch"), { recursive: true });
    writeFileSync(join(dir, ".stitch", "DESIGN.md"), STITCH_V1_NUMBERED, "utf8");
    const tokens = {
      colors: [{ hex: "#0f172a", count: 5, sources: ["app.css:L1"] }, { hex: "#ffffff", count: 4, sources: ["app.css:L2"] }],
      fonts: [{ family: "Inter" }],
      customProperties: [],
    };
    writeFileSync(join(dir, ".stitch", "tokens.json"), JSON.stringify(tokens), "utf8");

    const autoRes = runAudit(parseArgs(["designmd", "audit", dir, "--json"]));
    expect(autoRes.exitCode).toBe(0);
    const autoEnv = JSON.parse(autoRes.stdout ?? "{}") as { ok: boolean; data: { dialect: string; verdict: string } };
    expect(autoEnv.ok).toBe(true);
    expect(autoEnv.data.dialect).toBe("stitch");
    expect(autoEnv.data.verdict).toBe("PASS");

    const explicitStitch = runAudit(parseArgs(["designmd", "audit", dir, "--dialect", "stitch", "--json"]));
    expect(explicitStitch.exitCode).toBe(0);
    expect((JSON.parse(explicitStitch.stdout ?? "{}") as { data: { dialect: string } }).data.dialect).toBe("stitch");

    const forcedAlpha = runAudit(parseArgs(["designmd", "audit", dir, "--dialect", "alpha", "--json"]));
    expect(forcedAlpha.exitCode).toBe(1);
    const alphaEnv = JSON.parse(forcedAlpha.stdout ?? "{}") as { data: { dialect: string; rows: { rule: string; status: string }[] } };
    expect(alphaEnv.data.dialect).toBe("alpha");
    expect(alphaEnv.data.rows.find(r => r.rule === "all-8-sections-present")?.status).toBe("FAIL");

    const invalidRes = runAudit(parseArgs(["designmd", "audit", dir, "--dialect", "invalid", "--json"]));
    expect(invalidRes.exitCode).toBe(1);
    expect((JSON.parse(invalidRes.stdout ?? "{}") as { error: { code: string } }).error.code).toBe("BAD_ARG");
    expect(readFileSync(join(dir, "audit.json"), "utf8")).toContain('"verdict"');
  });

  it("scanProject detects ./.stitch/DESIGN.md when root DESIGN.md is absent", () => {
    const dir = makeTmpDir("stitch-scan-");
    mkdirSync(join(dir, ".stitch"), { recursive: true });
    writeFileSync(join(dir, ".stitch", "DESIGN.md"), STITCH_V1_NUMBERED, "utf8");
    const scan = scanProject(dir);
    expect(scan.designMd).toBe("./.stitch/DESIGN.md");
  });
});
