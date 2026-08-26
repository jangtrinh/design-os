import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("workflow capability activation", () => {
  it("routes surfaces before verbs and makes the HTML default conditional", () => {
    const routing = read("knowledge/need-routing.md");
    expect(routing).toContain("## Surface activation table");
    expect(routing).toContain("`native-macos`");
    expect(routing).toContain("CAPABILITY_UNQUALIFIED");
    expect(routing).toContain("explicit artifact platform");
    expect(routing).toContain("Every G4 production leg runs G-1");
    expect(routing).toContain("Do not run G-1 for G0, G1, G2, or capture-only G3 routes");
  });

  it("requires generate to activate and stop before compiling a brief", () => {
    const generate = read("templates/workflows/generate.md");
    const activation = generate.indexOf("ui knowledge activate");
    const brief = generate.indexOf("design-brief.json");
    expect(activation).toBeGreaterThan(-1);
    expect(activation).toBeLessThan(brief);
    expect(generate).toContain("CAPABILITY_UNQUALIFIED");
  });
});
