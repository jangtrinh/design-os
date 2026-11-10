/** `ui ds soul check` says once, naming the file, when the binding rules file exists and cannot be parsed. */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { capture } from "./helpers/cli-capture.js";

const SOUL = `---\nstatus: ratified\n---\n\n# Soul\n\n## Never\n\n- No purple.\n\n## Always\n\n- Real photos.\n\n## Voice\n\n- Plain.\n`;
function project(rules?: string): string {
  const root = mkdtempSync(join(tmpdir(), "ns-rules-warn-"));
  mkdirSync(join(root, "design", "rules"), { recursive: true });
  writeFileSync(join(root, "design", "soul.md"), SOUL);
  if (rules !== undefined) writeFileSync(join(root, "design", "rules", "_adherence.rules.json"), rules);
  return root;
}
const count = (s: string, needle: string): number => s.split(needle).length - 1;

describe("ui ds soul check and the binding rules file", () => {
  it("gives exactly one warning that names the file when it cannot be parsed, and still exits 0", () => {
    const r = capture(["ds", "soul", "check", "--dir", project("{ not json")]);
    expect(r.code).toBe(0);
    expect(count(r.out, "[soul-rules-unreadable]")).toBe(1);
    expect(r.out).toContain("_adherence.rules.json");
  });
  it("gives none when the file is absent or valid", () => {
    expect(capture(["ds", "soul", "check", "--dir", project()]).out).not.toContain("soul-rules-unreadable");
    expect(capture(["ds", "soul", "check", "--dir", project(JSON.stringify({ rules: [] }))]).out).not.toContain("soul-rules-unreadable");
  });
});
