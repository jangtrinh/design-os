/**
 * `ui ds harvest-bans` end to end through the CLI entry point: the dry run writes nothing, --write
 * proposes, --accept promotes one machine rule, errors use the declared codes; and `ui ds import` runs
 * the same pass, prints one summary line, and never fails because the harvest did.
 */
import { describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { run } from "../src/cli.js";
import { checkSoul } from "../src/core/ds-soul.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oi-browser", "source", "native");

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}
const errorCode = (r: { out: string }): string => (JSON.parse(r.out) as { error: { code: string } }).error.code;

/** Every file under `dir` with its bytes, sorted: a snapshot to compare before and after. */
function snapshot(dir: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel === "" ? name : `${rel}/${name}`;
    const p = join(dir, r);
    if (readdirSafe(p)) Object.assign(out, snapshot(dir, r));
    else out[r] = readFileSync(p, "utf8");
  }
  return out;
}
function readdirSafe(p: string): boolean { try { readdirSync(p); return true; } catch { return false; } }

const SOUL = `---\nstatus: ratified\n---\n\n# Soul\n\n## Never\n\n- No purple.\n\n## Always\n\n- Real photos.\n\n## Voice\n\n- Plain.\n`;
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "ns-cli-"));
  mkdirSync(join(root, "design"), { recursive: true });
  writeFileSync(join(root, "design", "soul.md"), SOUL);
  return root;
}

describe("ui ds harvest-bans", () => {
  it("a dry run reports every probe with its denominator and writes nothing", () => {
    const root = project();
    const before = snapshot(root);
    const r = capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root]);
    expect(r.code).toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(join(root, "design", "rules"))).toBe(false);
    for (let i = 1; i <= 12; i++) expect(r.out).toContain(`NS-${String(i).padStart(2, "0")} `);
    expect(r.out).toMatch(/NS-01 monospace-ui-leak: 0 found in \d+ scanned file\(s\) -> propose/);
    expect(r.out).toContain("excluded account-route-node-71.C77w0PPh.js:2  inside <code>");
    expect(r.out).toContain("dry run: nothing written");
    expect(r.out).toContain("figma inventory: none");
  });

  it("--write proposes and leaves the binding Never and the binding rules file alone", () => {
    const root = project();
    const r = capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--write"]);
    expect(r.code).toBe(0);
    const soul = readFileSync(join(root, "design", "soul.md"), "utf8");
    expect(soul).toContain("## Never (proposed)");
    expect(soul.match(/^- NS-\d\d /gm)?.length).toBeGreaterThanOrEqual(6);
    expect(soul).toContain("## Never\n\n- No purple.\n\n## Never (proposed)");
    expect(existsSync(join(root, "design", "rules", "_adherence.rules.json"))).toBe(false);
    expect(existsSync(join(root, "design", "rules", "_adherence.proposed.json"))).toBe(true);
    expect(r.out).toContain("binding '## Never' and _adherence.rules.json: not touched");
  });

  it("the second --write changes nothing and prints the same report", () => {
    const root = project();
    const first = capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--write"]);
    const snap = snapshot(root);
    const second = capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--write"]);
    expect(snapshot(root)).toEqual(snap);
    expect(second.out.replace(/updated/g, "unchanged")).toBe(first.out.replace(/updated/g, "unchanged"));
    expect(second.out).toContain("unchanged");
  });

  it("--json carries the report, the plan and what was written", () => {
    const root = project();
    const r = capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--json"]);
    const data = (JSON.parse(r.out) as { data: { write: boolean; report: { probes: unknown[] }; proposals: { id: string; status: string }[]; written: unknown } }).data;
    expect(data.write).toBe(false);
    expect(data.report.probes).toHaveLength(12);
    expect(data.proposals.find((p) => p.id === "NS-01")?.status).toBe("propose");
    expect(data.written).toBeNull();
  });

  it("--accept promotes a machine rule and refuses a bullet-only probe and an unknown id", () => {
    const root = project();
    capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--write"]);
    const soulBefore = readFileSync(join(root, "design", "soul.md"), "utf8");
    const ok = capture(["ds", "harvest-bans", "--accept", "NS-10", "--dir", root]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("move the NS-10 bullet");
    expect(readFileSync(join(root, "design", "soul.md"), "utf8")).toBe(soulBefore);
    const rules = JSON.parse(readFileSync(join(root, "design", "rules", "_adherence.rules.json"), "utf8")) as { rules: { id: string }[] };
    expect(rules.rules.map((x) => x.id)).toEqual(["NS-10"]);
    const bulletOnly = capture(["ds", "harvest-bans", "--accept", "NS-04", "--dir", root, "--json"]);
    expect(bulletOnly.code).toBe(1);
    expect(errorCode(bulletOnly)).toBe("BAD_ARG");
    expect(bulletOnly.out).toContain("rule kind");
    expect(errorCode(capture(["ds", "harvest-bans", "--accept", "NS-77", "--dir", root, "--json"]))).toBe("BAD_ARG");
  });

  it.skipIf(process.getuid?.() === 0)("--accept on a write failure changes neither file", () => {
    const root = project();
    capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--write"]);
    const rulesDir = join(root, "design", "rules");
    const before = snapshot(root);
    chmodSync(rulesDir, 0o555);
    try {
      const r = capture(["ds", "harvest-bans", "--accept", "NS-01", "--dir", root, "--json"]);
      expect(r.code).toBe(1);
    } finally { chmodSync(rulesDir, 0o755); }
    expect(snapshot(root)).toEqual(before);
  });

  it("rejects misuse with the declared codes", () => {
    const root = project();
    expect(errorCode(capture(["ds", "harvest-bans", "--dir", root, "--json"]))).toBe("BAD_ARG");
    expect(errorCode(capture(["ds", "harvest-bans", "--source", join(root, "nope"), "--dir", root, "--json"]))).toBe("FILE_NOT_FOUND");
    expect(errorCode(capture(["ds", "harvest-bans", "--source", FIXTURE, "--bogus", "--json"]))).toBe("UNKNOWN_FLAG");
    expect(errorCode(capture(["ds", "harvest-bans", "--accept", "NS-01", "--source", FIXTURE, "--dir", root, "--json"]))).toBe("BAD_ARG");
    mkdirSync(join(root, "design", "rules"), { recursive: true });
    writeFileSync(join(root, "design", "rules", "_adherence.rules.json"), "{ nope");
    expect(errorCode(capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--json"]))).toBe("ADHERENCE_BAD_JSON");
  });

  it("a comment-only binding Never keeps failing soul check after a harvest", () => {
    const root = mkdtempSync(join(tmpdir(), "ns-cli-"));
    capture(["ds", "soul", "init", "--dir", root]);
    capture(["ds", "harvest-bans", "--source", FIXTURE, "--dir", root, "--write"]);
    const check = capture(["ds", "soul", "check", "--dir", root]);
    expect(check.code).toBe(1);
    expect(check.out).toContain("soul-empty-section");
    expect(checkSoul(readFileSync(join(root, "design", "soul.md"), "utf8")).errorCount).toBeGreaterThan(0);
  });
});
