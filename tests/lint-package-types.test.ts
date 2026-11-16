import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("ease-design/lint package types contract", () => {
  const root = process.cwd();
  const dtsPath = join(root, "dist", "types", "lint.d.ts");
  const dtsMapPath = join(root, "dist", "types", "lint.d.ts.map");
  const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");

  beforeAll(() => {
    if (!existsSync(dtsPath) || !existsSync(dtsMapPath)) {
      execFileSync(process.execPath, [tscBin, "-p", join(root, "tsconfig.dts.json")], { cwd: root });
    }
  });

  it("dist/types/lint.d.ts exists, carries sourceMappingURL, and re-exports all 6 linter modules", () => {
    expect(existsSync(dtsPath), "dist/types/lint.d.ts must exist").toBe(true);
    const content = readFileSync(dtsPath, "utf8");
    expect(content).toContain('export * from "./core/layout-lint.js";');
    expect(content).toContain('export * from "./core/a11y-lint.js";');
    expect(content).toContain('export * from "./core/taste-lint.js";');
    expect(content).toContain('export * from "./core/content-checks.js";');
    expect(content).toContain('export * from "./core/gate.js";');
    expect(content).toContain('export * from "./core/ds-usage-lint.js";');
    expect(content).toContain("//# sourceMappingURL=lint.d.ts.map");
  });

  it("dist/types/lint.d.ts.map exists and maps back to src/lint.ts", () => {
    expect(existsSync(dtsMapPath), "dist/types/lint.d.ts.map must exist").toBe(true);
    const parsed = JSON.parse(readFileSync(dtsMapPath, "utf8")) as { sources?: string[] };
    expect(Array.isArray(parsed.sources), "sourcemap sources must be an array").toBe(true);
    expect(parsed.sources).toContain("../../src/lint.ts");
  });

  it("no emitted .d.ts under dist/types leaks internal runtime dependencies", () => {
    const collectDts = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? collectDts(p) : n.endsWith(".d.ts") ? [p] : [];
      });

    const files = collectDts(join(root, "dist", "types"));
    expect(files.length).toBeGreaterThan(0);
    const leaked = /(?:from\s+|import\(\s*)["'](?:htmlparser2|css-tree(?:\/[^"']*)?|domutils|css-select)["']/;
    for (const f of files) {
      const code = readFileSync(f, "utf8");
      expect(leaked.test(code), `${f} must not import bundled runtime dependencies`).toBe(false);
    }
  });

  it("NodeNext consumer resolves ease-design/lint via package.json exports and rejects wrong argument types", () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "ease-design-lint-types-"));
    try {
      mkdirSync(join(scratchDir, "node_modules"), { recursive: true });
      symlinkSync(root, join(scratchDir, "node_modules", "ease-design"), "dir");
      writeFileSync(join(scratchDir, "package.json"), JSON.stringify({ name: "consumer-probe", private: true, type: "module" }, null, 2));
      writeFileSync(
        join(scratchDir, "tsconfig.json"),
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2023",
              module: "NodeNext",
              moduleResolution: "NodeNext",
              strict: true,
              noEmit: true,
              skipLibCheck: false,
            },
            include: ["consumer.ts"],
          },
          null,
          2,
        ),
      );

      // Positive probe: exercises real package.json `exports["./lint"].types` across all 6 linter surfaces
      const validConsumer = [
        'import { lintLayout, lintA11y, lintTaste, checkLoremIpsum, runGate, lintDsUsage } from "ease-design/lint";',
        'const html = "<html><body><h1>Hello</h1></body></html>";',
        "const r1: number = lintLayout(html).errorCount;",
        "const r2: number = lintA11y(html).errorCount;",
        "const r3: number = lintTaste(html).errorCount;",
        "const r4: number = checkLoremIpsum(html).length;",
        "const r5: boolean = runGate(html).pass;",
        'const r6: number = lintDsUsage(html, { declaredVars: new Set(["--fg"]) }).errorCount;',
        "void [r1, r2, r3, r4, r5, r6];",
        "",
      ].join("\n");
      writeFileSync(join(scratchDir, "consumer.ts"), validConsumer);
      execFileSync(process.execPath, [tscBin, "-p", join(scratchDir, "tsconfig.json")], {
        cwd: scratchDir,
        encoding: "utf8",
      });

      // Red probe: passing a number to `lintLayout` must fail specifically with TS2345 (proving non-`any` parameter types)
      const invalidConsumer = [
        'import { lintLayout } from "ease-design/lint";',
        "lintLayout(12345);",
        "",
      ].join("\n");
      writeFileSync(join(scratchDir, "consumer.ts"), invalidConsumer);
      let threw = false;
      try {
        execFileSync(process.execPath, [tscBin, "-p", join(scratchDir, "tsconfig.json")], {
          cwd: scratchDir,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e: unknown) {
        threw = true;
        const err = e as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).not.toBe(0);
        expect(`${err.stdout ?? ""}\n${err.stderr ?? ""}`).toContain("error TS2345");
      }
      expect(threw, "Red probe must fail typechecking when passing number instead of string").toBe(true);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});
