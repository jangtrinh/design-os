import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const CORE = join(process.cwd(), "src", "core");
const MODULES = [
  "figma-reconcile.ts",
  "figma-reconcile-types.ts",
  "figma-change-log-parser.ts",
  "figma-change-coalescer.ts",
  "figma-preview-delta.ts",
] as const;
const FACADE_EXPORTS = [
  "./figma-reconcile-types.js",
  "./figma-change-log-parser.js",
  "./figma-change-coalescer.js",
  "./figma-preview-delta.js",
] as const;

describe("Figma reconcile module boundaries", () => {
  it.each(MODULES)("keeps %s at or below the project 200-line limit", (file) => {
    const lines = readFileSync(join(CORE, file), "utf8").trimEnd().split("\n");
    expect(lines.length).toBeLessThanOrEqual(200);
  });

  it("keeps the legacy import surface as a re-export-only facade", () => {
    const facade = readFileSync(join(CORE, "figma-reconcile.ts"), "utf8");
    const source = ts.createSourceFile("figma-reconcile.ts", facade, ts.ScriptTarget.Latest, true);
    const exports = source.statements.map((statement) => {
      expect(ts.isExportDeclaration(statement)).toBe(true);
      if (!ts.isExportDeclaration(statement)) return null;
      expect(statement.exportClause).toBeUndefined();
      expect(statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)).toBe(true);
      return statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;
    });
    expect(exports).toEqual(FACADE_EXPORTS);
  });
});
