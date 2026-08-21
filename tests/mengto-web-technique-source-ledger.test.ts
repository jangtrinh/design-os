import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const generate = join(root, "scripts/generate-mengto-web-technique-ledger.mjs");
const check = join(root, "scripts/check-mengto-web-technique-source.mjs");
let tmp = "";
let corpus = "";
let revision = "";
let decisions = "";
let ledger = "";

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function args(withDecisions = false) {
  const base = ["--corpus", corpus, "--revision", revision, "--ledger", ledger];
  return withDecisions ? [...base, "--decisions", decisions] : base;
}

function write(path: string, value: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function initFixture() {
  corpus = join(tmp, "corpus");
  execFileSync("git", ["init", "-q", corpus]);
  execFileSync("git", ["-C", corpus, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", corpus, "config", "user.email", "fixture@example.test"]);
  const base = join(corpus, "agent-skills/web-design");
  write(join(corpus, "LICENSE"), "MIT fixture license\n");
  write(join(base, "README.md"), "fixture\n");
  write(join(base, "core-one/SKILL.md"), "core\n");
  write(join(base, "core-one/references/guide.md"), "guide\n");
  write(join(base, "core-one/references/guide-copy.md"), "guide\n");
  write(join(base, "core-one/references/THREE-LICENSE.txt"), "third-party license\n");
  write(join(base, "core-one/agents/openai.yaml"), "interface: fixture\n");
  write(join(base, "style-one/SKILL.md"), "style\n");
  write(join(base, "style-one/demo/index.html"), "<main>fixture</main>\n");
  write(join(base, "style-one/demo/PROMPT.md"), "neuform prompt\n");
  write(join(base, "style-one/demo/source.json"), "{\"provider\":\"Neuform\"}\n");
  write(join(base, "vendor-one/SKILL.md"), "vendor\n");
  write(join(base, "vendor-one/demo/vendor.min.js"), "minified-fixture\n");
  write(join(base, "composite-one/SKILL.md"), "composite\n");
  write(join(base, "composite-one/demo/asset.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  execFileSync("git", ["-C", corpus, "add", "."]);
  execFileSync("git", ["-C", corpus, "commit", "-qm", "fixture"]);
  revision = execFileSync("git", ["-C", corpus, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  ledger = join(tmp, "out/mengto.json");
  decisions = join(tmp, "out/mengto/skills.json");
  const licenseBytes = readFileSync(join(corpus, "LICENSE"));
  const licenseLine = execFileSync("git", ["-C", corpus, "ls-tree", "-l", revision, "--", "LICENSE"], { encoding: "utf8" }).trim();
  const licenseMetadata = licenseLine.split("\t")[0] ?? "";
  const [licenseMode, , licenseObjectId, licenseByteCount] = licenseMetadata.split(/\s+/);
  write(decisions, `${JSON.stringify({
    schemaVersion: 1,
    upstream: {
      repository: "https://example.test/source.git",
      revision,
      capturedAt: "2026-08-21T00:27:35Z",
      rootLicense: "MIT",
      rootLicenseEvidence: {
        path: "LICENSE", mode: licenseMode, gitObjectId: licenseObjectId,
        byteCount: Number(licenseByteCount), sha256: createHash("sha256").update(licenseBytes).digest("hex"),
      },
    },
    expected: {
      skillRecordCount: 4,
      categoryCounts: { core: 1, style: 1, vendor: 1, composite: 1 },
      dispositionCounts: { adopted: 2, "covered-existing": 1, rejected: 1 },
    },
    skills: [
      { skill: "core-one", category: "core", disposition: "adopted", reason: "Reusable mechanism", techniqueIds: ["MOT-01"], existingKnowledgeRefs: [] },
      { skill: "style-one", category: "style", disposition: "covered-existing", reason: "Existing owner", techniqueIds: [], existingKnowledgeRefs: ["knowledge/page-structures.md"] },
      { skill: "vendor-one", category: "vendor", disposition: "rejected", reason: "Vendor wrapper", techniqueIds: [], existingKnowledgeRefs: [] },
      { skill: "composite-one", category: "composite", disposition: "adopted", reason: "Reusable system contract", techniqueIds: ["SYS-01"], existingKnowledgeRefs: [] },
    ],
  }, null, 2)}\n`);
}

beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "mengto-ledger-")); initFixture(); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("MengTo pinned source ledger", () => {
  it("generates and verifies an exact offline ledger", () => {
    expect(run(generate, args(false)).status).toBe(0);
    const result = run(check, args());
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(ledger, "utf8"));
    const records = JSON.parse(readFileSync(join(dirname(ledger), manifest.parts[0].path), "utf8")).records;
    expect(manifest.skillRecordCount).toBe(4);
    expect(manifest.duplicateBlobGroups).toEqual([
      {
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        paths: [
          "agent-skills/web-design/core-one/references/guide-copy.md",
          "agent-skills/web-design/core-one/references/guide.md",
        ],
      },
    ]);
    expect(records.map((record: { path: string }) => record.path)).toEqual(
      [...records].map((record: { path: string }) => record.path).sort(),
    );
    expect(records.find((record: { path: string }) => record.path.endsWith("asset.png"))).toMatchObject({
      inspectionStatus: "not-inspected", adoptability: "not-adoptable",
      legalDisposition: "metadata-only-quarantine",
    });
    expect(records.find((record: { path: string }) => record.path.endsWith("THREE-LICENSE.txt"))).toMatchObject({
      artifactClass: "license-notice", adoptability: "not-adoptable",
      licenseEvidence: "embedded-license-notice", legalDisposition: "license-evidence-only",
    });
    expect(records.find((record: { path: string }) => record.path.endsWith("openai.yaml"))).toMatchObject({
      artifactClass: "agent-yaml", adoptability: "not-adoptable",
      legalDisposition: "metadata-only-quarantine",
    });
    expect(records.find((record: { path: string }) => record.path.endsWith("style-one/demo/PROMPT.md"))).toMatchObject({
      provenance: "neuform-synchronized", inspectionStatus: "not-inspected",
      adoptability: "not-adoptable", licenseEvidence: "license-unverified-quarantine",
    });
  });

  it.each([
    ["bad revision", () => { revision = "0".repeat(40); }, "revision"],
    ["malformed decisions", () => write(decisions, "{}\n"), "decisions"],
  ])("rejects %s", (_name, mutate, message) => {
    mutate();
    const result = run(generate, args(true));
    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toContain(message);
  });

  it.each(["missing-record", "mutated-sha", "semantic-field", "unsorted", "bad-part-hash", "bad-count"])(
    "rejects %s ledger mutation",
    (mutation) => {
      expect(run(generate, args(true)).status).toBe(0);
      const manifest = JSON.parse(readFileSync(ledger, "utf8"));
      const partPath = join(dirname(ledger), manifest.parts[0].path);
      const treePart = JSON.parse(readFileSync(partPath, "utf8"));
      const records = treePart.records;
      if (mutation === "missing-record") records.pop();
      if (mutation === "mutated-sha") records.find((record: { objectType: string }) => record.objectType === "blob").sha256 = "0".repeat(64);
      if (mutation === "semantic-field") {
        const binary = records.find((record: { artifactClass: string }) => record.artifactClass === "binary-asset");
        binary.inspectionStatus = "statically-inspected";
        binary.adoptability = "idea-only";
        binary.legalDisposition = "idea-only-independent-rewrite";
      }
      if (mutation === "unsorted") [records[0], records[1]] = [records[1], records[0]];
      if (["missing-record", "mutated-sha", "semantic-field", "unsorted"].includes(mutation)) {
        write(partPath, `${JSON.stringify({ ...treePart, records }, null, 2)}\n`);
        manifest.parts[0].sha256 = execFileSync("shasum", ["-a", "256", partPath], { encoding: "utf8" }).split(" ")[0];
      }
      if (mutation === "bad-part-hash") manifest.parts[0].sha256 = "f".repeat(64);
      if (mutation === "bad-count") manifest.parts[0].recordCount += 1;
      write(ledger, `${JSON.stringify(manifest, null, 2)}\n`);
      expect(run(check, args()).status).not.toBe(0);
    },
  );

  it("rejects a self-consistent ledger with a missing skill decision", () => {
    expect(run(generate, args(true)).status).toBe(0);
    const manifest = JSON.parse(readFileSync(ledger, "utf8"));
    const skillsPart = manifest.parts.find((part: { kind: string }) => part.kind === "skills");
    const skillsPath = join(dirname(ledger), skillsPart.path);
    const value = JSON.parse(readFileSync(skillsPath, "utf8"));
    const removed = value.skills.pop();
    value.expected.skillRecordCount -= 1;
    value.expected.categoryCounts[removed.category] -= 1;
    value.expected.dispositionCounts[removed.disposition] -= 1;
    write(skillsPath, `${JSON.stringify(value, null, 2)}\n`);
    skillsPart.recordCount -= 1;
    skillsPart.sha256 = execFileSync("shasum", ["-a", "256", skillsPath], { encoding: "utf8" }).split(" ")[0];
    manifest.skillRecordCount -= 1;
    manifest.categoryCounts[removed.category] -= 1;
    manifest.dispositionCounts[removed.disposition] -= 1;
    write(ledger, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(run(check, args()).status).not.toBe(0);
  });

  it("rejects root-manifest provenance drift", () => {
    expect(run(generate, args(true)).status).toBe(0);
    const manifest = JSON.parse(readFileSync(ledger, "utf8"));
    manifest.upstream = { ...manifest.upstream, rootLicense: "UNVERIFIED" };
    delete manifest.upstream.capturedAt;
    delete manifest.upstream.rootLicenseEvidence;
    write(ledger, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(run(check, args()).status).not.toBe(0);
  });
});
