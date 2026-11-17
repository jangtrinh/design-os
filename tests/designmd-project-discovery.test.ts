import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "../src/core/cli-args.js";
import { resolveCssColorToHex } from "../src/core/designmd-color-parse.js";
import { discoverProjectTokenSources } from "../src/core/designmd-project-discovery.js";
import { runExtractTokens } from "../src/commands/designmd-extract-tokens-impl.js";
import { ingestCssDsCommand } from "../src/commands/ingest-css-ds.js";

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

describe("resolveCssColorToHex", () => {
  it("resolves hex, rgb, hsl, shadcn bare HSL triplet, and oklch to lowercase #rrggbb", () => {
    expect(resolveCssColorToHex("#abc")).toBe("#aabbcc");
    expect(resolveCssColorToHex("#112233ff")).toBe("#112233");
    expect(resolveCssColorToHex("rgb(15, 23, 42)")).toBe("#0f172a");
    expect(resolveCssColorToHex("rgb(15 23 42 / 0.8)")).toBe("#0f172a");
    expect(resolveCssColorToHex("hsl(222, 47%, 11%)")).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveCssColorToHex("222.2 47.4% 11.2%")).toBe("#0f172a");
    expect(resolveCssColorToHex("oklch(0.62 0.19 259)")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns undefined for non-color values, out-of-range HSL, and dimension-named properties", () => {
    expect(resolveCssColorToHex("var(--foo)")).toBeUndefined();
    expect(resolveCssColorToHex("16px")).toBeUndefined();
    expect(resolveCssColorToHex("420 50% 50%")).toBeUndefined();
    expect(resolveCssColorToHex("16 24% 50%", "--size-16-24")).toBeUndefined();
  });
});

describe("discoverProjectTokenSources", () => {
  it("discovers Next.js + shadcn theme.css via components.json", () => {
    const dir = makeTmpDir("proj-next-");
    mkdirSync(join(dir, "src", "styles"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "^15.0.0", react: "^19.0.0" } }));
    writeFileSync(join(dir, "components.json"), JSON.stringify({ tailwind: { css: "src/styles/theme.css" } }));
    writeFileSync(join(dir, "src", "styles", "theme.css"), ":root {\n  --primary: 222.2 47.4% 11.2%;\n}\n");

    const res = discoverProjectTokenSources(dir);
    expect(res.framework).toBe("next");
    expect(res.discoveredFiles).toContain("src/styles/theme.css");
  });

  it("discovers Angular styles from angular.json, Nuxt css + app.vue, and SvelteKit +layout.svelte", () => {
    const ngDir = makeTmpDir("proj-angular-");
    mkdirSync(join(ngDir, "src"), { recursive: true });
    writeFileSync(join(ngDir, "angular.json"), JSON.stringify({ projects: { web: { architect: { build: { options: { styles: ["src/styles.scss"] } } } } } }));
    writeFileSync(join(ngDir, "src", "styles.scss"), ":root { --brand: #2563eb; }\n");
    expect(discoverProjectTokenSources(ngDir)).toMatchObject({ framework: "angular", discoveredFiles: ["src/styles.scss"] });

    const nuxtDir = makeTmpDir("proj-nuxt-");
    mkdirSync(join(nuxtDir, "assets", "css"), { recursive: true });
    writeFileSync(join(nuxtDir, "nuxt.config.ts"), "export default defineNuxtConfig({ css: ['~/assets/css/main.css'] })\n");
    writeFileSync(join(nuxtDir, "assets", "css", "main.css"), ":root { --surface: #f8fafc; }\n");
    writeFileSync(join(nuxtDir, "app.vue"), "<template><div /></template>\n<style>:root { --brand: #2563eb; }</style>\n");
    const nuxtRes = discoverProjectTokenSources(nuxtDir);
    expect(nuxtRes.framework).toBe("nuxt");
    expect(nuxtRes.discoveredFiles).toEqual(["assets/css/main.css", "app.vue"]);
    expect(nuxtRes.sources.find(s => s.name === "app.vue")?.body).not.toContain("<template>");

    const svDir = makeTmpDir("proj-svelte-");
    mkdirSync(join(svDir, "src", "routes"), { recursive: true });
    writeFileSync(join(svDir, "package.json"), JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.0.0" } }));
    writeFileSync(join(svDir, "src", "app.css"), ":root { --ink: #0f172a; }\n");
    writeFileSync(join(svDir, "src", "routes", "+layout.svelte"), "<slot />\n<style>:root { --accent: #f97316; }</style>\n");
    expect(discoverProjectTokenSources(svDir).discoveredFiles).toEqual(["src/app.css", "src/routes/+layout.svelte"]);
  });

  it("follows local <link rel=\"stylesheet\"> from index.html on real showcase/world-class-benchmark and blocks symlinks escaping project root", () => {
    const realRes = discoverProjectTokenSources(resolve("showcase/world-class-benchmark"));
    expect(realRes.discoveredFiles).toContain("index.html");
    expect(realRes.discoveredFiles).toContain("styles/base.css");

    const outer = makeTmpDir("proj-sym-outer-");
    const inner = join(outer, "proj");
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(outer, "secret.css"), ":root { --secret: #123456; }\n");
    symlinkSync(join(outer, "secret.css"), join(inner, "index.css"));
    expect(discoverProjectTokenSources(inner).discoveredFiles).toEqual([]);
  });
});

describe("extract-tokens --project -> ingest-css-ds pipeline", () => {
  it("ingests bare-HSL-only shadcn custom properties into DTCG color tokens (#rrggbb)", async () => {
    const dir = makeTmpDir("proj-pipeline-");
    const outDir = makeTmpDir("ingest-out-");
    mkdirSync(join(dir, "src", "styles"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "^15.0.0" } }));
    writeFileSync(join(dir, "components.json"), JSON.stringify({ tailwind: { css: "src/styles/theme.css" } }));
    writeFileSync(
      join(dir, "src", "styles", "theme.css"),
      ":root {\n  --primary: 222.2 47.4% 11.2%;\n  --size-16-24: 16 24% 50%;\n}\n.dark {\n  --primary: 210 40% 98%;\n}\n",
    );

    const extractedPath = join(dir, "extracted-tokens.json");
    const extractRes = runExtractTokens(
      parseArgs(["designmd", "extract-tokens", "--project", dir, "--out", extractedPath]),
    );
    expect(extractRes.exitCode).toBe(0);

    const payload = JSON.parse(readFileSync(extractedPath, "utf8")) as {
      customProperties: { name: string; hex?: string }[];
    };
    expect(payload.customProperties.find(p => p.name === "--primary")?.hex).toBe("#0f172a");
    expect(payload.customProperties.find(p => p.name === "--size-16-24")?.hex).toBeUndefined();

    const ingestParsed = parseArgs(["ingest-css-ds", "--out", outDir, "--json"]);
    ingestParsed.positionals.push(extractedPath);
    const ingestRes = await ingestCssDsCommand.run(ingestParsed);
    expect(ingestRes.exitCode).toBe(0);

    const dtcg = JSON.parse(readFileSync(join(outDir, "tokens.json"), "utf8")) as {
      color?: { primary?: { $value: string; $type: string; $extensions?: Record<string, { $value: string }> } };
    };
    expect(dtcg.color?.primary?.$type).toBe("color");
    expect(dtcg.color?.primary?.$value).toBe("#0f172a");
    expect(dtcg.color?.primary?.$extensions?.["mode.dark"]?.$value).toBe("#f8fafc");
  });
});
