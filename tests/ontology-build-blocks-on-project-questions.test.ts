/**
 * Every open question the build depends on blocks it, none is tolerated: two framework apps with no ruling block on
 * `app-roots`, a truncated scan blocks on `scan-budget`. The summary of what would be written is still shown, nothing is
 * written, and the lint reports the same open question as an error that names `ui onboard questions`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { WORKSPACE_TWO_APPS, pkg, projectFrom } from "./ds-surface-helpers.js";
import { wideFiles } from "./project-kinds-helpers.js";
import { build, json, lint } from "./ontology-helpers.js";

const FILE = "design/knowledge/ontology.json";
const twoApps = (): string => projectFrom(WORKSPACE_TWO_APPS);
const capped = (): string => projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": "export const Aaa = () => <i />;\n", "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n", ...wideFiles("bulk") });
const kinds = (out: string): string[] => (json(out).error as unknown as { code: string }).code === undefined ? [] : (json(out).data as unknown as { blocked: { clusters: { kind: string }[] } }).blocked.clusters.map((c) => c.kind);

describe.each([["app-roots", twoApps], ["scan-budget", capped]])("an open %s question", (kind, make) => {
  it("blocks the build, shows what would be written, and writes nothing", () => {
    const p = make();
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(kinds(done.out)).toContain(kind);
    expect(json(done.out).data!["wouldWrite"].nodes).toBeGreaterThan(0);
    expect(existsSync(join(p, FILE))).toBe(false);
  });
  it("is named by the text surface, with the summary under it", () => {
    const p = make();
    const done = capture(["ontology", "build", "--dir", p]);
    expect(done.code).toBe(1);
    expect(done.err).toContain(`${kind}:`);
    expect(done.err).toContain("What would be written once the questions are answered");
  });
  it("is an error of the lint that names ui onboard questions, whatever the kind", () => {
    const p = make();
    const before = hashTree(p);
    const done = lint(p);
    expect(done.code).toBe(1);
    const found = (json(done.out).data!["findings"] as { code: string; message: string }[]).find((f) => f.code === "ONBOARD_BLOCKED_NEEDS_OWNER_RULING")!;
    expect(found.message).toContain("ui onboard questions");
    expect(found.message).toContain(kind);
    expect(hashTree(p)).toBe(before);
  });
});

describe("the note of a source", () => {
  it("is never cut in the middle of its next action: the app-roots answer is named whole", () => {
    const p = twoApps();
    const done = build(p);
    const note = (json(done.out).data!["wouldWrite"].sources as { kind: string; note: string }[]).find((s) => s.kind === "screen")!.note;
    expect(note).toContain("2 nested app roots do ('apps/admin', 'apps/web')");
    expect(note).toContain("ui onboard questions --format claude");
    expect(note).not.toContain("--app");
  });
});
