/**
 * The rendered tier must blame the page it actually looked at.
 *
 * `runRenderedPass` used to return one flat findings array with no target
 * attribution, and the caller folded the whole thing into `perFile[0]`. With a
 * single file that is invisible — which is exactly why it survived: every real
 * run in this repo passed one page. Give it two and page B's findings are
 * reported against page A.
 *
 * Tested at the merge seam rather than through the command, because the command
 * path needs a browser and this defect has nothing to do with capture. The
 * capture loop's job is only to keep each finding next to its target path; the
 * decision this test guards is the fold.
 *
 * Red probe run before the fix landed: with the old `perFile[0]` body in place,
 * "lands on the page it came from" fails with page B's finding on page A, and
 * "does not touch a page that had none" fails with a leaked finding. Both go
 * green on the keyed merge. The unattributed case reddens by returning [].
 */
import { describe, expect, it } from "vitest";
import { mergeRenderedFindings } from "../src/commands/tell-lint.js";
import type { PerFile, RenderedPerTarget } from "../src/commands/tell-lint.js";
import type { RenderedFinding } from "../src/core/tell-rules-rendered.js";

function perFile(file: string): PerFile {
  return {
    file,
    extractor: "html-cascade",
    tier: "static",
    undercount: false,
    findings: [],
    notEvaluated: [],
    notComputable: 0,
    unresolvedCount: 0,
    waived: 0,
    census: { byKind: {}, total: 0, nodes: 0 },
    unresolvedSheets: [],
  };
}

function rendered(checkId: string): RenderedFinding {
  return {
    checkId,
    severity: "advisory",
    engine: "test-engine",
    message: `${checkId} fired`,
    fixHint: "n/a",
  };
}

describe("rendered findings are attributed to the page that produced them", () => {
  it("lands each finding on the page it came from", () => {
    const files = [perFile("a.html"), perFile("b.html")];
    const paths = ["/abs/a.html", "/abs/b.html"];
    const byTarget: RenderedPerTarget[] = [{ targetPath: "/abs/b.html", findings: [rendered("offscreen-text")] }];

    const { unattributed } = mergeRenderedFindings(files, paths, byTarget);

    expect(unattributed).toEqual([]);
    expect(files[1]?.findings.map((f) => f.checkId)).toEqual(["offscreen-text"]);
  });

  it("does not touch a page that had none", () => {
    const files = [perFile("a.html"), perFile("b.html")];
    const paths = ["/abs/a.html", "/abs/b.html"];
    const byTarget: RenderedPerTarget[] = [{ targetPath: "/abs/b.html", findings: [rendered("offscreen-text")] }];

    mergeRenderedFindings(files, paths, byTarget);

    // The whole defect in one assertion: page A never saw the browser.
    expect(files[0]?.findings).toEqual([]);
  });

  it("keeps both pages' findings apart when both fired", () => {
    const files = [perFile("a.html"), perFile("b.html")];
    const paths = ["/abs/a.html", "/abs/b.html"];
    const byTarget: RenderedPerTarget[] = [
      { targetPath: "/abs/a.html", findings: [rendered("clipped-heading")] },
      { targetPath: "/abs/b.html", findings: [rendered("offscreen-text")] },
    ];

    mergeRenderedFindings(files, paths, byTarget);

    expect(files[0]?.findings.map((f) => f.checkId)).toEqual(["clipped-heading"]);
    expect(files[1]?.findings.map((f) => f.checkId)).toEqual(["offscreen-text"]);
  });

  it("reports findings it cannot attribute instead of dropping them", () => {
    const files = [perFile("a.html")];
    const paths = ["/abs/a.html"];
    const byTarget: RenderedPerTarget[] = [{ targetPath: "/abs/ghost.html", findings: [rendered("offscreen-text")] }];

    const { unattributed } = mergeRenderedFindings(files, paths, byTarget);

    expect(unattributed).toHaveLength(1);
    expect(unattributed[0]?.targetPath).toBe("/abs/ghost.html");
    expect(files[0]?.findings).toEqual([]);
  });
});
