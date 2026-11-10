/**
 * The one scan contract of both hosts (schemas/figma-ds-scan.schema.json). The kernel's own scan fixtures validate
 * against it, and each way a host can break it turns the check red. The plugin and Studio each run the same check
 * against a copy of the schema in their own repository.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FIXTURES = join(ROOT, "tests", "fixtures", "owner-rulings");
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, "schemas", "figma-ds-scan.schema.json"), "utf8")));
const load = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
const failures = (scan: unknown): string[] => (validate(scan) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.keyword}`));

describe("the kernel's scan fixtures conform to the scan schema", () => {
  for (const file of ["variables-five-collections.json", "components-eleven-pages.json", "control-single-collection-single-page.json", "scan-sensed-field-shape.json"]) {
    it(`${file} validates`, () => { expect(failures(load(file))).toEqual([]); });
  }
});

describe("a scan that breaks the contract is refused", () => {
  it("the breaking fixture fails on a missing id, a numeric id and a remote variable", () => {
    const found = failures(load("scan-breaks-schema.json")).join("\n");
    expect(found).toContain("/components/0 required");
    expect(found).toContain("/components/1/id type");
    expect(found).toContain("/tokens/0/remote const");
  });

  type Sensed = { components: Record<string, unknown>[]; tokens: Record<string, unknown>[]; frames: Record<string, unknown>[]; sensing: Record<string, unknown> };
  const sensed = (): Sensed => load("scan-sensed-field-shape.json") as unknown as Sensed;
  const cases: [string, (s: Sensed) => void, string][] = [
    ["a component id that is not a Figma node id", (s) => { s.components[0]!["id"] = "component-7"; }, "/components/0/id pattern"],
    ["a variable id that is not a Figma variable id", (s) => { s.tokens[0]!["id"] = 12; }, "/tokens/0/id type"],
    ["boundVariables that repeat an id", (s) => { s.components[0]!["boundVariables"] = ["VariableID:1:1", "VariableID:1:1"]; }, "/components/0/boundVariables uniqueItems"],
    ["an unresolvedInstances of 0 (written only above 0)", (s) => { s.components[2]!["unresolvedInstances"] = 0; }, "/components/2/unresolvedInstances minimum"],
    ["a frame without its page", (s) => { delete s.frames[0]!["page"]; }, "/frames/0 required"],
    ["a sensing status outside complete and skipped", (s) => { s.sensing["status"] = "partial"; }, "/sensing/status enum"],
    ["an instance that names its component by a host-internal name", (s) => { s.frames[0]!["instances"] = [{ component: "button", count: 1 }]; }, "/frames/0/instances/0/component pattern"],
  ];
  for (const [label, mutate, expected] of cases) {
    it(`red on ${label}`, () => {
      const scan = sensed();
      expect(failures(scan)).toEqual([]);
      mutate(scan);
      expect(failures(scan)).toContain(expected);
    });
  }
});
