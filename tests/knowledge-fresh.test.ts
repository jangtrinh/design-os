import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FIX, capture, useTempDirs } from "./fixtures/knowledge-promotion/cli-capture.js";

const tmp = useTempDirs("knowledge-fresh-");

const ROOT = join(FIX, "root");
const ruling = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "r-x", category: "c", text: "t", scope: "global", source: ["docs/alpha.md"], since: "2026-09-01", verified_by: "source", ...over,
});
function fileOf(rulings: Record<string, unknown>[]): string {
  const p = join(tmp(), "rulings.json");
  writeFileSync(p, JSON.stringify({ schema: "rulings/1", rulings }), "utf8");
  return p;
}
const fresh = (file: string, extra: string[] = []) => capture(["knowledge", "fresh", file, "--root", ROOT, "--as-of", "2026-09-27", ...extra]);
const data = (file: string, extra: string[] = []) => JSON.parse(fresh(file, ["--json", ...extra]).out).data;

describe("ui knowledge fresh", () => {
  it("prints the STALE list and the summary line", () => {
    const file = fileOf([
      ruling({ id: "r-fresh" }),
      ruling({ id: "r-old", since: "2026-01-01" }),
      ruling({ id: "r-dead", source: ["docs/alpha.md", "docs/gone.md#x"] }),
      ruling({ id: "r-prose", source: ["legacy memory note"] }),
    ]);
    const r = fresh(file);
    expect(r.code).toBe(0);
    expect(r.out).toContain("STALE:");
    expect(r.out).toContain("✗ r-old — age 269d > 90d");
    expect(r.out).toContain("✗ r-dead — dead anchor docs/gone.md");
    expect(r.out).toMatch(/^fresh 1 \/ stale 2 \/ unanchored 1$/m);
  });

  it("measures age from verified_at when present, otherwise since", () => {
    const file = fileOf([ruling({ id: "a", since: "2026-01-01", verified_at: "2026-09-20" }), ruling({ id: "b", since: "2026-09-20", verified_at: "2026-01-01" })]);
    const rows = data(file).rows;
    expect(rows.find((x: { id: string }) => x.id === "a")).toMatchObject({ verdict: "fresh", ageDays: 7 });
    expect(rows.find((x: { id: string }) => x.id === "b")).toMatchObject({ verdict: "stale", ageDays: 269 });
  });

  it("--days moves the threshold", () => {
    const file = fileOf([ruling({ since: "2026-08-01" })]);
    expect(data(file, ["--days", "90"]).summary).toBe("fresh 1 / stale 0 / unanchored 0");
    expect(data(file, ["--days", "30"]).summary).toBe("fresh 0 / stale 1 / unanchored 0");
  });

  it("a missing date is stale, never silently fresh", () => {
    const file = fileOf([ruling({ since: undefined })]);
    expect(data(file).rows[0]).toMatchObject({ verdict: "stale", ageDays: null });
  });

  it("does not assess draft / superseded / retired rulings, and counts them", () => {
    const file = fileOf([ruling({ id: "a" }), ruling({ id: "b", status: "draft" }), ruling({ id: "c", superseded_by: "a" }), ruling({ id: "d", status: "retired" })]);
    const d = data(file);
    expect(d.rows).toHaveLength(1);
    expect(d.notLive).toBe(3);
  });

  it("exits 0 with stale rulings unless --strict", () => {
    const file = fileOf([ruling({ since: "2026-01-01" })]);
    expect(fresh(file).code).toBe(0);
    expect(fresh(file, ["--strict"]).code).toBe(1);
    expect(fresh(fileOf([ruling({})]), ["--strict"]).code).toBe(0);
  });

  it("works on the promotion fixture", () => {
    const d = data(join(FIX, "rulings.json"));
    expect(d.summary).toBe("fresh 3 / stale 0 / unanchored 0");
    expect(d.notLive).toBe(2);
  });

  it("rejects bad flags and inputs", () => {
    const file = fileOf([ruling({})]);
    expect(fresh(file, ["--days", "0", "--json"]).out).toContain("BAD_ARG");
    expect(fresh(file, ["--as-of", "yesterday", "--json"]).out).toContain("BAD_AS_OF");
    expect(fresh(file, ["--nope", "1", "--json"]).out).toContain("UNKNOWN_FLAG");
    expect(capture(["knowledge", "fresh", join(FIX, "missing.json"), "--json"]).out).toContain("FILE_NOT_FOUND");
    const notRulings = join(tmp(), "x.json"); writeFileSync(notRulings, "{}", "utf8");
    expect(capture(["knowledge", "fresh", notRulings, "--json"]).out).toContain("BAD_RULINGS");
  });

  it("is deterministic for a pinned --as-of", () => {
    const file = join(FIX, "rulings.json");
    expect(fresh(file).out).toBe(fresh(file).out);
    expect(readFileSync(file, "utf8")).toContain("r-seeded-leaky");
  });
});
