import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAgainstSchema } from "../src/core/json-schema-subset.js";

describe("json-schema-subset", () => {
  it("enforces required, additionalProperties:false, enum and if/then with paths", () => {
    const schema = {
      type: "object", required: ["a"], additionalProperties: false,
      properties: { a: { enum: ["x", "y"] }, list: { type: "array", items: { type: "object", additionalProperties: false, properties: { k: { type: "string", minLength: 1 } } } } },
      if: { required: ["a"], properties: { a: { const: "x" } } }, then: { required: ["list"] },
    };
    expect(validateAgainstSchema({ a: "y" }, schema)).toEqual([]);
    expect(validateAgainstSchema({ a: "x" }, schema).map((f) => f.field)).toEqual(["list"]);
    expect(validateAgainstSchema({ a: "z", extra: 1, list: [{ k: "", other: 1 }] }, schema).map((f) => f.field).sort())
      .toEqual(["a", "extra", "list[0].k", "list[0].other"]);
    expect(validateAgainstSchema({}, schema).map((f) => f.field)).toEqual(["a"]);
  });
  it("throws on a keyword outside the subset instead of skipping it", () => {
    expect(() => validateAgainstSchema({}, { type: "object", oneOf: [] })).toThrow(/unsupported keyword 'oneOf'/);
  });
  it("every shipped design-brief keyword is inside the subset", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "design-brief.schema.json"), "utf8"));
    expect(() => validateAgainstSchema({}, schema)).not.toThrow();
  });
});
