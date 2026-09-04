import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_CONTEXT_SUITE } from "./helpers/product-context-fixtures.js";

type Json = Record<string, unknown>;

const fields = [
  "flow.entryPoints", "flow.screens", "flow.transitions", "productTruth.audienceSituation", "productTruth.availableProof",
  "productTruth.contentInventory", "productTruth.desiredChange", "productTruth.primaryAction", "productTruth.primaryOutcome", "productTruth.prohibitedClaims",
];
const scalarFields = ["productTruth.audienceSituation", "productTruth.desiredChange", "productTruth.primaryOutcome", "productTruth.primaryAction"];
const listFields = ["productTruth.availableProof", "productTruth.prohibitedClaims", "productTruth.contentInventory"];
const flowFields = ["flow.screens", "flow.transitions", "flow.entryPoints"];

function schema(name: string): Json {
  return JSON.parse(readFileSync(join(process.cwd(), "schemas", name), "utf8")) as Json;
}

function object(value: unknown): Json {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Json;
}

function definition(root: Json, name: string): Json {
  return object(object(root["definitions"])[name]);
}

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("keeps product-context schemas structurally strict at every nested contract", () => {
    const receiptSchema = schema("product-context-receipt.schema.json");
    const atlasSchema = schema("product-atlas.schema.json");
    const receipt = object(receiptSchema);
    expect(receipt["additionalProperties"]).toBe(false);
    expect((receipt["required"] as string[]).sort()).toEqual(["kind", "version", "receiptId", "productId", "sourceRef", "sourceDigest", "capturedAt", "captureDisposition", "omittedCount", "reasonCodes", "claims"].sort());
    const receiptProperties = object(receipt["properties"]);
    for (const key of ["receiptId", "productId", "sourceRef"]) expect(object(receiptProperties[key])["pattern"]).toBe("^[a-z0-9][a-z0-9._-]{0,127}$");
    expect(object(receiptProperties["sourceDigest"])["pattern"]).toBe("^sha256:[0-9a-f]{64}$");
    expect(object(receiptProperties["claims"])["maxItems"]).toBe(256);
    expect(object(receiptProperties["reasonCodes"])["maxItems"]).toBe(64);
    const claimSchema = definition(receipt, "claim");
    expect(claimSchema["additionalProperties"]).toBe(false);
    expect((claimSchema["required"] as string[]).sort()).toEqual(["claimId", "field", "required", "disposition", "value", "reason", "supersedes"].sort());
    expect(object(object(claimSchema["properties"])["field"])["enum"]).toEqual(fields);
    expect(object(object(claimSchema["properties"])["disposition"])["enum"]).toEqual(["present", "missing", "empty", "stale", "rejected", "malformed", "partial", "not-evaluated"]);
    expect(JSON.stringify(claimSchema["allOf"])).toContain("disposition");
    expect(JSON.stringify(receipt["allOf"])).toContain("captureDisposition");
    const atlas = object(atlasSchema);
    expect(atlas["additionalProperties"]).toBe(false);
    expect((atlas["required"] as string[]).sort()).toEqual(["kind", "version", "productId", "inputSetDigest", "receipts", "fields", "coverage"].sort());
    const atlasProperties = object(atlas["properties"]);
    expect(object(atlasProperties["productId"])["pattern"]).toBe("^[a-z0-9][a-z0-9._-]{0,127}$");
    expect(object(atlasProperties["inputSetDigest"])["pattern"]).toBe("^sha256:[0-9a-f]{64}$");
    const coverage = definition(atlas, "coverage");
    expect(coverage["additionalProperties"]).toBe(false);
  });

  it("binds every public value shape, Flow member, embedded record, counter, and resolution", () => {
    const receipt = schema("product-context-receipt.schema.json");
    const atlas = schema("product-atlas.schema.json");
    const claim = definition(receipt, "claim");
    const claimProperties = object(claim["properties"]);
    expect(object(claimProperties["reason"])["maxLength"]).toBe(500);
    expect(object(claimProperties["value"])["$comment"]).toContain("disposition");
    const typedValues = definition(receipt, "typedClaimValue");
    const typedBranches = typedValues["allOf"] as Json[];
    expect(typedBranches).toHaveLength(10);
    const branchFor = (field: string): Json => object(typedBranches.find((branch) => object(object(object(branch["if"])["properties"])["field"])["const"] === field));
    expect(typedBranches.map((branch) => object(object(object(branch["if"])["properties"])["field"])["const"]).sort()).toEqual([...fields].sort());
    for (const field of scalarFields) expect(JSON.stringify(branchFor(field))).toContain("productText");
    for (const field of listFields) expect(JSON.stringify(branchFor(field))).toContain("productTextList");
    for (const field of flowFields) expect(JSON.stringify(branchFor(field))).toContain(field === "flow.screens" ? "flowScreens" : field === "flow.transitions" ? "flowTransitions" : "flowEntryPoints");
    for (const name of ["screen", "transition", "entryPoint"]) expect(definition(receipt, name)["additionalProperties"]).toBe(false);
    expect(object(object(definition(receipt, "transition")["properties"])["trigger"])["enum"]).toEqual(["ON_CLICK", "ON_HOVER", "ON_PRESS", "AFTER_DELAY", "ON_KEY", "ON_SUBMIT"]);
    expect(object(object(definition(receipt, "screen")["properties"])["states"])["maxItems"]).toBe(64);

    const embeddedReceipt = definition(atlas, "embeddedReceipt");
    expect(embeddedReceipt["additionalProperties"]).toBe(false);
    expect(object(object(embeddedReceipt["properties"])["claims"])["items"]).toEqual({ $ref: "#/definitions/claim" });
    for (const field of fields) {
      const fieldDefinition = definition(atlas, `field-${field}`);
      expect(fieldDefinition["additionalProperties"]).toBe(false);
      expect(JSON.stringify(fieldDefinition)).toContain("resolution");
      const candidate = definition(atlas, `candidate-${field}`);
      expect(candidate["additionalProperties"]).toBe(false);
      expect(JSON.stringify(candidate)).toContain(`claim-${field}`);
    }
    const fieldItems = object(object(atlas["properties"])["fields"])["items"] as Json[];
    expect(fieldItems).toHaveLength(10);
    expect(fieldItems.map((item) => object(item)["$ref"])).toEqual(fields.map((field) => `#/definitions/field-${field}`));
    expect(object(object(atlas["properties"])["fields"])["additionalItems"]).toBe(false);
    const coverage = definition(atlas, "coverage");
    expect(definition(atlas, "counter")).toMatchObject({ type: "integer", minimum: 0, maximum: 9007199254740991 });
    for (const counter of ["captureDispositions", "claimDispositions", "candidateStatuses", "resolutions"]) {
      for (const value of Object.values(object(object(coverage["properties"])[counter])["properties"] as Json)) {
        expect(object(value)["$ref"]).toBe("#/definitions/counter");
      }
    }
    expect(object(object(coverage["properties"])["omittedCount"])["$ref"]).toBe("#/definitions/counter");
  });
});
