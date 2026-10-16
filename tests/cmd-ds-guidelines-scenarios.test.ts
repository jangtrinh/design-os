import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { canonicalHash, canonicalStringify } from "../src/core/ds-manifest.js";
import { shortHash, stableSlug } from "../src/core/ds-guidelines-model.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "ds-guidelines");
const REPO_ROOT = join(import.meta.dirname, "..");
const NOW = "2026-10-15T00:00:00Z";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** Sealed DS + rulings + CONVENTIONS.md, with one persona anti-pattern added to the manifest. */
function project(): { dir: string; pack: string } {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-scn-"));
  scratch.push(dir);
  cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
  cpSync(join(FIXTURES, "scenarios"), dir, { recursive: true });
  // A control whose leaf role is "button" (the specimen check's family) with hover but no disabled state.
  const rPath = join(dir, "design", "component-registry.json");
  const registry = JSON.parse(readFileSync(rPath, "utf8")) as { components: Record<string, unknown>[] };
  registry.components.push({
    name: "Action/Button", category: "action", markup: "<button></button>", tokensUsed: ["color.brand"],
    variants: ["default"], states: ["default", "hover"], scope: "local",
  });
  writeFileSync(rPath, canonicalStringify(registry));
  const mPath = join(dir, "design", "ds.manifest.json");
  const manifest = JSON.parse(readFileSync(mPath, "utf8")) as { persona: { antiPatterns?: string[] }; registryHash: string };
  manifest.persona.antiPatterns = ["gradient hero banners"];
  manifest.registryHash = canonicalHash(registry);
  writeFileSync(mPath, canonicalStringify(manifest));
  return { dir, pack: join(dir, "design", "guidelines") };
}

/** Reseal the store so it has no measurable gap: no baked roles, no failing pair, no component with a missing state. */
function makeGapFree(dir: string): void {
  const d = join(dir, "design");
  const tokens = JSON.parse(readFileSync(join(d, "design.tokens.json"), "utf8")) as Record<string, Record<string, Record<string, unknown>>>;
  for (const g of Object.values(tokens)) for (const t of Object.values(g)) delete t["$extensions"];
  tokens["color"]!["accent-soft-text"]!["$value"] = "#000000";
  const registry = JSON.parse(readFileSync(join(d, "component-registry.json"), "utf8")) as { components: Record<string, unknown>[] };
  for (const c of registry.components) c["states"] = ["default"];
  const manifest = JSON.parse(readFileSync(join(d, "ds.manifest.json"), "utf8")) as Record<string, unknown>;
  manifest["compiledHash"] = canonicalHash(tokens);
  manifest["registryHash"] = canonicalHash(registry);
  writeFileSync(join(d, "design.tokens.json"), canonicalStringify(tokens));
  writeFileSync(join(d, "component-registry.json"), canonicalStringify(registry));
  writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
}

const build = (dir: string, extra: string[] = []) => capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, ...extra]);
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
const manifestOf = (pack: string): Record<string, unknown> => JSON.parse(read(pack, "guidelines.manifest.json")) as Record<string, unknown>;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Finding { code: string; severity: string; file: string; line: number; message: string }
const check = (dir: string): { code: number; findings: Finding[]; open: number } => {
  const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
  const d = (JSON.parse(r.out) as { data: { findings: Finding[]; openQuestions: number } }).data;
  return { code: r.code, findings: d.findings, open: d.openQuestions };
};
const only = (f: Finding[], code: string): Finding[] => f.filter((x) => x.code === code);

/** Insert answer lines directly under a slot's QUESTION line; returns the QUESTION line number. */
function fill(file: string, slotId: string, answer: string[]): number {
  const lines = readFileSync(file, "utf8").split("\n");
  const idx = lines.findIndex((l) => l.startsWith(`> QUESTION(${slotId}):`));
  expect(idx, `slot ${slotId} in ${file}`).toBeGreaterThanOrEqual(0);
  lines.splice(idx + 1, 0, ...answer);
  writeFileSync(file, lines.join("\n"));
  return idx + 1;
}

const FULL = ["**Do:** Keep every header on one line.", "**Don't:** Let a header wrap.", "**Why:** Wrapped headers break the scan line."];
// Slot ids are derived from stable evidence (a hash of the label, the raw name, the whole member set),
// never from a counter or a line number — spelled out here so a change of the scheme is a visible diff.
const GAP = {
  component: `gap.component.${stableSlug("Action/Button")}.disabled`,
  a11y: `gap.a11y.color-accent-soft-text.on.color-accent-soft-${shortHash("color.accent-soft-text\u0000color.accent-soft")}`,
};
const SLOT = {
  ruling: "ap-ruling-r-201",
  ruling2: "ap-ruling-r-205",
  conv: `ap-conv-layout-${shortHash("raw / absolute (none-layout) frames")}`,
  persona: `ap-persona-gradient-hero-banners-${shortHash("gradient hero banners")}`,
  gapComponent: `ap-${GAP.component}`,
  gapA11y: `ap-${GAP.a11y}`,
  cardHeader: `confusable.card-header-${shortHash("Card/Header\nModal/Header")}`,
  chipFilter: `confusable.chip-filter-${shortHash("Chip/Filter\nChip/Filters")}`,
};

describe("scenario slots (anti-patterns.md)", () => {
  it("G-SLOTS: slots are seeded from rulings, CONVENTIONS DON'T lines, persona and gaps — and only from those", () => {
    const { dir, pack } = project();
    expect(build(dir).code).toBe(0);
    const ap = read(pack, "anti-patterns.md");
    const convLine = read(dir, "CONVENTIONS.md").split("\n").findIndex((l) => l.startsWith("- **DON'T**")) + 1;

    const slotRe = (id: string, evidence: string): RegExp => new RegExp(`^> QUESTION\\(${escapeRe(id)}\\): [^\\n]+ — evidence: ${escapeRe(evidence)}$`, "m");
    expect(ap).toMatch(slotRe(SLOT.ruling, "r-201"));
    expect(ap).toMatch(slotRe(SLOT.ruling2, "r-205"));
    expect(ap).toMatch(slotRe(SLOT.conv, `CONVENTIONS.md:L${convLine}`));
    expect(ap).toMatch(slotRe(SLOT.persona, "persona:calm-ledger"));
    expect(ap).toMatch(slotRe(SLOT.gapComponent, GAP.component));
    expect(ap).toMatch(slotRe(SLOT.gapA11y, GAP.a11y));
    expect(ap.match(/^> QUESTION\(/gm)).toHaveLength(6);

    // Each slot sits directly under its own scenario title.
    expect(ap).toMatch(/^### Ruling r-201 — tables\n> QUESTION\(ap-ruling-r-201\)/m);
    expect(ap).toMatch(/^### Persona anti-pattern: gradient hero banners\n> QUESTION\(/m);
    // Not seeded: no keyword (r-202), process tier (r-203), superseded with "Never" (r-204).
    // Also not seeded: "Do nothing" is not the keyword "do not" (r-206).
    expect(ap).not.toMatch(/r-202|r-203|r-204|r-206/);
    // Confusable slots stay in components.md and count as open questions too.
    expect(read(pack, "components.md").match(/^> QUESTION\(confusable\./gm)).toHaveLength(2);
    expect(manifestOf(pack)["openQuestions"]).toBe(8);
    expect((manifestOf(pack)["slots"] as { id: string; file: string }[]).map((s) => `${s.file}:${s.id}`)).toEqual([
      `anti-patterns.md:${SLOT.ruling}`, `anti-patterns.md:${SLOT.ruling2}`, `anti-patterns.md:${SLOT.conv}`, `anti-patterns.md:${SLOT.persona}`,
      `anti-patterns.md:${SLOT.gapA11y}`, `anti-patterns.md:${SLOT.gapComponent}`,
      `components.md:${SLOT.cardHeader}`, `components.md:${SLOT.chipFilter}`,
    ]);
  });

  it("is byte-identical across builds", () => {
    const { dir } = project();
    build(dir, ["--out", join(dir, "a")]);
    build(dir, ["--out", join(dir, "b")]);
    for (const f of ["anti-patterns.md", "components.md", "guidelines.manifest.json"]) expect(read(dir, "a", f) === read(dir, "b", f), f).toBe(true);
  });

  it("G-GAP-KNOWLEDGE: each measured gap is a generated rule citing its knowledge file AND its gap id", () => {
    const { dir, pack } = project();
    build(dir);
    const ap = read(pack, "anti-patterns.md");
    expect(ap).toMatch(/^- \*\*gap\.component\.action-button-[0-9a-f]{8}\.disabled\*\* — `component:Action\/Button`: [^\n]+\. Knowledge: knowledge\/figma-craft\/component-design\.md$/m);
    expect(ap).toMatch(/^- \*\*gap\.role\.card\*\* — [^\n]+ Knowledge: knowledge\/token-taxonomy\.md$/m);
    expect(ap).toMatch(/^- \*\*gap\.a11y\.color-accent-soft-text\.on\.color-accent-soft-[0-9a-f]{8}\*\* — `token:color\.accent-soft-text` on `token:color\.accent-soft`[^\n]+ Check: ui ds a11y$/m);

    const gaps = manifestOf(pack)["gaps"] as { id: string; kind: string; knowledge?: string }[];
    expect(gaps.filter((g) => g.kind === "role")).toHaveLength(11);
    expect(gaps.find((g) => g.id === GAP.component)).toEqual({
      id: GAP.component, kind: "component", knowledge: "knowledge/figma-craft/component-design.md",
    });
    // Every cited knowledge file exists in this repo, and every citation in the pack is one of those gaps.
    const cited = [...ap.matchAll(/knowledge\/[A-Za-z0-9._/-]+\.md/g)].map((m) => m[0]);
    expect(cited.length).toBeGreaterThan(10);
    for (const path of new Set(cited)) expect(existsSync(join(REPO_ROOT, path)), path).toBe(true);
    const ids = new Set(gaps.map((g) => g.id));
    for (const line of ap.split("\n").filter((l) => l.includes("Knowledge: knowledge/"))) {
      expect(ids.has(/^- \*\*(gap\.[^*]+)\*\*/.exec(line)?.[1] ?? "?"), line).toBe(true);
    }
    // Gap rules carry resolvable sources (a component, a token, or a role).
    const rules = (manifestOf(pack)["rules"] as { id: string; sources: { component?: string; token?: string; role?: string }[] }[]).filter((r) => r.id.startsWith("gap."));
    expect(rules).toHaveLength(gaps.length);
    for (const r of rules) expect(r.sources.some((s) => s.component ?? s.token ?? s.role), r.id).toBeTruthy();
  });

  it("G-GAP-KNOWLEDGE: a pack with no gap cites no knowledge file at all", () => {
    const { dir, pack } = project();
    makeGapFree(dir);
    expect(build(dir).code).toBe(0);
    expect(manifestOf(pack)["gaps"]).toEqual([]);
    for (const f of ["anti-patterns.md", "overview.md", "vocabulary.md", "components.md"]) {
      if (existsSync(join(pack, f))) expect(read(pack, f), f).not.toMatch(/knowledge\/|Knowledge:|\bgap\./);
    }
  });

  it("a colour pair that is only guessed from token names is not a measured gap", () => {
    const { dir, pack } = project();
    const d = join(dir, "design");
    const tokens = JSON.parse(read(d, "design.tokens.json")) as Record<string, Record<string, Record<string, unknown>>>;
    tokens["color"] = {
      "surface-base": { $value: "#FFFFFF", $type: "color" },
      "text-muted": { $value: "#9CA3AF", $type: "color" },
    };
    const manifest = JSON.parse(read(d, "ds.manifest.json")) as Record<string, unknown>;
    manifest["compiledHash"] = canonicalHash(tokens);
    writeFileSync(join(d, "design.tokens.json"), canonicalStringify(tokens));
    writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
    expect(build(dir).code).toBe(0);
    expect((manifestOf(pack)["gaps"] as { kind: string }[]).filter((g) => g.kind === "a11y")).toEqual([]);
    expect(read(pack, "anti-patterns.md")).not.toMatch(/gap\.a11y/);
  });

  it("with no seed at all there is no anti-patterns.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-scn-empty-"));
    scratch.push(dir);
    cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
    makeGapFree(dir);
    const d = join(dir, "design");
    build(dir);
    expect(existsSync(join(d, "guidelines", "anti-patterns.md"))).toBe(false);
  });
});

describe("check — open questions, scenario shape, unbound knowledge", () => {
  it("G-OPEN-Q: a fresh pack exits 0 and warns once per open slot, with file:line", () => {
    const { dir, pack } = project();
    build(dir);
    const r = check(dir);
    expect(r.code).toBe(0);
    expect(r.open).toBe(8);
    const warns = only(r.findings, "OPEN_QUESTION");
    expect(warns).toHaveLength(8);
    expect(warns.every((w) => w.severity === "warning")).toBe(true);
    const line = read(pack, "anti-patterns.md").split("\n").findIndex((l) => l.startsWith(`> QUESTION(${SLOT.ruling}):`)) + 1;
    expect(warns).toContainEqual(expect.objectContaining({ file: "anti-patterns.md", line, message: expect.stringContaining(`'${SLOT.ruling}'`) }));
    expect(r.findings.filter((f) => f.severity === "error")).toEqual([]);
    const text = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(text.out).toMatch(new RegExp(`^ {2}! \\[OPEN_QUESTION\\] anti-patterns\\.md:${line}: `, "m"));
    expect(text.out).toMatch(/^ds guidelines check: .* — 0 error\(s\), 8 warning\(s\)$/m);
  });

  it("G-SCENARIO-SHAPE: an answer missing Why is SCENARIO_INCOMPLETE at the slot's line; a full answer passes and closes the question", () => {
    const { dir, pack } = project();
    build(dir);
    const file = join(pack, "anti-patterns.md");
    const line = fill(file, SLOT.ruling, ["**Do:** Keep headers on one line.", "**Don't:** Let them wrap."]);
    const bad = check(dir);
    expect(bad.code).toBe(1);
    expect(only(bad.findings, "SCENARIO_INCOMPLETE")).toEqual([
      expect.objectContaining({ severity: "error", file: "anti-patterns.md", line, message: expect.stringMatching(/missing \*\*Why:\*\*/) }),
    ]);
    const text = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(text.out).toMatch(new RegExp(`^ {2}✗ \\[SCENARIO_INCOMPLETE\\] anti-patterns\\.md:${line}: `, "m"));

    writeFileSync(file, readFileSync(file, "utf8").replace("**Don't:** Let them wrap.", "**Don't:** Let them wrap.\n**Why:** Wrapped headers break the scan line."));
    const good = check(dir);
    expect(good.code).toBe(0);
    expect(good.open).toBe(7);
    expect(only(good.findings, "SCENARIO_INCOMPLETE")).toEqual([]);
  });

  it("G-SCENARIO-SHAPE: each missing part is named; Do/Don't/Why may share one line", () => {
    const { dir, pack } = project();
    build(dir);
    const file = join(pack, "anti-patterns.md");
    fill(file, SLOT.ruling, ["**Why:** only a reason."]);
    fill(file, SLOT.conv, ["**Do:** a. **Don't:** b. **Why:** c."]);
    const r = check(dir);
    expect(only(r.findings, "SCENARIO_INCOMPLETE").map((f) => f.message)).toEqual([expect.stringMatching(/missing \*\*Do:\*\*, \*\*Don't:\*\*/)]);
    expect(r.open).toBe(7); // the one-line answer is filled; the partial one is still open
  });

  it("slot answers are still linted for invented names and avoided terms", () => {
    const { dir, pack } = project();
    build(dir);
    const line = fill(join(pack, "anti-patterns.md"), SLOT.ruling, ["**Do:** Use `component:Buton/Primary`.", "**Don't:** Wrap.", "**Why:** Scan."]);
    const r = check(dir);
    expect(only(r.findings, "UNKNOWN_NAME")).toEqual([expect.objectContaining({ file: "anti-patterns.md", line: line + 1 })]);
  });

  it("G-GAP-KNOWLEDGE: a hand-written knowledge citation without a gap id is an UNBOUND_KNOWLEDGE warning", () => {
    const { dir, pack } = project();
    build(dir);
    const file = join(pack, "anti-patterns.md");
    const before = read(pack, "anti-patterns.md");
    writeFileSync(file, `${before}\nPer knowledge/figma-craft/component-design.md every control needs a disabled state.\nPer knowledge/token-taxonomy.md (gap.role.card.) a card token is missing.\nPer knowledge/token-taxonomy.md (gap.role.nonsense) something.\n`);
    const base = before.split("\n").length + 1;
    const r = check(dir);
    expect(r.code).toBe(0);
    expect(only(r.findings, "UNBOUND_KNOWLEDGE")).toEqual([
      expect.objectContaining({ severity: "warning", file: "anti-patterns.md", line: base, message: expect.stringMatching(/without a gap id/) }),
      expect.objectContaining({ severity: "warning", file: "anti-patterns.md", line: base + 2, message: expect.stringMatching(/'gap\.role\.nonsense' is not a measured gap/) }),
    ]);
  });

  it("generated gap lines are never judged as unbound, even when the manifest no longer lists their gaps", () => {
    const { dir, pack } = project();
    build(dir);
    expect(only(check(dir).findings, "UNBOUND_KNOWLEDGE")).toEqual([]);
    const mPath = join(pack, "guidelines.manifest.json");
    const m = JSON.parse(readFileSync(mPath, "utf8")) as Record<string, unknown>;
    m["gaps"] = [];
    writeFileSync(mPath, JSON.stringify(m));
    expect(only(check(dir).findings, "UNBOUND_KNOWLEDGE")).toEqual([]);
  });
});

describe("rebuild preserves answers", () => {
  const answerOf = (text: string, slotId: string): string => {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => l.startsWith(`> QUESTION(${slotId}):`));
    return lines.slice(i + 1).filter((_, k, rest) => rest.slice(0, k + 1).every((l) => l.startsWith("**"))).join("\n");
  };

  it("fill -> rebuild: the answer comes back verbatim in the same slot, and a second rebuild changes nothing", () => {
    const { dir, pack } = project();
    build(dir);
    fill(join(pack, "anti-patterns.md"), SLOT.ruling, FULL);
    fill(join(pack, "components.md"), SLOT.cardHeader, ["**Do:** Use the card header inside cards.", "**Don't:** Use it in dialogs.", "**Why:** Dialogs have their own."]);
    expect(build(dir).code).toBe(0);
    expect(answerOf(read(pack, "anti-patterns.md"), SLOT.ruling)).toBe(FULL.join("\n"));
    expect(read(pack, "components.md")).toMatch(/^\*\*Why:\*\* Dialogs have their own\.$/m);
    expect(manifestOf(pack)["openQuestions"]).toBe(6);
    expect(check(dir).open).toBe(6);
    const once = ["anti-patterns.md", "components.md", "guidelines.manifest.json"].map((f) => read(pack, f));
    build(dir);
    expect(["anti-patterns.md", "components.md", "guidelines.manifest.json"].map((f) => read(pack, f))).toEqual(once);
    expect(existsSync(join(pack, "guidelines.orphans.md"))).toBe(false);
    expect(manifestOf(pack)["orphanedAnswers"]).toBe(0);
  });

  it("a partial answer is carried too — never dropped just because it is unfinished", () => {
    const { dir, pack } = project();
    build(dir);
    fill(join(pack, "anti-patterns.md"), SLOT.conv, ["**Do:** half an answer."]);
    build(dir);
    expect(answerOf(read(pack, "anti-patterns.md"), SLOT.conv)).toBe("**Do:** half an answer.");
    expect(only(check(dir).findings, "SCENARIO_INCOMPLETE")).toHaveLength(1);
  });

  it("an answer whose slot is no longer seeded lands in guidelines.orphans.md, is counted, and survives further rebuilds", () => {
    const { dir, pack } = project();
    build(dir);
    const line = fill(join(pack, "anti-patterns.md"), SLOT.ruling, [...FULL, "Note: see `component:Gone/Thing`."]);
    // Remove the seed: r-201 no longer says "never".
    const rPath = join(dir, "design", "knowledge", "rulings.json");
    writeFileSync(rPath, read(rPath).replace("Never wrap column headers onto two lines.", "Keep column headers on one line."));
    expect(build(dir).code).toBe(0);

    expect(read(pack, "anti-patterns.md")).not.toMatch(new RegExp(`QUESTION\\(${SLOT.ruling}\\)`));
    const orphans = read(pack, "guidelines.orphans.md");
    expect(orphans).toMatch(new RegExp(`^## orphan: ${SLOT.ruling} \\(was anti-patterns\\.md:${line}\\)$`, "m"));
    for (const l of [...FULL, "Note: see `component:Gone/Thing`."]) expect(orphans).toContain(`${l}\n`);
    expect(manifestOf(pack)["orphanedAnswers"]).toBe(1);

    // check: warns, exits 0, and does not lint the holding file (its stale names are not errors).
    const r = check(dir);
    expect(r.code).toBe(0);
    expect(only(r.findings, "ORPHANED_ANSWERS")).toEqual([expect.objectContaining({ severity: "warning", file: "guidelines.orphans.md" })]);
    expect(only(r.findings, "UNKNOWN_NAME")).toEqual([]);

    // Idempotent, and append-only: a second orphan is added, the first stays.
    build(dir);
    expect(read(pack, "guidelines.orphans.md")).toBe(orphans);
    fill(join(pack, "anti-patterns.md"), SLOT.conv, FULL);
    writeFileSync(join(dir, "CONVENTIONS.md"), "# Applied Conventions\n");
    build(dir);
    const two = read(pack, "guidelines.orphans.md");
    expect(two.startsWith(orphans.trimEnd())).toBe(true);
    expect(two).toMatch(new RegExp(`^## orphan: ${SLOT.conv} `, "m"));
    expect(manifestOf(pack)["orphanedAnswers"]).toBe(2);
  });
});
