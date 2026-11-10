/**
 * An accepted proposal does not vanish from the soul: its bullet stays in the generated region, marked
 * accepted, until a line under the binding `## Never` names it; `ui ds soul check` warns while it is not
 * moved; a second --accept says it is already promoted; the binding block is never written.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { capture, errorCodeOf } from "./helpers/cli-capture.js";

const SOUL = `---\nstatus: ratified\n---\n\n# Soul\n\n## Never\n\n- No purple.\n\n## Always\n\n- Real photos.\n\n## Voice\n\n- Plain.\n`;
const ACCEPTED = "- NS-01 monospace on UI controls or tables — accepted: move this line under '## Never'";

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "ns-life-"));
  mkdirSync(join(root, "design"), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "design", "soul.md"), SOUL);
  writeFileSync(join(root, "src", "app.html"), "<h1>Hi</h1>");
  return root;
}
const soulFile = (root: string): string => join(root, "design", "soul.md");
const soul = (root: string): string => readFileSync(soulFile(root), "utf8");
const harvest = (root: string) => capture(["ds", "harvest-bans", "--source", join(root, "src"), "--dir", root, "--write"]);
const accept = (root: string, id = "NS-01") => capture(["ds", "harvest-bans", "--accept", id, "--dir", root]);
const check = (root: string) => capture(["ds", "soul", "check", "--dir", root]);
const regionOf = (t: string): string => t.slice(t.indexOf("<!-- ds-harvest-bans:begin"), t.indexOf("<!-- ds-harvest-bans:end -->"));
/** The binding `## Never` section: from its heading to the next `## ` heading. */
const bindingNever = (t: string): string => t.slice(t.indexOf("## Never\n"), t.indexOf("\n## ", t.indexOf("## Never\n") + 1));

describe("--accept, then another harvest", () => {
  it("keeps the id's bullet in the region, marked accepted, and leaves the binding Never byte-identical", () => {
    const root = project();
    const never = bindingNever(soul(root));
    harvest(root);
    expect(regionOf(soul(root))).toContain("- NS-01 monospace on UI controls or tables — 0 hits");
    expect(accept(root).code).toBe(0);
    expect(bindingNever(soul(root))).toBe(never);
    const again = harvest(root);
    expect(again.code).toBe(0);
    expect(regionOf(soul(root))).toContain(ACCEPTED);
    expect(regionOf(soul(root)).split("- NS-01 ").length).toBe(2); // exactly one bullet for the id
    expect(bindingNever(soul(root))).toBe(never);
    expect(again.out).toContain("accepted, waiting for a line under '## Never': NS-01");
    const second = soul(root);
    harvest(root);
    expect(soul(root)).toBe(second);
  });

  it("keeps it through a ui ds import as well", () => {
    const root = project();
    harvest(root);
    accept(root);
    const tokens = join(root, "tokens.json");
    writeFileSync(tokens, JSON.stringify({ colors: { primary: "#3366ff" } }));
    const never = bindingNever(soul(root));
    const r = capture(["ds", "import", tokens, "--dir", root, "--force"]);
    expect(r.code).toBe(0);
    expect(regionOf(soul(root))).toContain(ACCEPTED);
    expect(bindingNever(soul(root))).toBe(never);
  });

  it("the bullet leaves the region once a line under '## Never' names the id, and the Never block is then the owner's own", () => {
    const root = project();
    harvest(root);
    accept(root);
    harvest(root);
    const moved = soul(root).replace("- No purple.\n", "- No purple.\n- NS-01 never monospace on UI controls or tables.\n");
    writeFileSync(soulFile(root), moved);
    const never = bindingNever(moved);
    const r = harvest(root);
    expect(r.code).toBe(0);
    expect(regionOf(soul(root))).not.toContain("- NS-01 ");
    expect(bindingNever(soul(root))).toBe(never);
    expect(r.out).not.toContain("accepted, waiting");
    expect(regionOf(soul(root))).toContain("- NS-10 ");
  });

  it("a line in the proposed section that carries the id does not count as moved", () => {
    const root = project();
    harvest(root);
    accept(root);
    writeFileSync(soulFile(root), soul(root).replace("<!-- ds-harvest-bans:begin", "- NS-01 owner scribble in the proposed section\n\n<!-- ds-harvest-bans:begin"));
    harvest(root);
    expect(regionOf(soul(root))).toContain(ACCEPTED);
  });
});

describe("ui ds soul check", () => {
  it("warns about a promoted rule with no line under '## Never', and stops warning once it is moved", () => {
    const root = project();
    harvest(root);
    accept(root);
    const warned = check(root);
    expect(warned.out).toContain("[soul-promoted-rule-unplaced]");
    expect(warned.out).toContain("NS-01 is promoted");
    expect(warned.code).toBe(0); // a warning, not an error
    writeFileSync(soulFile(root), soul(root).replace("- No purple.\n", "- No purple.\n- NS-01 never monospace.\n"));
    expect(check(root).out).not.toContain("soul-promoted-rule-unplaced");
  });

  it("does not warn when nothing is promoted, and reports the warning in --json", () => {
    const root = project();
    harvest(root);
    expect(check(root).out).not.toContain("soul-promoted-rule-unplaced");
    accept(root);
    const j = JSON.parse(capture(["ds", "soul", "check", "--dir", root, "--json"]).out) as { data: { findings: { checkId: string; severity: string }[]; warningCount: number } };
    expect(j.data.findings.some((f) => f.checkId === "soul-promoted-rule-unplaced" && f.severity === "warning")).toBe(true);
  });
});

describe("a second --accept", () => {
  it("says the id is already promoted, changes nothing, and does not blame a missing harvest", () => {
    const root = project();
    harvest(root);
    accept(root);
    const rules = readFileSync(join(root, "design", "rules", "_adherence.rules.json"), "utf8");
    const second = capture(["ds", "harvest-bans", "--accept", "NS-01", "--dir", root, "--json"]);
    expect(second.code).toBe(1);
    expect(errorCodeOf(second)).toBe("BAD_ARG");
    expect(second.out).toContain("already promoted");
    expect(second.out).not.toContain("Run 'ui ds harvest-bans");
    expect(readFileSync(join(root, "design", "rules", "_adherence.rules.json"), "utf8")).toBe(rules);
  });
});
