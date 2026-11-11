/**
 * A capped project scan must not shrink the surface (review fix round, section B): the component directories of the
 * chosen app come from the surface's own walk of that app, through the one rule the scan applies, and the output says
 * when the project scan, which finds the app roots, was truncated.
 */
import { describe, expect, it } from "vitest";
import { componentDirsOf } from "../src/core/ds-surface/component-dirs.js";
import { scanProject } from "../src/core/project-scan.js";
import { capture } from "./owner-rulings-helpers.js";
import { wideFiles } from "./project-kinds-helpers.js";
import { answerKind, envelope, fixtureCopy, pkg, projectFrom, surface } from "./ds-surface-helpers.js";

const component = (n: string): string => `export const ${n} = () => <i />;\n`;
const cappedApp = (): string => projectFrom({
  "package.json": pkg({ react: "18" }),
  "src/components/A.tsx": component("Aaa"), "src/components/B.tsx": component("Bbb"), "src/components/C.tsx": component("Ccc"),
  "src/components/forms/D.tsx": component("Ddd"), "src/components/forms/E.tsx": component("Eee"), "src/components/forms/F.tsx": component("Fff"),
  ...wideFiles("bulk"),
});

describe("another directory spends the scan's entry budget", () => {
  const answered = (): string => {
    const p = cappedApp();
    surface(p);
    // keep walking: the owner accepts an incomplete project map, so the scan stays truncated
    answerKind(p, "scan-budget", (k) => ({ choice: k.options.find((o) => o.id === "keep-all")!.id }));
    return p;
  };
  it("the chosen app's components are all in the output", () => {
    const p = answered();
    expect(scanProject(p).componentDirs.map((d) => d.path)).not.toContain("src/components"); // the premise: the scan never reached them
    const r = surface(p);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["components"].map((c: { name: string }) => c.name)).toEqual(["Aaa", "Bbb", "Ccc", "Ddd", "Eee", "Fff"]);
  });
  it("the truncation is stated in the JSON output and in the text", () => {
    const p = answered();
    const scan = envelope(surface(p).out).data!["unread"]["scan"];
    expect(scan.truncated).toBe(true);
    expect(scan.visited).toBe(4000);
    expect(scan.budget[0]).toMatchObject({ dir: "bulk" });
    expect(capture(["ds", "surface", "--cwd", p]).out).toContain("the project scan stopped at its entry cap (4000 entries visited)");
  });
  it("a scan that was not truncated says so and prints no line for it", () => {
    const p = projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": component("Aaa"), "src/components/B.tsx": component("Bbb"), "src/components/C.tsx": component("Ccc") });
    expect(envelope(surface(p).out).data!["unread"]["scan"]).toMatchObject({ truncated: false });
    expect(capture(["ds", "surface", "--cwd", p]).out).not.toContain("entry cap");
  });
  it("a write is not refused for it: the owner already answered the budget question", () => {
    const p = answered();
    expect(surface(p, "--out", "surface.json").code).toBe(0);
  });
});

describe("the scan and the surface share one component-directory rule", () => {
  it("name, ancestry, test trees and the three-file minimum agree on a tree that exercises each", () => {
    const code = (...dirs: string[]): Record<string, string> => Object.fromEntries(dirs.flatMap((d) => ["A", "B", "C"].map((n) => [`${d}/${n}.tsx`, component(`${n}x`)])));
    const files = {
      "package.json": pkg({ react: "18" }),
      ...code("src/components", "src/components/forms/deep", "src/ui", "src/widgets"),
      ...code("src/lib", "src/components/__tests__", "tests/components", "src/views/stories"),
      "src/components/two/A.tsx": component("Aa1"), "src/components/two/B.tsx": component("Bb1"),
    };
    const p = projectFrom(files);
    const surfaceDirs = componentDirsOf(Object.keys(files).filter((f) => f.endsWith(".tsx")));
    expect(surfaceDirs).toEqual(scanProject(p).componentDirs.map((d) => d.path).sort());
    expect(surfaceDirs).toContain("src/components/forms/deep");
    expect(surfaceDirs).not.toContain("src/components/__tests__");
    expect(surfaceDirs).not.toContain("src/components/two");
  });
  it("the embedded-app fixture yields the same directories either way", () => {
    expect(envelope(surface(fixtureCopy()).out).data!["components"]).toHaveLength(7);
  });
});
