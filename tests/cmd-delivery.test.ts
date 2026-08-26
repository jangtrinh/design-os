import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}
const fixture = (name: string): string => join(process.cwd(), "tests", "fixtures", "delivery", name);

describe("ui delivery validate", () => {
  for (const name of [
    "design-brief-valid.json",
    "generation-contract-valid.json",
    "qualification-valid.json",
    "generation-contract-v2-valid.json",
    "qualification-v2-valid.json",
    "learning-record-valid.json",
  ]) {
    it(`accepts ${name}`, () => {
      const r = capture(["delivery", "validate", fixture(name), "--json"]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.out).data.errorCount).toBe(0);
    });
  }
  it("blocks a false QUALIFIED verdict with evidence-backed findings", () => {
    const r = capture(["delivery", "validate", fixture("qualification-false-green.json"), "--json"]);
    expect(r.code).toBe(1);
    const data = JSON.parse(r.out).data as { findings: Array<{ checkId: string }> };
    expect(data.findings.filter((f) => f.checkId === "false-qualified").length).toBeGreaterThanOrEqual(4);
  });
  it("resolves a v2 contract and blocks missing craft evidence", () => {
    const r = capture(["delivery", "validate", fixture("qualification-v2-false-green.json"), "--json"]);
    expect(r.code).toBe(1);
    const ids = JSON.parse(r.out).data.findings.map((f: { checkId: string }) => f.checkId);
    expect(ids).toContain("false-qualified-v2");
    expect(ids).toContain("missing-control-evidence");
  });
  it("requires all canonical marketing viewports and gates", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-"));
    const contract = JSON.parse(String(requireFixture("generation-contract-valid.json"))) as Record<string, unknown>;
    contract["viewports"] = [1440, 390]; contract["requiredGates"] = ["taste-lint"];
    const file = join(dir, "contract.json"); writeFileSync(file, JSON.stringify(contract));
    const r = capture(["delivery", "validate", file, "--json"]);
    expect(r.code).toBe(1);
    const ids = JSON.parse(r.out).data.findings.map((f: { checkId: string }) => f.checkId);
    expect(ids).toContain("missing-viewport"); expect(ids).toContain("missing-gate");
  });
  it("rejects malformed JSON and unknown flags", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-"));
    const file = join(dir, "bad.json"); writeFileSync(file, "{bad");
    expect(JSON.parse(capture(["delivery", "validate", file, "--json"]).out).error.code).toBe("BAD_DELIVERY");
    expect(JSON.parse(capture(["delivery", "validate", fixture("design-brief-valid.json"), "--bogus", "--json"]).out).error.code).toBe("UNKNOWN_FLAG");
  });
  it("rejects malformed evidence even when status is only a draft", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-"));
    const draft = {
      kind: "qualification-record", version: 1, contractRef: "contract.json", attempt: 1,
      status: "DRAFT_WITH_CONCERNS", machineGates: "none", renderedViewports: ["mobile"],
      mustCriteria: [{}], unsupportedClaimCount: -1, unresolvedFindings: [42],
    };
    const file = join(dir, "draft.json"); writeFileSync(file, JSON.stringify(draft));
    const r = capture(["delivery", "validate", file, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.errorCount).toBeGreaterThanOrEqual(4);
  });

  it("accepts a v2 marketing brief only with a qualified generate activation", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-v2-brief-"));
    const activationRequest = join(process.cwd(), "tests", "fixtures", "capability-activation", "web-marketing-words.json");
    const activationRun = capture(["knowledge", "activate", activationRequest, "--json"]);
    expect(activationRun.code).toBe(0);
    writeFileSync(join(dir, "activation.json"), activationRun.out);
    const brief = JSON.parse(String(requireFixture("design-brief-valid.json"))) as Record<string, unknown>;
    brief["version"] = 2;
    brief["rawRequest"] = "Build a launch landing page for AgentTour";
    brief["activationRef"] = "activation.json";
    const file = join(dir, "brief.json"); writeFileSync(file, JSON.stringify(brief));
    const result = capture(["delivery", "validate", file, "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).data.errorCount).toBe(0);
  });

  it("rejects v2 briefs with missing, stale, or wrong-route activation", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-v2-drift-"));
    const request = join(process.cwd(), "tests", "fixtures", "capability-activation", "web-marketing-words.json");
    const activationRun = capture(["knowledge", "activate", request, "--json"]);
    const brief = JSON.parse(String(requireFixture("design-brief-valid.json"))) as Record<string, unknown>;
    brief["version"] = 2; brief["rawRequest"] = "Build a launch landing page for AgentTour";
    const missingFile = join(dir, "missing.json"); writeFileSync(missingFile, JSON.stringify(brief));
    expect(JSON.parse(capture(["delivery", "validate", missingFile, "--json"]).out).data.findings
      .map((finding: { checkId: string }) => finding.checkId)).toContain("missing-activation-ref");

    const envelope = JSON.parse(activationRun.out) as Record<string, unknown>;
    const data = envelope["data"] as Record<string, unknown>;
    data["catalogDigest"] = "sha256:" + "0".repeat(64); data["route"] = "redesign";
    writeFileSync(join(dir, "activation.json"), JSON.stringify(envelope));
    brief["activationRef"] = "activation.json";
    const driftFile = join(dir, "drift.json"); writeFileSync(driftFile, JSON.stringify(brief));
    const ids = JSON.parse(capture(["delivery", "validate", driftFile, "--json"]).out).data.findings
      .map((finding: { checkId: string }) => finding.checkId);
    expect(ids).toContain("activation-catalog-drift");
    expect(ids).toContain("activation-route-mismatch");

    writeFileSync(join(dir, "activation.json"), activationRun.out);
    brief["rawRequest"] = "Build a revised landing page for AgentTour";
    const requestDriftFile = join(dir, "request-drift.json");
    writeFileSync(requestDriftFile, JSON.stringify(brief));
    const requestDriftIds = JSON.parse(capture(["delivery", "validate", requestDriftFile, "--json"]).out).data.findings
      .map((finding: { checkId: string }) => finding.checkId);
    expect(requestDriftIds).toContain("activation-request-drift");
  });

  it("replays activation and rejects a hand-edited successful envelope", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-v2-forged-"));
    const request = join(process.cwd(), "tests", "fixtures", "capability-activation", "web-marketing-words.json");
    const envelope = JSON.parse(capture(["knowledge", "activate", request, "--json"]).out) as Record<string, unknown>;
    const data = envelope["data"] as Record<string, unknown>;
    data["selectedKnowledge"] = ["design-review"];
    writeFileSync(join(dir, "activation.json"), JSON.stringify(envelope));
    const brief = JSON.parse(String(requireFixture("design-brief-valid.json"))) as Record<string, unknown>;
    brief["version"] = 2;
    brief["rawRequest"] = "Build a launch landing page for AgentTour";
    brief["activationRef"] = "activation.json";
    const file = join(dir, "brief.json"); writeFileSync(file, JSON.stringify(brief));
    const result = capture(["delivery", "validate", file, "--json"]);
    expect(result.code).toBe(1);
    const ids = JSON.parse(result.out).data.findings.map((finding: { checkId: string }) => finding.checkId);
    expect(ids).toContain("activation-receipt-mismatch");
  });

  it("resolves activationRef beside the real brief when the brief path is a symlink", () => {
    const realDir = mkdtempSync(join(tmpdir(), "delivery-v2-real-"));
    const linkDir = mkdtempSync(join(tmpdir(), "delivery-v2-link-"));
    const request = join(process.cwd(), "tests", "fixtures", "capability-activation", "web-marketing-words.json");
    const activationRun = capture(["knowledge", "activate", request, "--json"]);
    writeFileSync(join(realDir, "activation.json"), activationRun.out);
    writeFileSync(join(linkDir, "activation.json"), "{}");
    const brief = JSON.parse(String(requireFixture("design-brief-valid.json"))) as Record<string, unknown>;
    brief["version"] = 2;
    brief["rawRequest"] = "Build a launch landing page for AgentTour";
    brief["activationRef"] = "activation.json";
    const realBrief = join(realDir, "brief.json"); writeFileSync(realBrief, JSON.stringify(brief));
    const linkedBrief = join(linkDir, "brief-link.json"); symlinkSync(realBrief, linkedBrief);
    const result = capture(["delivery", "validate", linkedBrief, "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).data.errorCount).toBe(0);
  });
});

function requireFixture(name: string): string {
  return readFileSync(fixture(name), "utf8");
}
