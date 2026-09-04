import { describe, expect, it } from "vitest";
import {
  asObject, claim, createProductContextHarness, exactKeys, PRODUCT_CONTEXT_SUITE, receipt,
  type Json,
} from "./helpers/product-context-fixtures.js";

const context = createProductContextHarness();
const { atlas, capture, compileFailure, compileOk, compileSemantic, compileText, count, findingCodes, json, write } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("derives all candidate statuses and resolutions without choosing a conflict winner", () => {
    const first = receipt({ claims: [
      claim("claim-001", "productTruth.audienceSituation", "same-001"),
      claim("claim-002", "productTruth.desiredChange", "left-001"),
      claim("claim-003", "productTruth.primaryOutcome", null, { disposition: "missing" }),
      claim("claim-004", "productTruth.primaryAction", "action-001", { disposition: "stale" }),
      claim("claim-005", "productTruth.availableProof", null, { disposition: "missing" }),
    ] });
    const second = receipt({ receiptId: "receipt-002", claims: [
      claim("claim-006", "productTruth.audienceSituation", "same-001"),
      claim("claim-007", "productTruth.desiredChange", "right-001"),
      claim("claim-008", "productTruth.availableProof", ["proof-001"], { supersedes: ["receipt-001#claim-005"] }),
    ] });
    const data = compileSemantic([first, second], 1);
    const compiled = atlas(data);
    expect(count(compiled, "candidateStatuses")).toEqual({ selected: 1, coalesced: 2, superseded: 1, excluded: 2, conflicted: 2 });
    expect(count(compiled, "resolutions")).toEqual({ resolved: 2, missing: 1, unresolved: 6, conflicting: 1 });
    const fields = compiled["fields"] as Json[];
    expect(fields.map((item) => item["field"])).toEqual([...fields.map((item) => String(item["field"]))].sort());
    const conflict = asObject(fields.find((item) => item["field"] === "productTruth.desiredChange"));
    expect(conflict).toMatchObject({ field: "productTruth.desiredChange", resolution: "conflicting", value: null });
    expect(conflict["candidates"] as Json[]).toEqual([
      expect.objectContaining({ receiptId: "receipt-001", status: "conflicted", claim: expect.objectContaining({ claimId: "claim-002", value: "left-001" }) }),
      expect.objectContaining({ receiptId: "receipt-002", status: "conflicted", claim: expect.objectContaining({ claimId: "claim-007", value: "right-001" }) }),
    ]);
    const superseded = asObject(fields.find((item) => item["field"] === "productTruth.availableProof"));
    expect(superseded).toMatchObject({ field: "productTruth.availableProof", resolution: "resolved", value: ["proof-001"] });
    expect(superseded["candidates"] as Json[]).toEqual([
      expect.objectContaining({ receiptId: "receipt-001", status: "superseded", claim: expect.objectContaining({ disposition: "missing", value: null }) }),
      expect.objectContaining({ receiptId: "receipt-002", status: "selected", claim: expect.objectContaining({ disposition: "present", value: ["proof-001"] }) }),
    ]);
    expect(findingCodes(data)).toContain("atlas-conflict");
  });

  it("binds no-candidate, missing, mixed, selected, coalesced, conflicted, and excluded resolutions to exact fields", () => {
    const data = compileSemantic([receipt({ claims: [
      claim("claim-001", "productTruth.audienceSituation", "one-001"),
      claim("claim-002", "productTruth.desiredChange", null, { disposition: "missing" }),
      claim("claim-003", "productTruth.primaryOutcome", null, { disposition: "missing" }),
      claim("claim-004", "productTruth.primaryOutcome", null, { disposition: "empty" }),
      claim("claim-005", "productTruth.primaryAction", "same-001"),
      claim("claim-006", "productTruth.primaryAction", "same-001"),
      claim("claim-007", "productTruth.availableProof", ["left-001"]),
      claim("claim-008", "productTruth.availableProof", ["right-001"]),
      claim("claim-009", "productTruth.prohibitedClaims", ["stale-001"], { disposition: "stale" }),
    ] })], 1);
    const fields = atlas(data)["fields"] as Json[];
    const byField = (field: string) => asObject(fields.find((item) => item["field"] === field));
    expect(byField("flow.screens")).toMatchObject({ resolution: "unresolved", value: null, candidates: [] });
    expect(findingCodes(data)).toContain("context-not-evaluated");
    expect(byField("productTruth.desiredChange")).toMatchObject({ resolution: "missing", value: null });
    expect(byField("productTruth.primaryOutcome")).toMatchObject({ resolution: "unresolved", value: null });
    expect(byField("productTruth.audienceSituation")).toMatchObject({ resolution: "resolved", value: "one-001", candidates: [expect.objectContaining({ status: "selected" })] });
    expect(byField("productTruth.primaryAction")).toMatchObject({ resolution: "resolved", value: "same-001", candidates: [expect.objectContaining({ status: "coalesced" }), expect.objectContaining({ status: "coalesced" })] });
    expect(byField("productTruth.availableProof")).toMatchObject({ resolution: "conflicting", value: null, candidates: [expect.objectContaining({ status: "conflicted" }), expect.objectContaining({ status: "conflicted" })] });
    expect(byField("productTruth.prohibitedClaims")).toMatchObject({ resolution: "unresolved", value: null, candidates: [expect.objectContaining({ status: "excluded" })] });
  });

  it.each([
    ["required missing", "missing", null, true, "required-context-missing"],
    ["required partial", "partial", "outcome-001", true, "required-context-partial"],
    ["required not evaluated", "not-evaluated", null, true, "required-context-not-evaluated"],
    ["optional missing", "missing", null, false, "optional-context-gap"],
    ["optional partial", "partial", "outcome-001", false, "optional-context-gap"],
    ["optional not evaluated", "not-evaluated", null, false, "optional-context-gap"],
  ])("emits current gap finding: %s", (_label, disposition, value, required, code) => {
    const data = compileSemantic([receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", value, { disposition, required })] })], required ? 1 : 0);
    expect(findingCodes(data)).toContain(code);
  });

  it("suppresses a successfully superseded required gap while retaining its audit candidate", () => {
    const target = receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing" })] });
    const source = receipt({ receiptId: "receipt-002", claims: [claim("claim-002", "productTruth.primaryOutcome", "outcome-001", { supersedes: ["receipt-001#claim-001"] })] });
    const data = compileOk([target, source]);
    const field = asObject((atlas(data)["fields"] as Json[]).find((item) => item["field"] === "productTruth.primaryOutcome"));
    expect(findingCodes(data)).not.toContain("required-context-missing");
    expect(field["candidates"] as Json[]).toEqual(expect.arrayContaining([expect.objectContaining({ receiptId: "receipt-001", status: "superseded", claim: expect.objectContaining({ disposition: "missing", value: null }) })]));
  });

  it.each([
    ["missing", null, "required-context-missing"],
    ["partial", "outcome-001", "required-context-partial"],
    ["not-evaluated", null, "required-context-not-evaluated"],
  ])("suppresses successfully superseded required %s only", (disposition, value, code) => {
    const target = receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", value, { disposition })] });
    const source = receipt({ receiptId: "receipt-002", claims: [claim("claim-002", "productTruth.primaryOutcome", "outcome-001", { supersedes: ["receipt-001#claim-001"] })] });
    const data = compileOk([target, source]);
    expect(findingCodes(data)).not.toContain(code);
  });

  it.each([
    ["missing", null],
    ["partial", "outcome-001"],
    ["not-evaluated", null],
  ])("suppresses successfully superseded optional %s while retaining the audit candidate", (disposition, value) => {
    const target = receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", value, { disposition, required: false })] });
    const source = receipt({ receiptId: "receipt-002", claims: [claim("claim-002", "productTruth.primaryOutcome", "outcome-001", { supersedes: ["receipt-001#claim-001"] })] });
    const data = compileOk([target, source]);
    const field = asObject((atlas(data)["fields"] as Json[]).find((item) => item["field"] === "productTruth.primaryOutcome"));
    expect(findingCodes(data)).not.toContain("optional-context-gap");
    expect(field["candidates"] as Json[]).toEqual(expect.arrayContaining([expect.objectContaining({ status: "superseded", claim: expect.objectContaining({ disposition, required: false, value }) })]));
  });

  it.each([
    ["non-present superseder", "stale"],
    ["non-present missing superseder", "missing"],
  ])("rejects ineligible superseder: %s", (_label, disposition) => {
    const target = receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing" })] });
    const source = receipt({ receiptId: "receipt-002", claims: [claim("claim-002", "productTruth.primaryOutcome", disposition === "stale" ? "outcome-001" : null, { disposition, supersedes: ["receipt-001#claim-001"] })] });
    compileFailure([target, source], "BAD_PRODUCT_CONTEXT");
  });

  it.each([
    ["product mismatch", () => [receipt(), receipt({ receiptId: "receipt-002", productId: "product-002" })], "PRODUCT_ID_MISMATCH"],
    ["duplicate receipt id", () => [receipt(), receipt()], "BAD_PRODUCT_CONTEXT"],
    ["dangling reference", () => [receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", "outcome-001", { supersedes: ["receipt-002#claim-002"] })] })], "BAD_PRODUCT_CONTEXT"],
    ["self reference", () => [receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", "outcome-001", { supersedes: ["receipt-001#claim-001"] })] })], "BAD_PRODUCT_CONTEXT"],
    ["cross source", () => [receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing" })] }), receipt({ receiptId: "receipt-002", sourceRef: "source-002", claims: [claim("claim-002", "productTruth.primaryOutcome", "outcome-001", { supersedes: ["receipt-001#claim-001"] })] })], "BAD_PRODUCT_CONTEXT"],
    ["cross field", () => [receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing" })] }), receipt({ receiptId: "receipt-002", claims: [claim("claim-002", "productTruth.primaryAction", "action-001", { supersedes: ["receipt-001#claim-001"] })] })], "BAD_PRODUCT_CONTEXT"],
    ["cycle", () => [receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", "one-001", { supersedes: ["receipt-002#claim-002"] })] }), receipt({ receiptId: "receipt-002", claims: [claim("claim-002", "productTruth.primaryOutcome", "two-001", { supersedes: ["receipt-001#claim-001"] })] })], "BAD_PRODUCT_CONTEXT"],
  ])("rejects containment or supersession attack: %s", (_label, makeReceipts, code) => { compileFailure(makeReceipts(), code); });

  it.each([
    ["dangling reference", [{ id: "home", terminal: true }], [{ id: "bad", from: "home", to: "absent", trigger: "ON_CLICK" }], [{ id: "entry", screen: "home" }], "dangling-ref"],
    ["no entry", [{ id: "home", terminal: true }], [], [], "no-entry"],
    ["dead end", [{ id: "home" }], [], [{ id: "entry", screen: "home" }], "dead-end"],
    ["duplicate screen", [{ id: "home", terminal: true }, { id: "home", terminal: true }], [], [{ id: "entry", screen: "home" }], "flow-projection-invalid"],
    ["duplicate transition", [{ id: "home", terminal: true }], [{ id: "same", from: "home", to: "home", trigger: "ON_CLICK" }, { id: "same", from: "home", to: "home", trigger: "ON_CLICK" }], [{ id: "entry", screen: "home" }], "flow-projection-invalid"],
  ])("blocks schema-valid project-flow %s", (_label, screens, transitions, entryPoints, checkId) => {
    const atlas = compileText([receipt({ claims: [claim("claim-001", "flow.screens", screens), claim("claim-002", "flow.transitions", transitions), claim("claim-003", "flow.entryPoints", entryPoints)] })]);
    const result = capture(["product-context", "project-flow", write(`${checkId}.json`, atlas), "--json"]);
    expect(result).toMatchObject({ code: 1, err: "" });
    const envelope = json(result, `${checkId} project-flow`);
    exactKeys(asObject(envelope), ["ok", "command", "data"]);
    const data = asObject(envelope.data);
    exactKeys(data, ["kind", "version", "status", "productId", "atlasDigest", "truthStatus", "flow", "findings", "errorCount", "warningCount"]);
    expect(envelope).toMatchObject({ ok: true, command: "product-context project-flow" });
    expect(data).toMatchObject({ status: "blocked", flow: null, findings: expect.arrayContaining([expect.objectContaining({ checkId, severity: "error" })]) });
  });
});
