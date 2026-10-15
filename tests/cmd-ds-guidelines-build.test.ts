import { afterEach, describe, expect, it } from "vitest";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { canonicalHash, canonicalStringify } from "../src/core/ds-manifest.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "ds-guidelines", "basic");
const NOW = "2026-10-15T00:00:00Z";
const PACK_FILES = ["components.md", "grammar.md", "guidelines.manifest.json", "overview.md", "vocabulary.md"];

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A private copy of the fixture project — tests never write into the checked-in fixture. */
function projectCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-"));
  scratch.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Rewrite the DS store AND reseal the manifest, so variants stay valid (not tampered). */
function resealStore(dir: string, mutate: (tokens: Record<string, unknown>, registry: { components: unknown[] }) => void): void {
  const d = join(dir, "design");
  const tokens = JSON.parse(readFileSync(join(d, "design.tokens.json"), "utf8")) as Record<string, unknown>;
  const registry = JSON.parse(readFileSync(join(d, "component-registry.json"), "utf8")) as { components: unknown[] };
  mutate(tokens, registry);
  const manifest = JSON.parse(readFileSync(join(d, "ds.manifest.json"), "utf8")) as Record<string, unknown>;
  manifest["compiledHash"] = canonicalHash(tokens);
  manifest["registryHash"] = canonicalHash(registry);
  writeFileSync(join(d, "design.tokens.json"), canonicalStringify(tokens));
  writeFileSync(join(d, "component-registry.json"), canonicalStringify(registry));
  writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/"))
    .sort();
}

interface ManifestRule { id: string; file: string; sources: { path: string; token?: string; component?: string }[] }
interface PackManifest {
  generatedAt: string;
  files: { path: string; bytes: number; sha: string }[];
  ruleCount: number;
  rules: ManifestRule[];
  sources: { path: string; sha: string }[];
  skippedSources: { path: string; reason: string }[];
}
const readManifest = (out: string): PackManifest =>
  JSON.parse(readFileSync(join(out, "guidelines.manifest.json"), "utf8")) as PackManifest;

describe("ui ds guidelines build", () => {
  it("G-BUILD-1: writes overview, vocabulary, components and the manifest", () => {
    const dir = projectCopy();
    const out = join(dir, "design", "guidelines");
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
    expect(r.code).toBe(0);
    expect(listFiles(out)).toEqual(PACK_FILES);

    const vocab = readFileSync(join(out, "vocabulary.md"), "utf8");
    // Baked role -> the project's OWN token name, as an explicit span (T4).
    expect(vocab).toMatch(/^- background → `token:color\.surface-base`/m);
    expect(vocab).toMatch(/^- destructive → `token:color\.danger`/m);
    expect(vocab).toMatch(/^- `token:spacing\.4` → 16px$/m);
    expect(vocab).toMatch(/^- `token:font\.family-body` → Inter, sans-serif$/m);
    expect(vocab).toMatch(/^- `token:color\.accent-soft-text` on `token:color\.accent-soft` — 1\.8:1/m);

    const comps = readFileSync(join(out, "components.md"), "utf8");
    expect(comps).toMatch(/^## button$/m);
    expect(comps).toMatch(/^- `component:Button\/Primary` — variants: solid · states: default, disabled, hover/m);
    // Confusable names: same leaf under different parents, and near-identical names.
    expect(comps).toMatch(/^> QUESTION\(confusable\.[a-z0-9.-]+\): .*`component:Card\/Header`.*`component:Modal\/Header`/m);
    expect(comps).toMatch(/^> QUESTION\(confusable\.[a-z0-9.-]+\): .*`component:Chip\/Filter`.*`component:Chip\/Filters`/m);
    expect(comps).not.toMatch(/QUESTION\(.*`component:Button\//);

    const overview = readFileSync(join(out, "overview.md"), "utf8");
    expect(overview).toMatch(/^- Design system: lumen \(generation 1\)$/m);
    expect(overview).toMatch(/^- Persona: calm-ledger \/ calm$/m);

    const m = readManifest(out);
    expect(m.files.map((f) => f.path)).toEqual(["components.md", "grammar.md", "overview.md", "vocabulary.md"]);
    for (const f of m.files) expect(f.bytes).toBe(readFileSync(join(out, f.path)).length);
    expect(m.generatedAt).toBe(NOW);
  });

  it("G-BUILD-2: two builds with the same --now are byte-identical", () => {
    const dir = projectCopy();
    const a = join(dir, "out-a");
    const b = join(dir, "out-b");
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--out", a]).code).toBe(0);
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--out", b]).code).toBe(0);
    expect(listFiles(a)).toEqual(PACK_FILES);
    for (const f of PACK_FILES) {
      expect(readFileSync(join(a, f)).equals(readFileSync(join(b, f))), `${f} differs between builds`).toBe(true);
    }
  });

  it("G-BUILD-2: a different --now changes only the manifest clock", () => {
    const dir = projectCopy();
    const a = join(dir, "out-a");
    const b = join(dir, "out-b");
    capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--out", a]);
    capture(["ds", "guidelines", "build", "--dir", dir, "--now", "2027-01-01T00:00:00Z", "--out", b]);
    for (const f of ["overview.md", "vocabulary.md", "components.md"]) {
      expect(readFileSync(join(a, f)).equals(readFileSync(join(b, f)))).toBe(true);
    }
    expect(readManifest(a).generatedAt).not.toBe(readManifest(b).generatedAt);
  });

  it("G-BUILD-3: every rule carries a source that resolves to a real file + token/component", () => {
    const dir = projectCopy();
    capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
    const m = readManifest(join(dir, "design", "guidelines"));
    expect(m.ruleCount).toBeGreaterThan(10);
    expect(m.rules).toHaveLength(m.ruleCount);

    const tokens = JSON.parse(readFileSync(join(dir, "design", "design.tokens.json"), "utf8")) as Record<string, Record<string, unknown>>;
    const registry = JSON.parse(readFileSync(join(dir, "design", "component-registry.json"), "utf8")) as { components: { name: string }[] };
    const componentNames = new Set(registry.components.map((c) => c.name));
    const ids = new Set<string>();
    for (const rule of m.rules) {
      expect(ids.has(rule.id), `duplicate rule id ${rule.id}`).toBe(false);
      ids.add(rule.id);
      expect(rule.sources.length, `${rule.id} has no source`).toBeGreaterThan(0);
      for (const s of rule.sources) {
        expect(existsSync(join(dir, s.path)), `${rule.id}: ${s.path} missing`).toBe(true);
        expect(s.token !== undefined || s.component !== undefined, `${rule.id}: source names nothing`).toBe(true);
        if (s.token !== undefined) {
          const [cat, ...rest] = s.token.split(".");
          expect(tokens[cat ?? ""]?.[rest.join(".")], `${rule.id}: token ${s.token} not in store`).toBeDefined();
        }
        if (s.component !== undefined) expect(componentNames.has(s.component), `${rule.id}: ${s.component}`).toBe(true);
      }
    }
    // The manifest records the sealed hashes the pack was built from.
    expect(m.sources.map((s) => s.path).sort()).toEqual(["design/component-registry.json", "design/design.tokens.json"]);
  });

  it("G-BUILD-4: a DS with no baked roles records a skipped source and still exits 0", () => {
    const dir = projectCopy();
    resealStore(dir, (tokens) => {
      for (const group of Object.values(tokens as Record<string, Record<string, Record<string, unknown>>>)) {
        for (const t of Object.values(group)) delete t["$extensions"];
      }
    });
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
    expect(r.code).toBe(0);
    const m = readManifest(join(dir, "design", "guidelines"));
    const skipped = m.skippedSources.find((s) => /role/i.test(s.reason));
    expect(skipped?.path).toBe("design/design.tokens.json");
    expect(readFileSync(join(dir, "design", "guidelines", "vocabulary.md"), "utf8")).not.toMatch(/^- background → /m);
    expect(r.out).toMatch(/^skipped design\/design\.tokens\.json: /m);
  });

  it("G-BUILD-4: an empty registry records a skipped source and still exits 0", () => {
    const dir = projectCopy();
    resealStore(dir, (_t, registry) => { registry.components = []; });
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
    expect(r.code).toBe(0);
    const m = readManifest(join(dir, "design", "guidelines"));
    expect(m.skippedSources.some((s) => s.path === "design/component-registry.json" && /no components/i.test(s.reason))).toBe(true);
  });

  it("G-ERR-DS: no design system -> DS_NOT_FOUND and nothing is written", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-guidelines-empty-"));
    scratch.push(empty);
    const out = join(empty, "pack");
    const r = capture(["ds", "guidelines", "build", "--dir", empty, "--now", NOW, "--out", out, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_NOT_FOUND");
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(empty, "design"))).toBe(false);
  });

  it("G-ERR-DS: tampered design system -> DS_TAMPERED and nothing is written", () => {
    const dir = projectCopy();
    const tokensPath = join(dir, "design", "design.tokens.json");
    writeFileSync(tokensPath, readFileSync(tokensPath, "utf8").replace("#2563EB", "#2563EC"));
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_TAMPERED");
    expect(existsSync(join(dir, "design", "guidelines"))).toBe(false);
  });

  it("--json envelopes the build summary", () => {
    const dir = projectCopy();
    const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--json"]);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.out) as { ok: boolean; command: string; data: { out: string; files: string[]; ruleCount: number; openQuestions: number } };
    expect(env.ok).toBe(true);
    expect(env.command).toBe("ds guidelines");
    expect(env.data.out).toBe(join(dir, "design", "guidelines"));
    expect(env.data.files).toEqual(["components.md", "grammar.md", "overview.md", "vocabulary.md"]);
    expect(env.data.openQuestions).toBe(2);
    expect(env.data.ruleCount).toBeGreaterThan(10);
  });

  it("rejects unknown flags, bad --now, a missing action and the unregistered export action", () => {
    const dir = projectCopy();
    const flag = capture(["ds", "guidelines", "build", "--dir", dir, "--nope", "--json"]);
    expect(JSON.parse(flag.out).error.code).toBe("UNKNOWN_FLAG");

    const now = capture(["ds", "guidelines", "build", "--dir", dir, "--now", "yesterday", "--json"]);
    expect(now.code).toBe(1);
    expect(JSON.parse(now.out).error.code).toBe("BAD_ARG");
    expect(existsSync(join(dir, "design", "guidelines"))).toBe(false);

    for (const args of [["ds", "guidelines", "--json"], ["ds", "guidelines", "export", "--json"]]) {
      const r = capture([...args, "--dir", dir]);
      expect(r.code).toBe(1);
      expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
    }
  });

  it("help lists the command and its flags", () => {
    const help = capture(["ds", "--help"]).out;
    expect(help).toMatch(/^ {2}ui ds guidelines build\|check /m);
    expect(help).toMatch(/^'ds guidelines' options:$/m);
  });
});

describe("fixture hygiene", () => {
  it("synthetic fixtures never carry a client name (path or content)", () => {
    // Pattern assembled from fragments so this file never contains the words it forbids.
    const banned = new RegExp(`\\b(${["vs", "f"].join("")}|${["pc", "p"].join("")})\\b`, "i");
    const root = join(import.meta.dirname, "fixtures", "ds-guidelines");
    mkdirSync(root, { recursive: true });
    const files = listFiles(root);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(banned.test(f), `path ${f}`).toBe(false);
      expect(banned.test(readFileSync(join(root, f), "utf8")), `content of ${f}`).toBe(false);
    }
  });
});
