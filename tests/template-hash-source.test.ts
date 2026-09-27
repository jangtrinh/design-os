/**
 * Characterisation for PR-W3c: the runtime prose read at src/adapters/templates.ts
 * (hashTemplateFile) is migrated to the catalogue's recorded sourceSha256 for the
 * two callers that only need a trustworthy value to RECORD (init.ts, codex.ts) —
 * not for `ui doctor`'s template-drift check, which must keep re-hashing live
 * bytes (see evidence/w3a/proposals.md §2). These tests pin the public behaviour
 * that must survive that migration unchanged: init records a real per-template
 * hash, the codex adapter embeds a real per-template hash, and both still equal
 * an independently-computed sha256 of the on-disk template bytes.
 */
import { describe, expect, it, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { run } from "../src/cli.js";
import { generateCodexAdapter } from "../src/adapters/codex.js";
import {
  resolveTemplatePath,
  hashTemplateFile,
  readTemplateSourceHash,
} from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");

function realHash(kind: "workflow" | "skill" | "journey", name: string): string {
  const p = resolveTemplatePath(TEMPLATES_ROOT, kind, name)!;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function captureRun(args: string[]): { code: number; out: string } {
  let out = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = origOut; process.stderr.write = origErr; }
  return { code, out };
}

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const p = mkdtempSync(join(tmpdir(), "ease-w3c-hash-"));
  tmpDirs.push(p);
  return p;
}
afterEach(() => {
  for (const d of tmpDirs) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe("readTemplateSourceHash", () => {
  it("returns the same value as hashing the real file bytes", () => {
    const p = resolveTemplatePath(TEMPLATES_ROOT, "workflow", "generate")!;
    expect(readTemplateSourceHash(p)).toBe(hashTemplateFile(p));
    expect(readTemplateSourceHash(p)).toBe(realHash("workflow", "generate"));
  });

  it("agrees with hashTemplateFile for a skill and a journey template", () => {
    const skillPath = resolveTemplatePath(TEMPLATES_ROOT, "skill", "pick-persona")!;
    const journeyPath = resolveTemplatePath(TEMPLATES_ROOT, "journey", "onboard")!;
    expect(readTemplateSourceHash(skillPath)).toBe(hashTemplateFile(skillPath));
    expect(readTemplateSourceHash(journeyPath)).toBe(hashTemplateFile(journeyPath));
  });

  it("throws for a path outside templates/{workflows,skills,journeys}/*.md", () => {
    expect(() => readTemplateSourceHash(join(REPO_ROOT, "package.json"))).toThrow(
      /not a registered template location/,
    );
  });
});

describe("ui init records the catalogue-sourced hash (PR-W3c characterisation)", () => {
  it("templateHashes['workflows/generate.md'] equals the real file's sha256", () => {
    const cwd = makeTmpDir();
    const r = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as { templateHashes: Record<string, string> };
    expect(manifest.templateHashes["workflows/generate.md"]).toBe(realHash("workflow", "generate"));
    expect(manifest.templateHashes["journeys/onboard.md"]).toBe(realHash("journey", "onboard"));
  });
});

describe("generateCodexAdapter embeds the catalogue-sourced hash (PR-W3c characterisation)", () => {
  it("the embedded generate.md hash equals the real file's sha256", () => {
    const cwd = makeTmpDir();
    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.content).toContain(`workflows/generate.md: ${realHash("workflow", "generate")}`);
    expect(art.content).toContain(`skills/pick-persona.md: ${realHash("skill", "pick-persona")}`);
  });
});
