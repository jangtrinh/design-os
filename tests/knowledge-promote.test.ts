import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FIX, capture, useTempDirs } from "./fixtures/knowledge-promotion/cli-capture.js";
import { scrubText } from "../src/core/knowledge-scrub.js";
import { parseLedger } from "../src/core/knowledge-promotion-ledger.js";

const tmp = useTempDirs("knowledge-promote-");

const promote = (ledger: string, out: string, extra: string[] = [], rulings = join(FIX, "rulings.json")) =>
  capture(["knowledge", "promote", rulings, "--ledger", join(FIX, ledger), "--out", out, ...extra]);
const readJson = (dir: string) => JSON.parse(readFileSync(join(dir, "candidates.json"), "utf8"));
const ids = (dir: string): string[] => readJson(dir).candidates.map((c: { id: string }) => c.id);

/** Fixture rulings minus the multi-source one: only recurrence can promote what is left. */
function withoutMultiSource(): string {
  const doc = JSON.parse(readFileSync(join(FIX, "rulings.json"), "utf8"));
  doc.rulings = doc.rulings.filter((r: { id: string }) => r.id !== "r-seeded-leaky");
  const path = join(tmp(), "rulings-quiet.json");
  writeFileSync(path, JSON.stringify(doc), "utf8");
  return path;
}

// The seeded tokens that must never leave the project. Fragments (`jane.doe`, `acme-corp`, `https://`, `@`) are listed too:
// another rule can hide a whole-token leak by rewriting only part of it, which a whole-token check would miss.
const LEAKS = ["admin.acme-corp.io", "staging.acme-corp.io", "jane.doe@acme-corp.io", "/Users/jane/Products", "AbC123xYz789QwErTy45", "10.0.4.17", "Jane Doe", "acme-portal", "Acme Portal", "jane.doe", "acme-corp", "https://", "@", "/shell"];

describe("scrub — C1 red test: leaked tokens absent from the RENDERED candidates.md", () => {
  it("removes hostname, email, absolute path, figma key, ip, project and person from candidates.md", () => {
    const dir = tmp();
    const r = promote("ledger-recurring.jsonl", dir);
    expect(r.code).toBe(0);
    const md = readFileSync(join(dir, "candidates.md"), "utf8");
    expect(md).toContain("r-seeded-leaky"); // the leaky ruling really is in the page…
    for (const token of LEAKS) expect(md, `candidates.md still contains '${token}'`).not.toContain(token); // …with the tokens gone
    const json = readFileSync(join(dir, "candidates.json"), "utf8");
    for (const token of LEAKS) expect(json, `candidates.json still contains '${token}'`).not.toContain(token);
  });
});

/** A ruling whose text carries a hostname and an absolute path that no fixed list would name, plus safe tokens that must survive. */
function classLeakRulings(): string {
  const doc = { schema: "rulings/1", rulings: [{
    id: "r-class-leak", category: "shell", text: "Read /design/private/secret from api.example.shop and foo.internal; keep v1.2.3 and docs/alpha.md.", scope: "global",
    source: ["docs/alpha.md", "docs/beta.md"], since: "2026-09-01", verified_by: "source", status: "active",
  }] };
  const p = join(tmp(), "class-leak.json");
  writeFileSync(p, JSON.stringify(doc), "utf8");
  return p;
}

describe("scrub by class — rendered output (candidates.md AND candidates.json)", () => {
  it("removes any hostname and any deep absolute path, not only listed ones", () => {
    const dir = tmp();
    expect(promote("ledger-quiet.jsonl", dir, [], classLeakRulings()).code).toBe(0);
    for (const f of ["candidates.md", "candidates.json"]) {
      const out = readFileSync(join(dir, f), "utf8");
      expect(out, f).toContain("r-class-leak");
      for (const token of ["api.example.shop", "foo.internal", "/design/private/secret", "example.shop"]) expect(out, `${f} still contains '${token}'`).not.toContain(token);
    }
  });

  it("false-positive guard: a version string and a repo-relative anchor survive", () => {
    const dir = tmp();
    promote("ledger-quiet.jsonl", dir, [], classLeakRulings());
    const c = readJson(dir).candidates[0];
    expect(c.text).toContain("v1.2.3");
    expect(c.text).toContain("docs/alpha.md");
    expect(c.source).toEqual(["docs/alpha.md", "docs/beta.md"]);
  });
});

describe("scrubText (pure)", () => {
  it("replaces each kind with a placeholder and counts it", () => {
    const r = scrubText("mail a@b.io, see https://x.example.com/p?q=1, host db.internal.dev, /Users/me/a/b.ts, ~/notes/x.md, C:\\Users\\me\\x, figma:AbCdEfGhIjKlMnOpQrSt, 192.168.1.9", {});
    expect(r.text).toBe("mail <email>, see <url>, host <hostname>, <abs-path>, <abs-path>, <abs-path>, figma:<figma-file-key>, <ip>");
    expect(r.counts).toMatchObject({ email: 1, url: 1, hostname: 1, "abs-path": 3, "figma-key": 1, ip: 1 });
  });

  it("keeps ordinary repo-relative paths, file names and prose intact", () => {
    for (const keep of ["docs/alpha.md#one", "README.md and src/core/x.ts", "Use 16px gutters, e.g. on cards.", "version 1.2.3 and 4.5", "and/or", "knowledge/rulings.json"]) {
      expect(scrubText(keep, {}).text).toBe(keep);
    }
  });

  it("replaces figma URLs whole, including the file key", () => {
    expect(scrubText("https://www.figma.com/design/AbC123xYz789QwErTy45/Name?node-id=1-2", {}).text).toBe("<url>");
  });

  it("replaces project and person names case-insensitively on word boundaries only", () => {
    const r = scrubText("Acme and ACME-portal; acmeology stays. Ping Jane Doe.", { projects: ["acme"], people: ["Jane Doe"] });
    expect(r.text).toBe("<project> and <project>-portal; acmeology stays. Ping <person>.");
  });

  it("is idempotent", () => {
    const once = scrubText("a@b.io /Users/x/y https://h.dev/z Acme", { projects: ["Acme"] }).text;
    expect(scrubText(once, { projects: ["Acme"] }).text).toBe(once);
  });
});

describe("parseLedger", () => {
  it("reads JSONL, counting unreadable lines", () => {
    const p = parseLedger(readFileSync(join(FIX, "ledger-recurring.jsonl"), "utf8"));
    expect(p?.records).toHaveLength(4);
    expect(p?.skippedLines).toBe(1);
  });
  it("reads a JSON document with entries[]", () => {
    expect(parseLedger(readFileSync(join(FIX, "ledger-entries.json"), "utf8"))?.records).toHaveLength(3);
  });
  it("returns null for text that is neither", () => {
    expect(parseLedger("just words\nmore words\n")).toBeNull();
  });
});

describe("ui knowledge promote — gate", () => {
  it("promotes a recurring ruling (>=3 distinct events by id or principle) and a multi-source ruling", () => {
    const dir = tmp();
    const r = promote("ledger-recurring.jsonl", dir);
    expect(r.code).toBe(0);
    expect(ids(dir)).toEqual(["r-seeded-leaky", "r-recurring-one-source"]); // category order: shell-chrome, spacing
    const c = readJson(dir).candidates;
    expect(c[1]).toMatchObject({ id: "r-recurring-one-source", reasons: ["recurrence"], recurrence: 3, distinctSources: 1 });
    expect(c[0]).toMatchObject({ id: "r-seeded-leaky", reasons: ["multi-source"], recurrence: 0, distinctSources: 2 });
    expect(readJson(dir).counts).toMatchObject({ considered: 3, candidates: 2, notLive: 2, unusable: 0, ledgerEvents: 4, ledgerSkippedLines: 1 });
  });

  it("counts distinct source DOCUMENTS: two anchors into one file corroborate nothing", () => {
    const dir = tmp();
    promote("ledger-quiet.jsonl", dir);
    expect(ids(dir)).not.toContain("r-single-anchor-quiet");
  });

  it("C2 negative control: a ledger with no recurrence promotes nothing and exits 0 (id must match on token boundaries)", () => {
    const dir = tmp();
    const r = promote("ledger-quiet.jsonl", dir, [], withoutMultiSource());
    expect(r.code).toBe(0);
    expect(readJson(dir).candidates).toEqual([]);
    expect(readJson(dir).counts.candidates).toBe(0);
    expect(readFileSync(join(dir, "candidates.md"), "utf8")).toContain("No candidates");
  });

  it("thresholds are read from --min-recurrence / --min-sources", () => {
    const dir = tmp(); promote("ledger-quiet.jsonl", dir, ["--min-recurrence", "2"], withoutMultiSource());
    expect(ids(dir)).toEqual(["r-recurring-one-source"]);
    const dir2 = tmp(); promote("ledger-recurring.jsonl", dir2, ["--min-recurrence", "9", "--min-sources", "3"]);
    expect(ids(dir2)).toEqual([]);
  });

  it("reads a JSON entries[] ledger", () => {
    const dir = tmp();
    promote("ledger-entries.json", dir, [], withoutMultiSource());
    expect(ids(dir)).toEqual(["r-recurring-one-source"]);
  });

  it("is deterministic and independent of ruling order", () => {
    const doc = JSON.parse(readFileSync(join(FIX, "rulings.json"), "utf8"));
    const path = join(tmp(), "reversed.json");
    writeFileSync(path, JSON.stringify({ ...doc, rulings: [...doc.rulings].reverse() }), "utf8");
    const a = tmp(); const b = tmp();
    promote("ledger-recurring.jsonl", a);
    promote("ledger-recurring.jsonl", b, [], path);
    for (const f of ["candidates.json", "candidates.md"]) expect(readFileSync(join(b, f), "utf8")).toBe(readFileSync(join(a, f), "utf8"));
  });

  it("candidates.json only uses fields the schema declares, and carries every required one", () => {
    const dir = tmp();
    promote("ledger-recurring.jsonl", dir);
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "ruling-candidates.schema.json"), "utf8"));
    const item = schema.properties.candidates.items;
    const conforms = (obj: object, def: { properties: object; required?: string[] }): void => {
      for (const k of Object.keys(obj)) expect(Object.keys(def.properties)).toContain(k);
      for (const k of def.required ?? []) expect(Object.keys(obj)).toContain(k);
    };
    const rec = readJson(dir);
    conforms(rec, schema); conforms(rec.counts, schema.properties.counts);
    for (const c of rec.candidates) conforms(c, item);
  });

  it("--redact adds project names beyond what the rulings reveal", () => {
    const dir = tmp();
    promote("ledger-recurring.jsonl", dir, ["--redact", "rhythm"]);
    expect(readFileSync(join(dir, "candidates.md"), "utf8")).not.toMatch(/rhythm/i);
  });
});

describe("ui knowledge promote — names", () => {
  const roleDoc = (): string => {
    const doc = { schema: "rulings/1", rulings: [{
      id: "r-role-words", category: "c", text: "The owner says I am fine; Sam wrote work-discipline-sam.md for pcp.", scope: { apps: ["am", "pcp-web"] },
      source: ["docs/alpha.md", "docs/beta.md"], since: "2026-09-01", verified_by: "owner",
    }] };
    const p = join(tmp(), "roles.json");
    writeFileSync(p, JSON.stringify(doc), "utf8");
    return p;
  };
  const text = (dir: string): string => readJson(dir).candidates[0].text;

  it("never treats a role word (owner, source) as a person", () => {
    const dir = tmp(); promote("ledger-quiet.jsonl", dir, [], roleDoc());
    expect(text(dir)).toContain("The owner says");
  });

  it("does not derive very short app names, which are ordinary words", () => {
    const dir = tmp(); promote("ledger-quiet.jsonl", dir, [], roleDoc());
    expect(text(dir)).toContain("I am fine");
  });

  it("--redact and --redact-people scrub exactly what they name, including inside file names", () => {
    const dir = tmp();
    promote("ledger-quiet.jsonl", dir, ["--redact", "pcp", "--redact-people", "Sam"], roleDoc());
    expect(text(dir)).toBe("The owner says I am fine; <person> wrote work-discipline-<person>.md for <project>.");
    expect(readJson(dir).scrubbed).toMatchObject({ person: 2, project: 2 }) // project: "pcp" in the text + the derived scope app "pcp-web";
  });
});

describe("ui knowledge promote — errors", () => {
  it("rejects a missing ledger, a bad threshold, and an unknown flag", () => {
    const out = tmp();
    expect(capture(["knowledge", "promote", join(FIX, "rulings.json"), "--out", out, "--json"]).out).toContain("--ledger");
    expect(promote("ledger-quiet.jsonl", out, ["--min-recurrence", "0", "--json"]).out).toContain("BAD_THRESHOLD");
    expect(promote("ledger-quiet.jsonl", out, ["--nope", "1", "--json"]).out).toContain("UNKNOWN_FLAG");
    expect(capture(["knowledge", "promote", join(FIX, "rulings.json"), "--ledger", join(FIX, "missing.jsonl"), "--out", out, "--json"]).out).toContain("FILE_NOT_FOUND");
  });
});
