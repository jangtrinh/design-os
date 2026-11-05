/**
 * design:os host files beside an adopted kit. `ui init` adapter trees and `ui agents init` agents
 * are re-rendered by the CLI and configure the agent host, so an undeclared one must not read as
 * tampering — while declared kit content, foreign undeclared files and look-alikes without the
 * generator's mark still fail `ds kit verify`. Same candidate as tests/cmd-ds-reseal-kit.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { prepareKit } from "../src/core/ds-kit-validate.js";
import { emitKitTheme } from "../src/core/ds-kit-theme.js";
import { hashKitBytes } from "../src/core/ds-kit-files.js";
import { isGeneratedHostFile } from "../src/core/ds-kit-host-files.js";
import { generateAdapter } from "../src/adapters/index.js";
import { RUNTIMES, resolvePackageRoots } from "../src/core/init-stub.js";

const roots: string[] = [];
const temp = (): string => { const root = fs.mkdtempSync(join(tmpdir(), "ease-kit-host-")); roots.push(root); return root; };
const savedHome = process.env["EASE_DESIGN_HOME"];
beforeEach(() => { process.env["EASE_DESIGN_HOME"] = temp(); });
afterEach(() => {
  vi.restoreAllMocks();
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"]; else process.env["EASE_DESIGN_HOME"] = savedHome;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
interface Result { code: number; ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } }
function cli(args: string[]): Result {
  let out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { out += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const code = run([...args, "--json"]);
  vi.restoreAllMocks();
  return { code, ...(JSON.parse(out) as Omit<Result, "code">) };
}
const put = (root: string, path: string, value: unknown): void => {
  fs.mkdirSync(join(root, path, ".."), { recursive: true });
  fs.writeFileSync(join(root, path), typeof value === "string" ? value : canonicalStringify(value));
};
const read = (root: string, path: string): Buffer => fs.readFileSync(join(root, path));
const filesUnder = (root: string): string[] =>
  (fs.readdirSync(root, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)).split("\\").join("/")).sort();

/** Host evidence here exercises byte binding, not a claim of reviewed production UI. */
function candidate(): string {
  const root = temp();
  const tokens = { color: { canvas: { $type: "color", $value: "#ffffff" }, ink: { $type: "color", $value: "#111111" } } };
  const components = Array.from({ length: 41 }, (_, i) => ({ name: `Owner Item ${i}`, category: "display", markup: `<div>Owner Item ${i}</div>`, tokensUsed: ["color.ink"], variants: ["Size=Small"], states: ["default"] }));
  put(root, "source/registry.json", { version: "0.1.0", components }); put(root, "source/tokens.json", tokens);
  put(root, "src/theme.css", emitKitTheme(tokens, { background: "color.canvas", foreground: "color.ink" }));
  put(root, "package.json", { name: "owner-test-kit", private: true, type: "module" });
  put(root, "package-lock.json", { name: "owner-test-kit", lockfileVersion: 3, packages: {} });
  put(root, "src/components.tsx", components.map((c, i) => `export function OwnerItem${i}() { return <div>${c.name}</div>; }`).join("\n"));
  const cases = [{ id: "build", kind: "build", subject: "kit", description: "Test-host build evidence and import closure" }, { id: "kit-review", kind: "review", subject: "kit", description: "Source scope, tuple/state facts and owner fidelity reviewed by test host" }];
  const mappings = components.map((component, index) => {
    put(root, `src/item-${index}.html`, component.markup);
    const ids = ["render", "review", "behavior"].map((kind) => `${kind}-${index}`);
    for (const kind of ["render", "review", "behavior"]) cases.push({ id: `${kind}-${index}`, kind, subject: `owner:${index}`, description: `${kind}: Size=Small default for ${component.name}; source tuple/state facts` });
    return { sourceId: `owner:${index}`, name: component.name, disposition: "component", implementation: { path: "src/components.tsx", export: `OwnerItem${index}`, strategy: "custom", primitives: [] }, markup: `src/item-${index}.html`, variants: ["Size=Small"], states: ["default"], cases: ids };
  });
  const artifacts = ["source/registry.json", "source/tokens.json", "src/theme.css", "src/components.tsx", "package.json", "package-lock.json", ...components.map((_, index) => `src/item-${index}.html`)];
  put(root, "kit.json", { version: 1, name: "Owner Host Kit", intent: "Faithful owner test kit", target: "react-shadcn-tailwind", minimumComponents: 25,
    sources: [{ id: "owner", kind: "registry", path: "source/registry.json", hash: hashKitBytes(read(root, "source/registry.json")), scope: "complete", limitations: [] }],
    tokens: "source/tokens.json", theme: "src/theme.css", aliases: { background: "color.canvas", foreground: "color.ink" }, mappings, artifacts, cases, evidence: "evidence/receipt.json" });
  const prepared = prepareKit(root);
  expect(prepared.complete, JSON.stringify(prepared.findings)).toBe(true);
  const receiptCases = cases.map((testCase) => {
    put(root, `evidence/${testCase.id}.txt`, `Test-host byte-binding evidence: ${testCase.description}\n`);
    return { id: testCase.id, outcome: "passed", files: [`evidence/${testCase.id}.txt`], note: testCase.description };
  });
  put(root, "evidence/receipt.json", { version: 1, contentHash: prepared.contentHash, cases: receiptCases });
  return root;
}
function adopted(): string {
  const root = join(temp(), "adopted");
  const result = cli(["ds", "kit", "adopt", candidate(), "--out", root, "--now", "2026-11-05T00:00:00.000Z"]);
  expect(result.code, JSON.stringify(result)).toBe(0);
  return root;
}
const verify = (root: string): Result => cli(["ds", "kit", "verify", "--dir", root]);
/** Every host file design:os can write: all three runtime adapter trees plus the agent roster. */
function withHostFiles(root: string): void {
  const init = cli(["init", "--all", "--cwd", root]);
  expect(init.code, JSON.stringify(init.error)).toBe(0);
  const agents = cli(["agents", "init", "--dir", root]);
  expect(agents.code, JSON.stringify(agents.error)).toBe(0);
}

describe("design:os host files coexist with an adopted kit", () => {
  it("ui init --all + ui agents init leave the kit verified", () => {
    const root = adopted();
    withHostFiles(root);
    expect(fs.existsSync(join(root, ".claude", "agents"))).toBe(true);
    expect(fs.existsSync(join(root, "AGENTS.md"))).toBe(true);
    const r = verify(root);
    expect(r.code, JSON.stringify(r.error)).toBe(0);
    expect(r.data).toMatchObject({ kitStatus: "verified", ready: true });
  });

  it("an edited declared component file still fails verify beside the host files", () => {
    const root = adopted();
    withHostFiles(root);
    fs.appendFileSync(join(root, "src/components.tsx"), "\nexport const Sneaked = 1;\n");
    const r = verify(root);
    expect(r.code).not.toBe(0);
    expect(r.error?.code).toBe("DS_TAMPERED");
    expect(r.error?.message).toContain("src/components.tsx");
  });

  // Each look-alike sits in a design:os folder (or is a file name ui writes) but is not ours.
  const foreign: [string, string, string][] = [
    ["a host setting design:os never writes", ".claude/settings.json", "{}"],
    ["a hand-written agent without the design-os stamp", ".claude/agents/hand-written.md", "---\nname: hand-written\n---\nMine.\n"],
    ["an AGENTS.md without the ease-design sentinel block", "AGENTS.md", "# Agents\nHand-written only.\n"],
    ["a skill outside the design-os- namespace", ".claude/skills/other/SKILL.md", "# other\n"],
    ["an undeclared source file", "src/extra.tsx", "export const Extra = 1;\n"],
  ];
  it.each(foreign)("%s is still an undeclared file", (_label, path, body) => {
    const root = adopted();
    put(root, path, body);
    const r = verify(root);
    expect(r.code).not.toBe(0);
    expect(r.error?.code).toBe("DS_TAMPERED");
    expect(r.error?.message).toBe(`kit integrity: Undeclared file: ${path}`);
  });
});

describe("the ontology glossary in an adopted kit", () => {
  const GLOSSARY = "terms:\n  - term: Ledger\n    def: The audited record of every booking.\n    avoid: [log]\n";

  it("a root ontology/glossary.yaml is refused with the path to use instead", () => {
    const root = adopted();
    put(root, "ontology/glossary.yaml", GLOSSARY);
    const r = verify(root);
    expect(r.error?.code).toBe("DS_TAMPERED");
    expect(r.error?.message).toContain("Undeclared file: ontology/glossary.yaml");
    expect(r.error?.message).toContain("design/knowledge/glossary.yaml");
  });

  it("design/knowledge/glossary.yaml keeps the kit verified and feeds guidelines build", () => {
    const root = adopted();
    put(root, "design/knowledge/glossary.yaml", GLOSSARY);
    expect(verify(root).code).toBe(0);
    const built = cli(["ds", "guidelines", "build", "--dir", root, "--now", "2026-11-05T00:00:00.000Z"]);
    expect(built.code, JSON.stringify(built.error)).toBe(0);
    const terminology = fs.readFileSync(join(root, "design", "guidelines", "terminology.md"), "utf8");
    expect(terminology).toContain("`term:Ledger` — The audited record of every booking.");
    expect(verify(root).code).toBe(0);
  });
});

describe("the integrity exemption and the generators share one definition", () => {
  const { templatesRoot } = resolvePackageRoots(dirname(fileURLToPath(import.meta.url)));

  it("every adapter file ui init generates, for every runtime, counts as a generated host file", () => {
    const cwd = temp();
    for (const runtime of RUNTIMES) {
      for (const artifact of generateAdapter({ runtime, cwd, templatesRoot: templatesRoot! })) {
        const path = relative(cwd, artifact.absPath).split("\\").join("/");
        expect(isGeneratedHostFile(path, () => Buffer.from(artifact.content)), `${runtime}: ${path}`).toBe(true);
      }
    }
  });

  it("ui init --json lists exactly the files it wrote, wrapper scripts and manifests included", () => {
    const cwd = temp();
    const r = cli(["init", "--all", "--cwd", cwd]);
    expect(r.code, JSON.stringify(r.error)).toBe(0);
    const reported = (r.data!["files"] as string[]).map((p) => relative(cwd, p).split("\\").join("/")).sort();
    expect(reported).toEqual(filesUnder(cwd));
    expect(reported).toEqual(expect.arrayContaining([".claude/design-os-model.sh", ".claude/rules/design-os-routing.md", ".claude/ease-design.json"]));
  });

  it("every agent ui agents init writes counts as a generated host file", () => {
    const root = adopted();
    const r = cli(["agents", "init", "--dir", root]);
    expect(r.code, JSON.stringify(r.error)).toBe(0);
    const agents = r.data!["agents"] as { path: string }[];
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      const path = relative(root, agent.path).split("\\").join("/");
      expect(isGeneratedHostFile(path, () => fs.readFileSync(agent.path)), path).toBe(true);
    }
  });
});
