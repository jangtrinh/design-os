/**
 * `ui init` checks the section markers of every runtime it is about to write before it writes anything, forced or not:
 * "nothing was written" is then true, and the manifests and adapter files that already exist all survive.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";

const END = "<!-- END ease-design -->";
/** An initialised project for all runtimes whose own AGENTS.md text is followed by the kernel section, end marker deleted. */
function damaged(): string {
  const d = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "init-preflight-"));
  writeFileSync(join(d, "AGENTS.md"), "# Mine\n");
  expect(capture(["init", "--all", "--cwd", d]).code).toBe(0);
  const file = join(d, "AGENTS.md");
  writeFileSync(file, readFileSync(file, "utf8").replace(`${END}\n`, "").replace(END, "") + "\nKEEP-ME\n");
  expect(readFileSync(file, "utf8")).not.toContain(END);
  return d;
}

describe("ui init on a project whose kernel end marker was deleted", () => {
  for (const [label, flags] of [["all runtimes, forced", ["--all", "--force"]], ["one runtime, forced", ["--runtime", "codex", "--force"]], ["all runtimes, not forced", ["--all"]], ["one runtime, not forced", ["--runtime", "codex"]]] as const) {
    it(`${label}: refused, and the tree hash is unchanged`, () => {
      const d = damaged();
      const before = hashTree(d);
      const done = capture(["init", ...flags, "--cwd", d, "--json"]);
      expect(done.code).toBe(1);
      expect(JSON.parse(done.out).error.code).toBe("SECTION_MALFORMED");
      expect(JSON.parse(done.out).error.message).toContain("nothing was written");
      expect(hashTree(d)).toBe(before);
    });
  }
  it("every manifest and adapter file that existed is still there", () => {
    const d = damaged();
    const existed = ["AGENTS.ease-design.json", ".claude/rules/design-os-routing.md"].filter((r) => existsSync(join(d, r)));
    expect(existed.length).toBeGreaterThan(0);
    capture(["init", "--all", "--force", "--cwd", d]);
    for (const r of existed) expect(existsSync(join(d, r)), r).toBe(true);
  });
  it("a project with a well-formed section is still initialised and re-initialised", () => {
    const d = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "init-preflight-ok-"));
    expect(capture(["init", "--all", "--cwd", d]).code).toBe(0);
    expect(capture(["init", "--all", "--force", "--cwd", d]).code).toBe(0);
  });
});
