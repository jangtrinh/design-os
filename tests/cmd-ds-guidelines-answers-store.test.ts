/**
 * Round-2 regression tests: host answers used to live ONLY inside generated files that `build`
 * overwrites, so every guard (ids, harvest scope, write order) left another hole. The root fix is a
 * durable answers store (`guidelines.answers.json`) written before anything else, plus slot ids
 * derived from the full evidence. These tests pin both, and the export backup and profile-check fixes.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  NOW, answerAll, build, capture, cleanScratch, listFiles, project, read, tempDir, writeJson,
} from "./helpers/guidelines-harness.js";
import {
  answerLines, answerUnder, chmodBlocksWrites, editRegistry, fillSlot, fillUnderHeading,
} from "./helpers/guidelines-edit-helpers.js";

const restore: string[] = [];
afterEach(() => {
  for (const p of restore.splice(0).reverse()) { try { chmodSync(p, statSync(p).isDirectory() ? 0o755 : 0o644); } catch { /* gone */ } }
  cleanScratch();
});
const lock = (path: string, mode: number): void => { restore.push(path); chmodSync(path, mode); };
const unlockAll = (): void => { for (const p of restore.splice(0).reverse()) chmodSync(p, statSync(p).isDirectory() ? 0o755 : 0o644); };

const STORE = "guidelines.answers.json";
interface Store { version: number; answers: Record<string, { lines: string[]; file: string }> }
const readStore = (pack: string): Store => JSON.parse(read(pack, STORE)) as Store;
const orphansOf = (pack: string): string => (existsSync(join(pack, "guidelines.orphans.md")) ? read(pack, "guidelines.orphans.md") : "");
const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;
const rulingsFile = (dir: string): string => join(dir, "design", "knowledge", "rulings.json");
const CARD = /^> QUESTION\(confusable\.card-header[^)]*\)/;
const canChmod = chmodBlocksWrites();

/** A project whose CONVENTIONS.md is exactly `body` (basic design system + the scenarios fixtures). */
function conventionsProject(body: string): { dir: string; pack: string; ap: string; conv: string } {
  const p = project(["scenarios"]);
  const conv = join(p.dir, "CONVENTIONS.md");
  writeFileSync(conv, body);
  expect(build(p.dir).code).toBe(0);
  return { ...p, ap: join(p.pack, "anti-patterns.md"), conv };
}
const slotLine = (line: number): RegExp => new RegExp(`^> QUESTION\\(ap-conv-[^)]*\\):.* evidence: CONVENTIONS\\.md:L${line}$`);

describe("A — the answers store is the durable home of every answer", () => {
  it("a failure partway through the renames leaves every answer in guidelines.answers.json; the next build restores them", () => {
    // (skipped where chmod cannot block writes: running as root, or on Windows)
    if (!canChmod) return;
    const p = project(["rulings"]);
    build(p.dir);
    fillSlot(join(p.pack, "anti-patterns.md"), /^> QUESTION\(ap-ruling-r-002[^)]*\)/, answerLines("MUST-SURVIVE"));
    fillSlot(join(p.pack, "components.md"), CARD, answerLines("ALSO-SURVIVES"));
    writeFileSync(rulingsFile(p.dir), read(p.dir, "design", "knowledge", "rulings.json").replace("never wrap", "do wrap"));
    lock(join(p.pack, "apps", "alpha.md"), 0o444);
    lock(join(p.pack, "apps"), 0o555);
    const r = capture(["ds", "guidelines", "build", "--dir", p.dir, "--now", NOW, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { code: "WRITE_ERROR" } });
    const kept = JSON.stringify(readStore(p.pack));
    expect(kept).toContain("MUST-SURVIVE do.");
    expect(kept).toContain("ALSO-SURVIVES do.");
    unlockAll();
    expect(build(p.dir).code).toBe(0);
    expect(read(p.pack, "components.md")).toContain("ALSO-SURVIVES do.");
    expect(orphansOf(p.pack)).toContain("MUST-SURVIVE do.");
    expect(JSON.stringify(readStore(p.pack))).toContain("MUST-SURVIVE do.");
  });

  it("the store holds { version: 1, answers: { <slot id>: { lines, file } } }, byte-identical across rebuilds", () => {
    const p = project([]);
    build(p.dir);
    const id = fillSlot(join(p.pack, "components.md"), CARD, answerLines("STORED"));
    build(p.dir);
    const store = readStore(p.pack);
    expect(store).toEqual({ version: 1, answers: { [id]: { lines: answerLines("STORED"), file: "components.md" } } });
    const first = read(p.pack, STORE);
    build(p.dir);
    expect(read(p.pack, STORE)).toBe(first);
    expect(first.endsWith("\n")).toBe(true);
    // `file` is where the answer lives now, whatever an older store said.
    writeJson(join(p.pack, STORE), { version: 1, answers: { [id]: { lines: answerLines("STORED"), file: "somewhere-old.md" } } });
    rmSync(join(p.pack, "components.md"));
    build(p.dir);
    expect(readStore(p.pack).answers[id]).toEqual({ lines: answerLines("STORED"), file: "components.md" });
    expect(read(p.pack, "components.md")).toContain("STORED do.");
  });

  it("an answer the person deleted from a file comes back from the store; deleting it from the store is how to discard it", () => {
    const p = project([]);
    build(p.dir);
    const id = fillSlot(join(p.pack, "components.md"), CARD, answerLines("PERSISTENT"));
    build(p.dir);
    writeFileSync(join(p.pack, "components.md"), read(p.pack, "components.md").replace(answerLines("PERSISTENT").join("\n") + "\n", ""));
    expect(read(p.pack, "components.md")).not.toContain("PERSISTENT");
    build(p.dir);
    expect(read(p.pack, "components.md")).toContain("PERSISTENT do.");
    // Discarding on purpose: remove the entry from the store AND the file.
    const store = readStore(p.pack);
    delete store.answers[id];
    writeJson(join(p.pack, STORE), store);
    writeFileSync(join(p.pack, "components.md"), read(p.pack, "components.md").replace(answerLines("PERSISTENT").join("\n") + "\n", ""));
    build(p.dir);
    expect(read(p.pack, "components.md")).not.toContain("PERSISTENT");
  });

  it("a stray copy that disagrees with the live answer loses, and its text is parked exactly once", () => {
    const p = project([]);
    build(p.dir);
    fillSlot(join(p.pack, "components.md"), CARD, answerLines("REAL"));
    build(p.dir);
    writeFileSync(join(p.pack, "aaa.md"), read(p.pack, "components.md").replace(/REAL/g, "FAKE"));
    for (let i = 0; i < 3; i++) expect(build(p.dir).code).toBe(0);
    expect(read(p.pack, "components.md")).toContain("REAL do.");
    expect(read(p.pack, "components.md")).not.toContain("FAKE");
    expect(JSON.stringify(readStore(p.pack))).not.toContain("FAKE");
    expect(count(orphansOf(p.pack), /^## orphan: confusable\.card-header-[0-9a-f]{8} /gm)).toBe(1);
    expect(orphansOf(p.pack)).toContain("FAKE do.");
  });

  it("an answer whose slot is gone stays in the store and in the orphans file, and returns when the slot does", () => {
    const p = project(["rulings"]);
    build(p.dir);
    const id = fillSlot(join(p.pack, "anti-patterns.md"), /^> QUESTION\(ap-ruling-r-002[^)]*\)/, answerLines("COMES-BACK"));
    const original = read(p.dir, "design", "knowledge", "rulings.json");
    writeFileSync(rulingsFile(p.dir), original.replace("never wrap", "do wrap"));
    for (let i = 0; i < 3; i++) build(p.dir);
    expect(readStore(p.pack).answers[id]?.lines).toEqual(answerLines("COMES-BACK"));
    expect(count(orphansOf(p.pack), /^## orphan: /gm)).toBe(1);
    const bytes = read(p.pack, STORE);
    build(p.dir);
    expect(read(p.pack, STORE)).toBe(bytes);
    writeFileSync(rulingsFile(p.dir), original); // the seed is back
    build(p.dir);
    expect(read(p.pack, "anti-patterns.md")).toContain("COMES-BACK do.");
  });

  it("with the store deleted, answers are recovered from the files and the store is recreated", () => {
    const p = project([]);
    build(p.dir);
    const id = fillSlot(join(p.pack, "components.md"), CARD, answerLines("FROM-FILES"));
    build(p.dir);
    rmSync(join(p.pack, STORE));
    build(p.dir);
    expect(readStore(p.pack).answers[id]?.lines).toEqual(answerLines("FROM-FILES"));
  });

  it("editing an answer in place updates the store and parks nothing (the old text is a revision, not a rival)", () => {
    const p = project([]);
    build(p.dir);
    const id = fillSlot(join(p.pack, "components.md"), CARD, answerLines("V1"));
    build(p.dir);
    writeFileSync(join(p.pack, "components.md"), read(p.pack, "components.md").replace(/V1/g, "V2"));
    for (let i = 0; i < 2; i++) build(p.dir);
    expect(readStore(p.pack).answers[id]?.lines).toEqual(answerLines("V2"));
    expect(read(p.pack, "components.md")).toContain("V2 do.");
    expect(existsSync(join(p.pack, "guidelines.orphans.md"))).toBe(false);
  });

  it("with the store deleted and the slot gone, the answer is recovered from the orphans file and the store comes back", () => {
    const p = project(["rulings"]);
    build(p.dir);
    const id = fillSlot(join(p.pack, "anti-patterns.md"), /^> QUESTION\(ap-ruling-r-002[^)]*\)/, answerLines("PARKED"));
    const original = read(p.dir, "design", "knowledge", "rulings.json");
    writeFileSync(rulingsFile(p.dir), original.replace("never wrap", "do wrap"));
    build(p.dir); // parks it
    rmSync(join(p.pack, STORE));
    rmSync(join(p.pack, "anti-patterns.md")); // and the file that held the first copy is gone too
    build(p.dir);
    expect(readStore(p.pack).answers[id]?.lines).toEqual(answerLines("PARKED"));
    expect(count(orphansOf(p.pack), /^## orphan: /gm)).toBe(1);
    writeFileSync(rulingsFile(p.dir), original);
    build(p.dir);
    expect(read(p.pack, "anti-patterns.md")).toContain("PARKED do.");
  });

  it("a malformed store is BAD_ANSWERS_STORE: build writes nothing, check errors, export refuses", () => {
    for (const body of ["{ nope", '{"version":2,"answers":{}}', '{"version":1,"answers":{"x":{"lines":"no","file":"a.md"}}}', '{"version":1,"answers":[]}']) {
      const p = project([]);
      build(p.dir);
      answerAll(p.pack);
      const before = listFiles(p.pack).map((f) => `${f}\n${read(p.pack, f)}`);
      writeFileSync(join(p.pack, STORE), body);
      const r = capture(["ds", "guidelines", "build", "--dir", p.dir, "--now", NOW, "--json"]);
      expect(r.code, body).toBe(1);
      expect((JSON.parse(r.out) as { error: { code: string } }).error.code, body).toBe("BAD_ANSWERS_STORE");
      expect(listFiles(p.pack).filter((f) => f !== STORE).map((f) => `${f}\n${read(p.pack, f)}`), body).toEqual(before.filter((x) => !x.startsWith(`${STORE}\n`)));
      const c = capture(["ds", "guidelines", "check", "--dir", p.dir, "--json"]);
      expect(c.code, body).toBe(1);
      expect((JSON.parse(c.out) as { data: { findings: { code: string; file: string; severity: string }[] } }).data.findings).toContainEqual(expect.objectContaining({ code: "BAD_ANSWERS_STORE", file: STORE, severity: "error" }));
      const e = capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", join(tempDir("ease-guidelines-out-"), "x"), "--json"]);
      expect((JSON.parse(e.out) as { error: { code: string } }).error.code, body).toBe("PACK_INVALID");
    }
  });

  it("export and ds context never carry the store", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    build(p.dir); // creates the store
    expect(existsSync(join(p.pack, STORE))).toBe(true);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
    expect(listFiles(join(out, "figma-guidelines")).some((f) => f.includes("answers"))).toBe(false);
    expect(read(out, "UPLOAD.md")).not.toContain("answers.json");
    const ctx = capture(["ds", "context", "--dir", p.dir, "--include", "guidelines"]);
    expect(ctx.code).toBe(0);
    expect(ctx.out).not.toContain("answers");
    const check = capture(["ds", "guidelines", "check", "--dir", p.dir, "--json"]);
    expect(JSON.parse(check.out).data.findings.filter((f: { code: string }) => f.code === "STALE_FILE")).toEqual([]);
  });
});

describe("B — slot ids are derived from the full evidence and never from an index", () => {
  it("two DON'T lines that share their label before the colon keep their own answers when swapped or deleted", () => {
    const first = "- **DON'T** — raw frames: **1** (5%). Use auto-layout.";
    const second = "- **DON'T** — raw frames: **2** (9%). Use constraints.";
    const head = "# Conventions\n\n## Layout\n\n";
    const p = conventionsProject(`${head}${first}\n${second}\n`);
    fillSlot(p.ap, slotLine(5), answerLines("FIRST"));
    fillSlot(p.ap, slotLine(6), answerLines("SECOND"));
    writeFileSync(p.conv, `${head}${second}\n${first}\n`);
    build(p.dir);
    expect(answerUnder(read(p.ap), slotLine(5))).toContain("SECOND do.");
    expect(answerUnder(read(p.ap), slotLine(6))).toContain("FIRST do.");
    writeFileSync(p.conv, `${head}${first}\n`);
    build(p.dir);
    expect(answerUnder(read(p.ap), slotLine(5))).toContain("FIRST do.");
    expect(orphansOf(p.pack)).toContain("SECOND do.");
    expect(read(p.ap)).not.toContain("SECOND do.");
  });

  it("a rescan that only changes the counts in a DON'T line keeps its answer attached", () => {
    const head = "# Conventions\n\n## Layout\n\n";
    const p = conventionsProject(`${head}- **DON'T** — raw frames: **1** (5%). Use auto-layout.\n`);
    fillSlot(p.ap, slotLine(5), answerLines("KEEP"));
    writeFileSync(p.conv, `${head}- **DON'T** — raw frames: **14** (12%). Use auto-layout.\n`);
    build(p.dir);
    expect(answerUnder(read(p.ap), slotLine(5))).toContain("KEEP do.");
    expect(existsSync(join(p.pack, "guidelines.orphans.md"))).toBe(false);
  });

  it("sections whose headings slug alike ('## Foo Bar' and '## foo-bar') stay distinct", () => {
    const body = (a: boolean, b: boolean): string =>
      `# C\n\n${a ? "## Foo Bar\n\n- **DON'T** — wide gutters: **1** (5%). Keep them narrow.\n\n" : ""}${b ? "## foo-bar\n\n- **DON'T** — wide gutters: **3** (7%). Keep them narrow.\n" : ""}`;
    const p = conventionsProject(body(true, true));
    fillUnderHeading(p.ap, /^### Convention \(Foo Bar\): wide gutters$/, "UPPER");
    fillUnderHeading(p.ap, /^### Convention \(foo-bar\): wide gutters$/, "LOWER");
    writeFileSync(p.conv, body(false, true));
    build(p.dir);
    expect(read(p.ap)).toContain("LOWER do.");
    expect(read(p.ap)).not.toContain("UPPER do.");
    expect(orphansOf(p.pack)).toContain("UPPER do.");
  });

  it("components whose names slug alike ('A B/Button' and 'a-b/Button') keep their own gap answers", () => {
    const p = project([]);
    editRegistry(p.dir, (r) => {
      for (const name of ["A B/Button", "a-b/Button"]) r.components.push({ name, category: "button", markup: "<i></i>", tokensUsed: ["color.brand"], variants: ["x"], states: ["default", "hover"], scope: "local" });
    });
    build(p.dir);
    const ap = join(p.pack, "anti-patterns.md");
    fillUnderHeading(ap, /^### Gap: A B\/Button has no 'disabled' state$/, "SPACED");
    fillUnderHeading(ap, /^### Gap: a-b\/Button has no 'disabled' state$/, "DASHED");
    editRegistry(p.dir, (r) => { r.components = r.components.filter((c) => c["name"] !== "A B/Button"); });
    build(p.dir);
    expect(read(ap)).toContain("DASHED do.");
    expect(read(ap)).not.toContain("SPACED do.");
    expect(orphansOf(p.pack)).toContain("SPACED do.");
  });

  it("identical evidence is ONE slot that lists every line it came from", () => {
    const bullet = "- **DON'T** — raw frames: **1** (5%). Use auto-layout.";
    const p = conventionsProject(`# Conventions\n\n## Layout\n\n${bullet}\n${bullet}\n`);
    const ap = read(p.ap);
    expect(count(ap, /^> QUESTION\(ap-conv-/gm)).toBe(1);
    expect(ap).toMatch(/^> QUESTION\(ap-conv-[^)]*\):.* evidence: CONVENTIONS\.md:L5, CONVENTIONS\.md:L6$/m);
  });

  it("rulings whose ids slug to nothing, or to the old fallback word, stay distinct", () => {
    const p = project([]);
    const ruling = (id: string, text: string): unknown => ({ id, category: "tables", text, scope: "global", source: [], since: "2026-01-01" });
    writeJson(rulingsFile(p.dir), { schema: "owner-rulings/1", at: NOW, rulings: [ruling("!!!", "Never stack modals."), ruling("ruling", "Never nest tables.")] });
    build(p.dir);
    fillUnderHeading(join(p.pack, "anti-patterns.md"), /^### Ruling !!! — tables$/, "BANGS");
    fillUnderHeading(join(p.pack, "anti-patterns.md"), /^### Ruling ruling — tables$/, "WORD");
    writeJson(rulingsFile(p.dir), { schema: "owner-rulings/1", at: NOW, rulings: [ruling("ruling", "Never nest tables.")] });
    build(p.dir);
    expect(read(p.pack, "anti-patterns.md")).toContain("WORD do.");
    expect(read(p.pack, "anti-patterns.md")).not.toContain("BANGS do.");
    expect(orphansOf(p.pack)).toContain("BANGS do.");
  });
});

describe("D — the export keeps the previous bundle in a backup next to the staging folder", () => {
  it("a re-export that fails after the swap restores the old bundle and says so accurately", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
    const bundle = join(out, "figma-guidelines");
    const before = listFiles(bundle).map((f) => `${f}\n${read(bundle, f)}`);
    // The next export would differ (an answer changed), but UPLOAD.md can no longer be written.
    writeFileSync(join(p.pack, "components.md"), read(p.pack, "components.md").replace(/Keep every header on one line\./g, "A changed answer."));
    rmSync(join(out, "UPLOAD.md"));
    mkdirSync(join(out, "UPLOAD.md"));
    const r = capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out, "--json"]);
    expect(r.code).toBe(1);
    const error = (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("WRITE_ERROR");
    expect(listFiles(bundle).map((f) => `${f}\n${read(bundle, f)}`)).toEqual(before);
    expect(error.message).toMatch(/previous bundle (is intact|was restored)/);
    expect(error.message).not.toMatch(/nothing was changed/);
    expect(readdirSync(out).sort()).toEqual(["UPLOAD.md", "figma-guidelines"]); // no staging folder, no backup left behind
  });

  it("an older backup left by an interrupted export is never overwritten: the export stops and names it", () => {
    for (const content of ["# the only copy\n", undefined]) {
      const p = project(["rulings", "terminology"]);
      build(p.dir);
      answerAll(p.pack);
      const out = join(tempDir("ease-guidelines-out-"), "export");
      expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
      const backup = join(out, ".figma-guidelines.previous");
      mkdirSync(backup); // (an EMPTY backup folder is refused too: the OS would happily rename over it)
      if (content !== undefined) writeFileSync(join(backup, "precious.md"), content);
      const bundleBefore = listFiles(join(out, "figma-guidelines"));
      const r = capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out, "--json"]);
      expect(r.code).toBe(1);
      const error = (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
      expect(error.code).toBe("WRITE_ERROR");
      expect(error.message).toContain(".figma-guidelines.previous");
      expect(error.message).toContain("nothing was written by this export");
      expect(listFiles(join(out, "figma-guidelines"))).toEqual(bundleBefore);
      if (content !== undefined) expect(read(backup, "precious.md")).toBe(content);
    }
  });

  it("a successful re-export leaves no backup behind", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    for (let i = 0; i < 2; i++) expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["UPLOAD.md", "figma-guidelines"]);
  });
});

describe("E — check --profile figma tells an unreadable folder from a missing one", () => {
  it("a bundle folder we cannot reach is READ_ERROR, not BUNDLE_NOT_FOUND", () => {
    if (!canChmod) return; // (skipped as root or on Windows: chmod cannot block access)
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
    lock(out, 0o000);
    const r = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", join(out, "figma-guidelines"), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { code: "READ_ERROR" } });
    unlockAll();
    const missing = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", join(out, "nope"), "--json"]);
    expect(JSON.parse(missing.out)).toMatchObject({ ok: false, error: { code: "BUNDLE_NOT_FOUND" } });
  });
});
