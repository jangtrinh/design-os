import { describe, expect, it } from "vitest";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { forTerminal } from "../src/core/output.js";
import {
  asObject, canonicalText, claim, clone, compareFindingTriples, createProductContextHarness,
  exactKeys, findingTripleIdentity, PRODUCT_CONTEXT_SUITE, receipt, reverseNestedKeys,
  type Json,
} from "./helpers/product-context-fixtures.js";

const context = createProductContextHarness();
const { atlas, capture, compileOk, compileSemantic, compileText, json, lint, lintFailure, lintOk, write } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("canonicalizes argv order, object keys, Flow collections, and Flow state order", () => {
    const first = receipt({ receiptId: "receipt-b", claims: [claim("claim-b", "flow.screens", [{ id: "screen-b", states: ["state-b2", "state-b1"] }, { id: "screen-a", states: ["state-a2", "state-a1"] }])] });
    const second = receipt({ receiptId: "receipt-a", claims: [claim("claim-a", "flow.transitions", [{ id: "transition-b", from: "screen-b", to: "screen-a", trigger: "ON_CLICK" }, { id: "transition-a", from: "screen-a", to: "screen-b", trigger: "ON_CLICK" }])] });
    const third = receipt({ receiptId: "receipt-c", claims: [claim("claim-c", "flow.entryPoints", [{ id: "entry-b", screen: "screen-b" }, { id: "entry-a", screen: "screen-a" }])] });
    const forward = compileText([first, second, third]);
    const shuffledScreens = clone(first);
    asObject((shuffledScreens["claims"] as Json[])[0])["value"] = [{ id: "screen-a", states: ["state-a1", "state-a2"] }, { id: "screen-b", states: ["state-b1", "state-b2"] }];
    const shuffledTransitions = clone(second);
    asObject((shuffledTransitions["claims"] as Json[])[0])["value"] = [{ id: "transition-a", from: "screen-a", to: "screen-b", trigger: "ON_CLICK" }, { id: "transition-b", from: "screen-b", to: "screen-a", trigger: "ON_CLICK" }];
    const shuffledEntries = clone(third);
    asObject((shuffledEntries["claims"] as Json[])[0])["value"] = [{ id: "entry-a", screen: "screen-a" }, { id: "entry-b", screen: "screen-b" }];
    expect(compileText([clone(third), clone(second), clone(first)])).toBe(forward);
    expect(compileText([reverseNestedKeys(first) as Json, reverseNestedKeys(second) as Json, reverseNestedKeys(third) as Json])).toBe(forward);
    expect(compileText([shuffledScreens, second, third])).toBe(forward);
    expect(compileText([first, shuffledTransitions, third])).toBe(forward);
    expect(compileText([first, second, shuffledEntries])).toBe(forward);
  });

  it("canonicalizes claims and orders same-receipt field candidates by receipt and claim ID", () => {
    const ordered = receipt();
    const reversed = clone(ordered);
    (reversed["claims"] as Json[]).reverse();
    expect(compileText([reversed])).toBe(compileText([ordered]));
    const data = compileOk([receipt({ claims: [
      claim("claim-b", "productTruth.primaryOutcome", "outcome-001"),
      claim("claim-a", "productTruth.primaryOutcome", "outcome-001"),
    ] })]);
    const field = asObject((atlas(data)["fields"] as Json[]).find((item) => item["field"] === "productTruth.primaryOutcome"));
    expect((field["candidates"] as Json[]).map((candidate) => [
      candidate["receiptId"],
      asObject(candidate["claim"])["claimId"],
    ])).toEqual([
      ["receipt-001", "claim-a"],
      ["receipt-001", "claim-b"],
    ]);
  });

  it("uses deterministic total tie-breaks for duplicate Flow IDs while preserving ASCII ID order", () => {
    const forward = receipt({ claims: [
      claim("claim-001", "flow.screens", [{ id: "screen-a", name: "first" }, { id: "screen-a", name: "second" }, { id: "screen-z" }]),
      claim("claim-002", "flow.transitions", [{ id: "transition-a", from: "screen-a", to: "screen-z", trigger: "ON_CLICK" }, { id: "transition-a", from: "screen-z", to: "screen-a", trigger: "ON_PRESS" }, { id: "transition-z", from: "screen-z", to: "screen-a", trigger: "ON_CLICK" }]),
      claim("claim-003", "flow.entryPoints", [{ id: "entry-a", screen: "screen-a" }, { id: "entry-a", screen: "screen-z" }, { id: "entry-z", screen: "screen-z" }]),
    ] });
    const reversed = clone(forward);
    for (const claimValue of reversed["claims"] as Json[]) (asObject(claimValue)["value"] as Json[]).reverse();
    const forwardBytes = compileText([forward]);
    const reversedBytes = compileText([reversed]);
    expect(reversedBytes).toBe(forwardBytes);
    const normalized = canonicalText(forwardBytes);
    const embeddedClaims = asObject((normalized["receipts"] as Json[])[0])["claims"] as Json[];
    for (const field of ["flow.screens", "flow.transitions", "flow.entryPoints"]) {
      const members = asObject(embeddedClaims.find((claimValue) => claimValue["field"] === field))["value"] as Json[];
      expect(members.map((member) => String(member["id"]))).toEqual([...members.map((member) => String(member["id"]))].sort());
    }
  });

  it("retains ordinary product-content array order as a semantic digest input", () => {
    const first = receipt({ claims: [claim("claim-001", "productTruth.availableProof", ["proof-a", "proof-b"])] });
    const second = receipt({ claims: [claim("claim-001", "productTruth.availableProof", ["proof-b", "proof-a"])] });
    expect(compileText([first])).not.toBe(compileText([second]));
  });

  it("distinguishes isolated mutation from a fresh coordinated Atlas rewrite and trusted-digest comparison", () => {
    const receiptA = receipt();
    const receiptB = clone(receiptA);
    const audienceB = asObject((receiptB["claims"] as Json[]).find((item) => item["field"] === "productTruth.audienceSituation"));
    audienceB["value"] = "audience-002";
    const bytesA = compileText([receiptA]);
    const bytesB = compileText([receiptB]);
    const resultA = lintOk(write("atlas-a.json", bytesA));
    const resultB = lintOk(write("atlas-b.json", bytesB));
    const atlasA = atlas(resultA);
    const atlasB = atlas(resultB);
    const embeddedA = asObject((atlasA["receipts"] as Json[])[0]);
    const embeddedB = asObject((atlasB["receipts"] as Json[])[0]);
    const fieldA = asObject((atlasA["fields"] as Json[]).find((item) => item["field"] === "productTruth.audienceSituation"));
    const fieldB = asObject((atlasB["fields"] as Json[]).find((item) => item["field"] === "productTruth.audienceSituation"));
    const mutated = JSON.parse(bytesA) as Json;
    const receipts = mutated["receipts"] as Json[];
    const claims = asObject(receipts[0])["claims"] as Json[];
    const firstClaim = claims[0];
    expect(firstClaim).toBeDefined();
    firstClaim!["value"] = "audience-002";
    lintFailure(write("atlas-mutated.json", canonicalStringify(mutated)), "BAD_PRODUCT_ATLAS");
    expect(embeddedA["captureDisposition"]).toBe(embeddedB["captureDisposition"]);
    expect(embeddedA["claims"] as Json[]).toHaveLength(10);
    expect(embeddedB["claims"] as Json[]).toHaveLength(10);
    expect(embeddedB["receiptDigest"]).not.toBe(embeddedA["receiptDigest"]);
    expect(atlasB["inputSetDigest"]).not.toBe(atlasA["inputSetDigest"]);
    expect(fieldA["value"]).toBe("audience-001");
    expect(fieldB["value"]).toBe("audience-002");
    expect(asObject((fieldB["candidates"] as Json[])[0])["claim"]).toMatchObject({ value: "audience-002" });
    expect(atlasB["coverage"]).toEqual(atlasA["coverage"]);
    expect(resultB["findings"]).toEqual(resultA["findings"]);
    expect(resultB["errorCount"]).toBe(resultA["errorCount"]);
    expect(resultB["warningCount"]).toBe(resultA["warningCount"]);
    const trustedOldDigest = resultA["atlasDigest"];
    expect(resultB["atlasDigest"]).not.toBe(trustedOldDigest);
    expect(resultB["atlasDigest"] === trustedOldDigest).toBe(false);
  });

  it("lint returns semantic Atlas findings as ok:true data with exit 1", () => {
    const semanticAtlas = compileText([receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing" })] })], 1);
    const result = lint(write("semantic-atlas.json", semanticAtlas));
    expect(result).toMatchObject({ code: 1, err: "" });
    const resultJson = json(result, "semantic lint");
    expect(resultJson).toMatchObject({ ok: true, command: "product-context lint" });
    expect(asObject(resultJson.data)["atlas"]).toBeDefined();
  });

  it("keeps raw finding triples ordered, deduplicated, counted, and JSON-shaped", () => {
    const rawA = "raw\nfirst\r\u001bA";
    const rawB = "raw\nsecond\r\u001bB";
    const data = compileSemantic([receipt({ claims: [
      claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing", required: false, reason: rawA }),
      claim("claim-002", "productTruth.primaryAction", null, { disposition: "missing", required: false, reason: rawB }),
    ] })], 0);
    const findings = data["findings"] as Json[];
    for (const finding of findings) exactKeys(finding, ["checkId", "severity", "message"]);
    expect(findings).toEqual([...findings].sort(compareFindingTriples));
    expect(new Set(findings.map(findingTripleIdentity)).size).toBe(findings.length);
    expect(data["errorCount"]).toBe(findings.filter((item) => item["severity"] === "error").length);
    expect(data["warningCount"]).toBe(findings.filter((item) => item["severity"] === "warning").length);
    expect(findings.map((item) => String(item["message"]))).toEqual(expect.arrayContaining([
      expect.stringContaining(rawA),
      expect.stringContaining(rawB),
    ]));
  });

  it("keeps project-flow raw exact finding union distinct in JSON while text uses a sanitized copy", () => {
    const prefix = "x".repeat(130);
    const rawA = `${prefix}\nraw\r\u001bA`, rawB = `${prefix}\nraw\r\u001bB`;
    const source = receipt({ claims: [
      claim("claim-001", "flow.screens", [{ id: "home", terminal: true }]),
      claim("claim-002", "flow.transitions", [{ id: rawA, from: "home", to: "absent", trigger: "ON_CLICK" }, { id: rawB, from: "home", to: "absent", trigger: "ON_CLICK" }]),
      claim("claim-003", "flow.entryPoints", [{ id: "entry", screen: "home" }]),
    ] });
    const atlasBytes = compileText([source]);
    const projected = capture(["product-context", "project-flow", write("raw-project-flow.json", atlasBytes), "--json"]);
    expect(projected).toMatchObject({ code: 1, err: "" });
    const data = asObject(json(projected, "raw project-flow").data);
    const findings = data["findings"] as Json[];
    expect(findings).toEqual([...findings].sort(compareFindingTriples));
    const rawMessages = [rawA, rawB].map((marker) => String(findings.find((finding) => String(finding["message"]).includes(marker))?.["message"]));
    expect(rawMessages).toEqual(expect.arrayContaining([expect.stringContaining(rawA), expect.stringContaining(rawB)]));
    expect(data["errorCount"]).toBe(findings.filter((finding) => finding["severity"] === "error").length);
    expect(data["warningCount"]).toBe(findings.filter((finding) => finding["severity"] === "warning").length);
    const text = capture(["product-context", "project-flow", write("raw-project-flow-text.json", atlasBytes)]);
    expect(text).toMatchObject({ code: 1, out: "" });
    for (const message of rawMessages) expect(text.err).toContain(forTerminal(message));
    const lines = text.err.trimEnd().split("\n");
    expect(lines).toEqual(expect.arrayContaining([expect.stringMatching(/^error \[dangling-ref\] /), expect.stringMatching(/^warning \[context-not-evaluated\] /)]));
    expect(rawMessages.every((message) => !text.err.includes(message))).toBe(true);
    expect(text.err.split("\n").every((line) => ![...line].some((character) => character === "\r" || character.codePointAt(0) === 0x1b))).toBe(true);
  });
});
