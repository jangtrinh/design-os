/**
 * Fix round 2, section P: the Tailwind v4 entry of the chosen app comes from the surface's own walk, so a capped project
 * scan cannot hide it; and a registered component whose code is gone, or whose `<name> · code` is held by another door,
 * is named in the preview instead of staying silent or failing at `--apply`.
 */
import { describe, expect, it } from "vitest";
import { answerKind, envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";
import { wideFiles } from "./project-kinds-helpers.js";

const component = (n: string): string => `export const ${n} = () => <i />;\n`;

describe("the Tailwind v4 entry is found by the surface's own walk", () => {
  const capped = (): string => {
    const p = projectFrom({
      "package.json": pkg({ react: "18", tailwindcss: "4" }),
      "src/components/A.tsx": component("Aaa"), "src/components/B.tsx": component("Bbb"), "src/components/C.tsx": component("Ccc"),
      "src/styles/app.css": '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n',
      ...wideFiles("bulk"),
    });
    surface(p);
    answerKind(p, "scan-budget", (k) => ({ choice: k.options.find((o) => o.id === "keep-all")!.id }));
    return p;
  };
  it("a capped project scan does not hide the entry", () => {
    const d = envelope(surface(capped()).out).data!;
    expect(d["unread"]["scan"].truncated).toBe(true); // the premise
    expect(d["tailwindCss"]).toBe("src/styles/app.css");
  });
  it("an app without the tailwindcss dependency reports none", () => {
    const p = projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": component("Aaa"), "src/components/B.tsx": component("Bbb"), "src/components/C.tsx": component("Ccc"), "src/styles/app.css": '@import "tailwindcss";\n' });
    expect(envelope(surface(p).out).data!["tailwindCss"]).toBeUndefined();
  });
});
