import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseArgs } from "../src/core/cli-args.js";
import { runKnowledgeCheck } from "../src/commands/knowledge-check.js";

const root = resolve(import.meta.dirname, "..");
let temp = "";

function copyLedger(): void {
  const target = join(temp, "knowledge", "sources");
  mkdirSync(target, { recursive: true });
  cpSync(join(root, "knowledge", "sources", "mengto-web-techniques--202608.json"), join(target, "mengto-web-techniques--202608.json"));
  cpSync(join(root, "knowledge", "sources", "mengto-web-techniques--202608"), join(target, "mengto-web-techniques--202608"), { recursive: true });
}
function result() {
  const output = runKnowledgeCheck(parseArgs(["knowledge", "check", "--dir", temp, "--as-of", "202608", "--json"]));
  return JSON.parse(output.stdout ?? "") as { data: { findings: Array<{ checkId: string }> } };
}

beforeEach(() => { temp = mkdtempSync(join(tmpdir(), "knowledge-web-techniques-")); copyLedger(); });
afterEach(() => rmSync(temp, { recursive: true, force: true }));

describe("ui knowledge check — web-technique IO", () => {
  it("reads a production-style ledger and reports its missing Phase 3 catalog", () => {
    expect(result().data.findings.map((finding) => finding.checkId)).toContain("web-technique-catalog-missing");
  });
  it("turns an unparseable source manifest into an additive integrity finding", () => {
    writeFileSync(join(temp, "knowledge", "sources", "mengto-web-techniques--202608.json"), "{bad");
    expect(result().data.findings.map((finding) => finding.checkId)).toContain("source-ledger-invalid");
  });
  it("returns READ_ERROR when a tracked technique JSON path is unreadable", () => {
    rmSync(join(temp, "knowledge", "sources", "mengto-web-techniques--202608.json"));
    mkdirSync(join(temp, "knowledge", "sources", "mengto-web-techniques--202608.json"));
    const output = runKnowledgeCheck(parseArgs(["knowledge", "check", "--dir", temp, "--as-of", "202608", "--json"]));
    expect(JSON.parse(output.stdout ?? "").error.code).toBe("READ_ERROR");
  });
});
