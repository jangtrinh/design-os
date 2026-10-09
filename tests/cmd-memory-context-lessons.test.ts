import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ownerMemoryFixture } from "./helpers/memory-lesson-fixture.js";
import { canonicalStringify } from "../src/core/ds-manifest.js";

let owner: ReturnType<typeof ownerMemoryFixture>;
let previousHome: string | undefined;
let home: string;
beforeEach(() => {
  previousHome = process.env["EASE_DESIGN_HOME"];
  home = mkdtempSync(join(tmpdir(), "learning-context-home-"));
  process.env["EASE_DESIGN_HOME"] = home;
  owner = ownerMemoryFixture();
});
afterEach(() => {
  owner?.cleanup(); rmSync(home, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = previousHome;
});
const context = (...extra: string[]) => owner.cmd(["context", "--json", "--max-bytes", "8192", ...extra]);

describe("owner lesson context at the CLI seam", () => {
  it("automatically retrieves accepted project lessons, with pending separate", () => {
    const id = owner.propose();
    let result = context();
    expect(result.code, result.out).toBe(0);
    expect(JSON.parse(result.out).data.lessons).toEqual([]);
    expect(JSON.parse(result.out).data.learning.excluded.pending).toBe(1);
    owner.review(id);
    result = context();
    expect(result.code, result.out).toBe(0);
    expect(JSON.parse(result.out).data.lessons.map((x: { id: string }) => x.id)).toEqual([id]);
    expect(JSON.parse(result.out).data.learning.dsRevision).toBe(owner.revision);
  });

  it("reaches component #40 only by its exact target, with no 25 component cap", () => {
    const id = owner.propose("Preserve this owner's compact control.", "component", "Component/40");
    owner.review(id);
    expect(JSON.parse(context().out).data.lessons).toEqual([]);
    expect(JSON.parse(context("--components", "Component/4").out).data.lessons).toEqual([]);
    expect(JSON.parse(context("--components", "Component/40").out).data.lessons[0].id).toBe(id);
    expect(context("--components", "component/40").code).toBe(1);
  });

  it("keeps pattern scope distinct and preserves conflicting accepted lessons", () => {
    const a = owner.propose("Use compact spacing.", "pattern", "Component/40");
    const b = owner.propose("Use generous spacing.", "pattern", "Component/40");
    owner.review(a); owner.review(b);
    expect(JSON.parse(context("--components", "Component/40").out).data.lessons).toEqual([]);
    expect(JSON.parse(context("--patterns", "Component/40").out).data.lessons.map((x: { id: string }) => x.id)).toEqual([a, b]);
  });

  it("suppresses changed evidence without erasing history and permits withdrawal", () => {
    const id = owner.propose(); owner.review(id);
    writeFileSync(join(owner.dir, "decision.md"), "Owner changed the decision.\n");
    const result = context();
    expect(result.code, result.out).toBe(0);
    expect(JSON.parse(result.out).data.lessons).toEqual([]);
    expect(JSON.parse(result.out).data.learning.excluded.evidenceInvalid).toBe(1);
    owner.review(id, "revoke");
    expect(JSON.parse(context().out).data.learning.excluded.inactive).toBe(1);
  });

  it("suppresses prior revisions and remains rebuildable after graph deletion", () => {
    const id = owner.propose(); owner.review(id);
    rmSync(join(owner.dir, "design/memory.graph.json"));
    expect(JSON.parse(context().out).data.lessons[0].id).toBe(id);
    const manifest = JSON.parse(readFileSync(owner.manifestPath, "utf8"));
    manifest.generation += 1;
    writeFileSync(owner.manifestPath, canonicalStringify(manifest));
    expect(JSON.parse(context().out).data.learning.excluded.staleRevision).toBe(1);
    owner.review(id, "revoke");
    expect(JSON.parse(context().out).data.lessons).toEqual([]);
  });

  it("keeps lessons out of critique and isolates other owners", () => {
    const id = owner.propose(); owner.review(id);
    expect(JSON.parse(context("--for", "critique").out).data.lessons).toEqual([]);
    const other = ownerMemoryFixture();
    try { expect(JSON.parse(other.cmd(["context", "--json"]).out).data.lessons).toEqual([]); }
    finally { other.cleanup(); }
  });

  it("honors one Unicode byte budget and refuses to omit required lessons silently", () => {
    const id = owner.propose("Giữ nhãn gọn. ".repeat(60)); owner.review(id);
    for (const flags of [[], ["--json"]]) {
      const small = owner.cmd(["context", "--max-bytes", "400", ...flags]);
      expect(small.code).toBe(1);
      expect(small.out + small.err).toContain("CONTEXT_OVERFLOW");
      expect(small.out + small.err).toContain(id);
      const enough = owner.cmd(["context", "--max-bytes", "6000", ...flags]);
      expect(enough.code, enough.out).toBe(0);
      expect(Buffer.byteLength(enough.out, "utf8")).toBeLessThanOrEqual(6000);
      expect(enough.out).toContain("Giữ nhãn gọn.");
    }
  });

  it("exports no lesson events to an incremental recalled corpus", () => {
    const id = owner.propose(); owner.review(id);
    expect(JSON.parse(owner.cmd(["export-corpus", "--json"]).out).data.items.some((x: { id: string }) => x.id === id)).toBe(false);
  });
});
