import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FULL, addTokens, answerAll, build, bulkRulings, capture, cleanScratch, listFiles, manifestOf, project, read, tempDir, writeJson,
} from "./helpers/guidelines-harness.js";

afterEach(cleanScratch);

const exportCmd = (dir: string, out: string, extra: string[] = []) =>
  capture(["ds", "guidelines", "export", "--dir", dir, "--target", "figma", "--out", out, ...extra]);

interface ExportData {
  out: string; bundleDir: string; uploadFile: string; totalBytes: number; budgetReached?: boolean; warnings: string[];
  files: { path: string; bytes: number }[];
  trimmed: { file: string; rulesDropped: number; bytesSaved: number; ids: string[] }[];
}
const exportJson = (dir: string, out: string, extra: string[] = []): { code: number; data: ExportData; error?: { code: string; message: string }; raw: string } => {
  const r = exportCmd(dir, out, [...extra, "--json"]);
  const parsed = JSON.parse(r.out) as { data?: ExportData; error?: { code: string; message: string } };
  return { code: r.code, data: parsed.data as ExportData, ...(parsed.error !== undefined ? { error: parsed.error } : {}), raw: r.out };
};

/** A built-and-fully-answered pack, ready to export. */
function answeredProject(overlays?: readonly string[]): { dir: string; pack: string; out: string } {
  const p = project(overlays);
  expect(build(p.dir).code).toBe(0);
  expect(answerAll(p.pack)).toBeGreaterThan(0);
  return { ...p, out: join(tempDir("ease-guidelines-out-"), "export") };
}

const BUNDLE_FILES = ["anti-patterns.md", "apps.md", "components.md", "grammar.md", "overview.md", "rulings.md", "terminology.md", "vocabulary.md"];
const bundleOf = (out: string, name: string): string => read(out, "figma-guidelines", name);

describe("export --target figma — the clean bundle (G-EXPORT-APPS, G-UPLOAD)", () => {
  it("writes 8 files into figma-guidelines/ and UPLOAD.md beside the folder, not inside it", () => {
    const { dir, out } = answeredProject();
    const r = exportCmd(dir, out);
    expect(r.code).toBe(0);
    expect(listFiles(join(out, "figma-guidelines"))).toEqual(BUNDLE_FILES);
    expect(existsSync(join(out, "UPLOAD.md"))).toBe(true);
    expect(existsSync(join(out, "figma-guidelines", "UPLOAD.md"))).toBe(false);
    expect(r.out).toMatch(/^ds guidelines export: wrote 8 file\(s\), [\d,]+ bytes → .*figma-guidelines$/m);
    expect(r.out).toMatch(/^UPLOAD\.md → .*UPLOAD\.md$/m);
  });

  it("apps.md merges every apps/<app>.md under one '## <app> (<n>)' heading each", () => {
    const { dir, out } = answeredProject();
    exportCmd(dir, out);
    const apps = bundleOf(out, "apps.md");
    expect(apps.match(/^## .+$/gm)).toEqual(["## alpha (2)", "## beta (2)"]);
    expect(apps).toMatch(/^# Apps$/m);
    // alpha: forms-inputs (r-004) and product-decision (r-006); beta: product-decision (r-006) and screen-composition (r-005).
    const alpha = apps.slice(apps.indexOf("## alpha"), apps.indexOf("## beta"));
    expect(alpha.match(/^- \*\*r-\d+\*\*/gm)).toEqual(["- **r-004**", "- **r-006**"]);
    expect(alpha).toMatch(/^### forms-inputs$/m);
    const beta = apps.slice(apps.indexOf("## beta"));
    expect(beta.match(/^- \*\*r-\d+\*\*/gm)).toEqual(["- **r-006**", "- **r-005**"]);
    expect(apps).not.toMatch(/Rulings — alpha/);
  });

  it("components.md keeps the look-alike names with their answers and the component rulings, and drops the inventory", () => {
    const { dir, out } = answeredProject();
    exportCmd(dir, out);
    const c = bundleOf(out, "components.md");
    expect(c).toMatch(/^## Confusable names$/m);
    expect(c).toMatch(/^- `component:Card\/Header`, `component:Modal\/Header` — look-alike names/m);
    expect(c).toMatch(/^> QUESTION\(confusable\.card-header\): /m);
    for (const l of FULL) expect(c).toContain(`${l}\n`);
    // Component rulings moved here from rulings.md (tier A, component categories only).
    expect(c).toMatch(/^## Component rulings$/m);
    expect(c).toMatch(/^### component-reuse$/m);
    expect(c).toMatch(/^- \*\*r-001\*\* — Reuse the shared card/m);
    expect(c).toMatch(/^- \*\*r-002\*\* — Tables scroll horizontally/m);
    // No per-category inventory.
    expect(c).not.toMatch(/^- `component:Button\/Primary` — variants/m);
    expect(c).not.toMatch(/^## (button|card|chip|input|modal)$/m);
    // rulings.md no longer carries them; it keeps the rest, with the other-library-wide heading.
    const r = bundleOf(out, "rulings.md");
    expect(r).not.toMatch(/\*\*r-001\*\*|\*\*r-002\*\*/);
    expect(r).toMatch(/^- \*\*r-003\*\*/m);
    expect(r).toMatch(/^## Other library-wide rulings$/m);
  });

  it("provenance is compressed: no generated-block markers, no how-to-read note, and a matching file index", () => {
    const { dir, out } = answeredProject();
    exportCmd(dir, out);
    for (const f of BUNDLE_FILES) expect(bundleOf(out, f), f).not.toMatch(/ds-guidelines:generated/);
    const o = bundleOf(out, "overview.md");
    expect(o).not.toMatch(/How to read this pack/);
    expect(o).toMatch(/^ {2}- apps\.md — owner rulings that bind one app only$/m);
    expect(o).toMatch(/^ {2}- components\.md — look-alike component names and component rulings$/m);
    expect(o).not.toMatch(/apps\//);
    // Rules keep their id and their short source reference.
    expect(bundleOf(out, "rulings.md")).toMatch(/^- \*\*r-003\*\* — Status labels use one fixed vocabulary across every screen\.$/m);
    expect(bundleOf(out, "terminology.md")).toMatch(/^- `term:Panel` — /m);
    expect(o).toMatch(/^## Design stance$/m);
  });

  it("leaves the canonical pack untouched and is byte-identical across exports", () => {
    const { dir, pack, out } = answeredProject();
    const before = listFiles(pack).map((f) => read(pack, f));
    exportCmd(dir, out);
    const first = BUNDLE_FILES.map((f) => bundleOf(out, f)).concat(read(out, "UPLOAD.md"));
    expect(listFiles(pack).map((f) => read(pack, f))).toEqual(before);
    exportCmd(dir, out);
    expect(BUNDLE_FILES.map((f) => bundleOf(out, f)).concat(read(out, "UPLOAD.md"))).toEqual(first);
  });

  it("--json lists each file with its real byte size and the total", () => {
    const { dir, out } = answeredProject();
    const r = exportJson(dir, out);
    expect(r.code).toBe(0);
    expect(r.data.files.map((f) => f.path)).toEqual(BUNDLE_FILES);
    for (const f of r.data.files) expect(f.bytes, f.path).toBe(readFileSync(join(out, "figma-guidelines", f.path)).length);
    expect(r.data.totalBytes).toBe(r.data.files.reduce((n, f) => n + f.bytes, 0));
    expect(r.data.trimmed).toEqual([]);
    expect(r.data.warnings).toEqual([]);
  });

  it("G-UPLOAD: UPLOAD.md carries the manual steps, the byte table, the limits source and the pack date", () => {
    const { dir, out } = answeredProject();
    const r = exportJson(dir, out);
    const u = read(out, "UPLOAD.md");
    for (const l of [
      "1. Open the library file in Figma.", "2. Choose Library → Manage guidelines…",
      "3. Choose Upload and select every file in the folder below.", "4. Apply changes.",
      "Folder to upload: `figma-guidelines`",
    ]) expect(u).toMatch(new RegExp(`^${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
    for (const f of r.data.files) expect(u).toContain(`| ${f.path} | ${f.bytes.toLocaleString("en-US")} |`);
    expect(u).toContain(`| **Total** | **${r.data.totalBytes.toLocaleString("en-US")}** |`);
    expect(u).toMatch(/^Pack built 2026-10-15\. Upload is manual/m);
    expect(u).toMatch(/^Limits checked 2026-10-15 against https:\/\/help\.figma\.com\/hc\/en-us\/articles\/43509372175511$/m);
    expect(u).not.toMatch(/unverified/i);
  });

  it("G-UPLOAD: a pack built from an unsealed store says 'sources unverified' in UPLOAD.md", () => {
    const p = project();
    const path = join(p.dir, "design", "component-registry.json");
    const registry = JSON.parse(readFileSync(path, "utf8")) as { components: Record<string, unknown>[] };
    registry.components.push({ ...registry.components[0], name: "Button/Added" });
    writeFileSync(path, JSON.stringify(registry));
    expect(build(p.dir).code).toBe(1); // default still refuses
    expect(build(p.dir, ["--allow-unsealed"]).code).toBe(0);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    expect(exportJson(p.dir, out).error?.code).toBe("DS_TAMPERED");
    expect(exportCmd(p.dir, out, ["--allow-unsealed"]).code).toBe(0);
    expect(read(out, "UPLOAD.md")).toMatch(/^Sources unverified: design\/component-registry\.json no longer matched the sealed hash/m);
  });
});

describe("export refuses (G-EXPORT-REFUSE)", () => {
  it("OPEN_QUESTIONS (n): unanswered slots are listed and nothing is written", () => {
    const p = project();
    build(p.dir);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    const r = exportJson(p.dir, out);
    expect(r.code).toBe(1);
    expect(r.error?.code).toBe("OPEN_QUESTIONS");
    expect(r.error?.message).toMatch(/^OPEN_QUESTIONS \(\d+\)/);
    expect(existsSync(out)).toBe(false);
    const slots = (JSON.parse(r.raw) as { data: { openQuestions: number; slots: { id: string; file: string; line: number }[] } }).data;
    expect(slots.slots).toHaveLength(slots.openQuestions);
    expect(slots.slots.map((s) => s.id)).toContain("confusable.card-header");
    const text = exportCmd(p.dir, out);
    expect(text.out).toMatch(/^ui: OPEN_QUESTIONS \(\d+\) — /m);
    expect(text.out).toMatch(/^ {2}components\.md:\d+ confusable\.card-header$/m);
  });

  it("a partial answer counts as open", () => {
    const p = project();
    build(p.dir);
    answerAll(p.pack);
    const file = join(p.pack, "components.md");
    writeFileSync(file, read(p.pack, "components.md").replace("**Why:** Wrapped headers break the scan line.\n", ""));
    const out = join(tempDir("ease-guidelines-out-"), "export");
    const r = exportJson(p.dir, out);
    expect(r.error?.code).toBe("OPEN_QUESTIONS");
    expect(r.error?.message).toMatch(/^OPEN_QUESTIONS \(1\)/);
  });

  it("PACK_INVALID: an edited generated block stops the export", () => {
    const { dir, pack, out } = answeredProject();
    writeFileSync(join(pack, "vocabulary.md"), read(pack, "vocabulary.md").replace("→ 16px", "→ 17px"));
    const r = exportJson(dir, out);
    expect(r.error?.code).toBe("PACK_INVALID");
    expect(existsSync(out)).toBe(false);
  });

  it("BUNDLE_DIR_NOT_CLEAN: a foreign file already in figma-guidelines/ is never swallowed or deleted", () => {
    const { dir, out } = answeredProject();
    mkdirSync(join(out, "figma-guidelines"), { recursive: true });
    writeFileSync(join(out, "figma-guidelines", "old.md"), "# old\n");
    const r = exportJson(dir, out);
    expect(r.error?.code).toBe("BUNDLE_DIR_NOT_CLEAN");
    expect(r.error?.message).toContain("old.md");
    expect(read(out, "figma-guidelines", "old.md")).toBe("# old\n");
    expect(existsSync(join(out, "UPLOAD.md"))).toBe(false);
  });

  it("bad flags: --target, --budget and flags that belong to another action", () => {
    const { dir, out } = answeredProject();
    for (const args of [
      ["ds", "guidelines", "export", "--dir", dir, "--out", out],
      ["ds", "guidelines", "export", "--dir", dir, "--out", out, "--target", "sketch"],
      ["ds", "guidelines", "export", "--dir", dir, "--out", out, "--target", "figma", "--budget", "250kb"],
      ["ds", "guidelines", "export", "--dir", dir, "--out", out, "--target", "figma", "--budget", "120"],
      ["ds", "guidelines", "export", "--dir", dir, "--out", out, "--target", "figma", "--budget", "0kb"],
      ["ds", "guidelines", "export", "--dir", dir, "--out", out, "--target", "figma", "--now", "2026-10-15T00:00:00Z"],
      ["ds", "guidelines", "build", "--dir", dir, "--budget", "100kb"],
    ]) {
      const r = capture([...args, "--json"]);
      expect(r.code, args.join(" ")).toBe(1);
      expect((JSON.parse(r.out) as { error: { code: string } }).error.code, args.join(" ")).toBe("BAD_ARG");
    }
    expect(existsSync(out)).toBe(false);
  });
});

/** An answered project whose rulings are generated in bulk (sizes in rulings, not in fixed text). */
function bulkProject(counts: { global: number; alpha: number; beta: number }): { dir: string; pack: string; out: string } {
  const p = project(["terminology"]);
  writeJson(join(p.dir, "design", "knowledge", "rulings.json"), bulkRulings(counts));
  expect(build(p.dir).code).toBe(0);
  answerAll(p.pack);
  return { ...p, out: join(tempDir("ease-guidelines-out-"), "export") };
}

describe("export limits (G-EXPORT-LIMITS)", () => {
  it("over 100 KB: a warning, and nothing is dropped", () => {
    const { dir, out } = bulkProject({ global: 900, alpha: 0, beta: 0 });
    const r = exportJson(dir, out);
    expect(r.code).toBe(0);
    expect(r.data.totalBytes).toBeGreaterThan(100_000);
    expect(r.data.totalBytes).toBeLessThanOrEqual(200_000);
    expect(r.data.trimmed).toEqual([]);
    expect(r.data.warnings).toEqual([expect.stringMatching(/^bundle is [\d,]+ bytes; Figma recommends staying under 100,000$/)]);
    expect(bundleOf(out, "rulings.md").match(/^- \*\*g-\d+\*\*/gm)).toHaveLength(900);
    expect(exportCmd(dir, join(tempDir("ease-guidelines-out-"), "again")).out).toMatch(/^warning: bundle is [\d,]+ bytes; Figma recommends staying under 100,000$/m);
  });

  it("under 100 KB: no warning", () => {
    const { dir, out } = bulkProject({ global: 100, alpha: 0, beta: 0 });
    expect(exportJson(dir, out).data.warnings).toEqual([]);
  });

  it("over 200 KB without a budget: BUDGET_EXCEEDED with per-file bytes, and nothing is written", () => {
    const { dir, out } = bulkProject({ global: 1_700, alpha: 0, beta: 0 });
    const r = exportJson(dir, out);
    expect(r.code).toBe(1);
    expect(r.error?.code).toBe("BUDGET_EXCEEDED");
    expect(r.error?.message).toMatch(/^bundle is [\d,]+ bytes, over Figma's 200,000-byte cap — rulings\.md [\d,]+ B; /);
    const files = (JSON.parse(r.raw) as { data: { files: { path: string; bytes: number }[] } }).data.files;
    expect(files.map((f) => f.path)).toContain("vocabulary.md");
    expect(files.reduce((n, f) => n + f.bytes, 0)).toBeGreaterThan(200_000);
    expect(existsSync(out)).toBe(false);
  });

  it("--budget trims to fit: a budget under the hard cap rescues an over-cap bundle, with a trim report", () => {
    const { dir, out } = bulkProject({ global: 1_700, alpha: 0, beta: 0 });
    const r = exportJson(dir, out, ["--budget", "150kb"]);
    expect(r.code).toBe(0);
    expect(r.data.totalBytes).toBeLessThanOrEqual(150_000);
    expect(r.data.budgetReached).toBe(true);
    const rulings = r.data.trimmed.find((t) => t.file === "rulings.md");
    expect(rulings?.rulesDropped).toBeGreaterThan(0);
    expect(rulings?.ids).toHaveLength(rulings?.rulesDropped ?? -1);
    expect(rulings?.ids[0]).toBe("g-0001"); // oldest first
  });

  it("G-EXPORT-TRIM: units go in priority order, oldest first, and every drop is reported with its ids", () => {
    const p = bulkProject({ global: 300, alpha: 200, beta: 50 });
    const baseOut = join(tempDir("ease-guidelines-out-"), "base");
    const base = exportJson(p.dir, baseOut);
    const untrimmed = new Map(base.data.files.map((f) => [f.path, f.bytes]));
    const budget = base.data.totalBytes - 12_000;
    const r = exportJson(p.dir, p.out, ["--budget", `${Math.ceil(budget / 1000)}kb`]);
    expect(r.code).toBe(0);
    const files = new Map(r.data.files.map((f) => [f.path, f.bytes]));
    expect(r.data.totalBytes).toBeLessThanOrEqual(Math.ceil(budget / 1000) * 1000);

    // grammar → terminology → overview stance are exhausted first, then apps; rulings are not reached.
    expect(r.data.trimmed.map((t) => t.file)).toEqual(["apps.md", "grammar.md", "overview.md", "terminology.md"]);
    const grammar = r.data.trimmed.find((t) => t.file === "grammar.md");
    expect(grammar?.ids).toEqual(expect.arrayContaining(["grammar:Layout"]));
    expect(files.has("grammar.md")).toBe(false); // every section dropped → the file is not shipped
    expect(r.data.trimmed.find((t) => t.file === "terminology.md")?.ids).toEqual(expect.arrayContaining(["term:Panel"]));
    expect(r.data.trimmed.find((t) => t.file === "overview.md")?.ids).toEqual(["overview:stance"]);
    // The whole stance goes — the soul's own `## Never` / `## Always` headings are part of it, not new sections.
    expect(read(p.out, "figma-guidelines", "overview.md")).not.toMatch(/^## (Design stance|Never|Always|Voice)$|gradients on surfaces/m);
    expect(read(baseOut, "figma-guidelines", "overview.md")).toMatch(/^## Never$/m); // it was there before trimming

    // apps: the largest app (alpha) is trimmed, oldest ruling first; beta is untouched.
    const apps = r.data.trimmed.find((t) => t.file === "apps.md");
    const k = apps?.ids.length ?? 0;
    expect(k).toBeGreaterThan(0);
    expect(apps?.ids).toEqual(Array.from({ length: k }, (_, i) => `a-${String(i + 1).padStart(4, "0")}`));
    expect(apps?.bytesSaved).toBe((untrimmed.get("apps.md") ?? 0) - (files.get("apps.md") ?? 0));
    expect(apps?.rulesDropped).toBe(k);
    expect(read(p.out, "figma-guidelines", "apps.md")).toMatch(new RegExp(`^## alpha \\(${200 - k}\\)$`, "m"));
    expect(read(p.out, "figma-guidelines", "apps.md")).toMatch(/^## beta \(50\)$/m);

    // Never trimmed: anti-patterns, vocabulary, components, and rulings (not reached).
    for (const f of ["anti-patterns.md", "vocabulary.md", "components.md", "rulings.md"]) expect(files.get(f), f).toBe(untrimmed.get(f));

    const textOut = join(tempDir("ease-guidelines-out-"), "text");
    const text = exportCmd(p.dir, textOut, ["--budget", `${Math.ceil(budget / 1000)}kb`]);
    expect(text.out).toMatch(/^trimmed apps\.md: dropped \d+ rule\(s\), saved [\d,]+ bytes — a-0001, a-0002/m);
    expect(text.out).toMatch(/^trimmed grammar\.md: dropped \d+ rule\(s\), saved [\d,]+ bytes — grammar:/m);
    expect(read(textOut, "UPLOAD.md")).toMatch(/^## Trimmed to fit the budget$/m);
  });

  it("G-EXPORT-TRIM: a tighter budget empties the apps before it touches tier-A rulings", () => {
    const p = bulkProject({ global: 300, alpha: 200, beta: 50 });
    const r = exportJson(p.dir, p.out, ["--budget", "25kb"]);
    expect(r.code).toBe(0);
    expect(r.data.totalBytes).toBeLessThanOrEqual(25_000);
    const apps = r.data.trimmed.find((t) => t.file === "apps.md");
    expect(apps?.ids).toHaveLength(250);
    expect(r.data.files.map((f) => f.path)).not.toContain("apps.md");
    const rulings = r.data.trimmed.find((t) => t.file === "rulings.md");
    expect(rulings?.ids.length).toBeGreaterThan(0);
    expect(rulings?.ids).toEqual(Array.from({ length: rulings?.ids.length ?? 0 }, (_, i) => `g-${String(i + 1).padStart(4, "0")}`));
  });

  it("a budget that cannot be reached still exports (under the hard cap) and says so", () => {
    const { dir, out } = bulkProject({ global: 50, alpha: 0, beta: 0 });
    const r = exportJson(dir, out, ["--budget", "1kb"]);
    expect(r.code).toBe(0);
    expect(r.data.budgetReached).toBe(false);
    expect(r.data.warnings).toContainEqual(expect.stringMatching(/^could not reach the 1,000-byte budget: nothing left to trim, bundle is [\d,]+ bytes$/));
  });

  it("still over the hard cap after trimming: BUDGET_EXCEEDED (the untrimmable vocabulary is the culprit)", () => {
    const p = project(["terminology"]);
    addTokens(p.dir, 8_000);
    expect(build(p.dir).code).toBe(0);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    const r = exportJson(p.dir, out, ["--budget", "100kb"]);
    expect(r.code).toBe(1);
    expect(r.error?.code).toBe("BUDGET_EXCEEDED");
    expect(r.error?.message).toMatch(/^bundle is [\d,]+ bytes, over Figma's 200,000-byte cap — vocabulary\.md [\d,]+ B; /);
    expect(existsSync(out)).toBe(false);
  });
});

describe("export ignores stale files", () => {
  it("only manifest-listed files feed the bundle", () => {
    const { dir, pack, out } = answeredProject();
    writeFileSync(join(pack, "leftover.md"), "# Leftover\n\nSTALE-MARKER `component:Nope/Missing`\n");
    expect(exportCmd(dir, out).code).toBe(0);
    for (const f of listFiles(join(out, "figma-guidelines"))) expect(bundleOf(out, f), f).not.toMatch(/STALE-MARKER/);
    expect(manifestOf(pack)["staleFiles"]).toEqual([]); // the leftover appeared after the build; export does not touch the manifest
  });
});
