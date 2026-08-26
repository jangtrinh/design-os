/**
 * `ui knowledge check` — command-layer behaviour through the CLI seam. Each test
 * scaffolds a throwaway repo root with a knowledge/ tree in tmp, so the command's
 * own IO (walk + read) is exercised end-to-end against the pure linter.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { fullRouteTable } from "./fixtures/full-route-table.js";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { buildIndex, emitIndex } from "../src/core/knowledge-index-emit.js";
import { topLevelMarkdown } from "../src/core/knowledge-frontmatter-check.js";

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try { exitCode = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

interface Envelope { ok: boolean; data?: { findings: { checkId: string; severity: string }[]; errorCount: number; warningCount: number }; error?: { code: string } }
const parse = (s: string): Envelope => JSON.parse(s) as Envelope;
const checkIds = (r: { stdout: string }): string[] => (parse(r.stdout).data?.findings ?? []).map((f) => f.checkId);

let root: string;
const PILOT_RECEIPT = {
  kind: "design-os.capability-pilot-receipt",
  version: 1,
  capabilityId: "native-macos",
  pilotId: "native-macos-pilot-01",
  surfaceCategory: "note-document-editor",
  evidenceDisposition: "retained",
  ownerVerdict: "OK khá ổn rồi.",
  ownerDisposition: "accept-with-reservation",
};
const receiptBytes = (): string => `${JSON.stringify(PILOT_RECEIPT, null, 2)}\n`;
const sha256 = (bytes: string): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Write one file under the tmp repo root, creating parent dirs. */
function write(rel: string, content: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
}

/** Lay down a consistent knowledge/ core that passes every check. */
function scaffoldConsistent(): void {
  write("knowledge/README.md", [
    "# Knowledge",
    "",
    "## The files",
    "",
    "| File | Covers |",
    "|---|---|",
    "| `taste-rubric.md` | The taste model |",
    "| `persona-index.md` | Persona lookup |",
    "| `personas/<family>.md` | Persona DNA |",
    "| `benchmarks/*.dna.json` | Measured DNA |",
    "| `need-routing.md` | Need routing |",
    "| `capability-profiles.json` | Capability profiles |",
    "",
  ].join("\n"));
  write("knowledge/need-routing.md", fm("need-routing", "Need routing.", ["routing"]) + [
    "# Need routing", "", "## Surface activation table", "",
    "| Surface | Status | Candidate route |", "|---|---|---|",
    "| `web-marketing` | qualified | `generate` |", "",
    fullRouteTable(),
  ].join("\n"));
  write("knowledge/taste-rubric.md", fm("taste-rubric", "The taste model.", ["taste"]) + "# Taste\n");
  write("knowledge/persona-index.md", fm("persona-index", "Persona lookup.", ["persona"]) + [
    "# Persona Index", "", "## 1. Lookup Table", "",
    "| Slug | Family |", "|---|---|",
    "| `alpha-one` | family-a |", "",
  ].join("\n"));
  write("knowledge/personas/family-a.md", "# Family A\n\n## Alpha One\n\n- **Slug:** `alpha-one`\n- **Family:** family-a\n");
  write("knowledge/personas/personas.json", JSON.stringify([{ slug: "alpha-one", family: "family-a" }]));
  write("knowledge/benchmarks/stripe--202607.dna.json", "{}");
  write("knowledge/capability-profiles.json", JSON.stringify({
    version: 1,
    profiles: [{
      id: "web-marketing", status: "qualified", acceptedInputKinds: ["words"],
      workflow: "generate", artifact: "html", requiredKnowledge: ["need-routing"],
      machineWitnesses: ["gate"], renderedWitnesses: ["1440px"],
      manualWitnesses: ["owner-visible-acceptance"],
      qualificationEvidence: "knowledge/taste-rubric.md",
    }],
  }));
  emitIndexInto(root);
}


/** A routing front-matter block, the shape authoring-standard.md specifies. */
function fm(id: string, description: string, when: string[]): string {
  return `---\nid: ${id}\ndescription: "${description}"\nwhen: [${when.join(", ")}]\n---\n\n`;
}

/**
 * Compile knowledge/index.json from whatever the scaffold just wrote. Called after
 * the last write, and again by any case that rewrites a top-level file — an
 * out-of-date index is itself an error, so a case that skipped this would trip
 * index-drift instead of exercising its own check.
 */
function emitIndexInto(repoRoot: string): void {
  const dir = join(repoRoot, "knowledge");
  const md: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".md")) md[name] = readFileSync(join(dir, name), "utf8");
  }
  writeFileSync(join(dir, "index.json"), emitIndex(buildIndex(topLevelMarkdown(md))), "utf8");
}

function addNativePilot(options: { pin?: string; bytes?: string; writeReceipt?: boolean } = {}): string {
  const bytes = options.bytes ?? receiptBytes();
  const pin = options.pin ?? `knowledge/native-macos/pilot-01-evidence.json#${sha256(bytes)}`;
  if (options.writeReceipt !== false) write("knowledge/native-macos/pilot-01-evidence.json", bytes);
  const catalog = JSON.parse(readFileSync(join(root, "knowledge", "capability-profiles.json"), "utf8")) as {
    profiles: Array<Record<string, unknown>>;
  };
  catalog.profiles.push({
    id: "native-macos", status: "unqualified", acceptedInputKinds: ["words"], workflow: null,
    artifact: "native-macos-application", refusalCode: "CAPABILITY_UNQUALIFIED", action: "Stop.",
    qualificationRequirements: ["second held-out pilot"], qualificationEvidence: pin,
  });
  write("knowledge/capability-profiles.json", JSON.stringify(catalog));
  write("knowledge/need-routing.md", readFileSync(join(root, "knowledge", "need-routing.md"), "utf8").replace(
    "| `web-marketing` | qualified | `generate` |",
    "| `web-marketing` | qualified | `generate` |\n| `native-macos` | unqualified | none |",
  ));
  emitIndexInto(root);
  return pin;
}

function replaceNativePin(pin: string): void {
  const catalog = JSON.parse(readFileSync(join(root, "knowledge", "capability-profiles.json"), "utf8")) as {
    profiles: Array<Record<string, unknown>>;
  };
  const native = catalog.profiles.find((profile) => profile["id"] === "native-macos");
  if (native === undefined) throw new Error("native pilot profile missing from test scaffold");
  native["qualificationEvidence"] = pin;
  write("knowledge/capability-profiles.json", JSON.stringify(catalog));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ease-knowledge-"));
});

describe("ui knowledge check", () => {
  it("passes on a consistent core (exit 0, 0 findings)", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(parse(r.stdout).data?.errorCount).toBe(0);
  });

  it("index-missing-row: an unindexed knowledge md (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/orphan.md", "# Orphan\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("index-missing-row");
  });

  it("index-dead-row: a README row pointing at a missing file (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/README.md", [
      "# Knowledge", "", "## The files", "",
      "| File | Covers |", "|---|---|",
      "| `taste-rubric.md` | ok |",
      "| `persona-index.md` | ok |",
      "| `personas/<family>.md` | ok |",
      "| `benchmarks/*.dna.json` | ok |",
      "| `ghost.md` | dead |", "",
    ].join("\n"));
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("index-dead-row");
  });

  it("broken-xref: a relative link that does not resolve (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/taste-rubric.md", "# Taste\n\nSee [gone](./nope.md).\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("broken-xref");
  });

  it("benchmark-stale: a warning (exit 0) under a future --as-of", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202702", "--json"]);
    expect(r.exitCode).toBe(0);
    const env = parse(r.stdout);
    expect(env.data?.warningCount).toBe(1);
    expect(env.data?.findings[0]?.checkId).toBe("benchmark-stale");
  });

  it("provenance-bad-grammar: a marker missing ref= (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/taste-rubric.md", "# Taste\n\n<!-- ease:source captured=\"202607\" -->\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("provenance-bad-grammar");
  });

  it("provenance: accepts a well-formed marker whose ref resolves", () => {
    scaffoldConsistent();
    // Rewriting a top-level file drops its routing block, so restore it and
    // re-emit — otherwise this case reports front-matter drift, not provenance.
    write("knowledge/taste-rubric.md",
      fm("taste-rubric", "The taste model.", ["taste"]) +
      "# Taste\n\n<!-- ease:source ref=\"knowledge/benchmarks/stripe--202607.dna.json\" -->\n");
    emitIndexInto(root);
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(checkIds(r)).not.toContain("provenance-bad-grammar");
  });

  it("unknown-flag: rejected with UNKNOWN_FLAG", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--bogus", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(parse(r.stdout).error?.code).toBe("UNKNOWN_FLAG");
  });

  it("NO_KNOWLEDGE: no knowledge/ dir under --dir", () => {
    const r = capture(["knowledge", "check", "--dir", root, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(parse(r.stdout).error?.code).toBe("NO_KNOWLEDGE");
  });

  it("BAD_AS_OF: a non-YYYYMM --as-of", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "julyish", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(parse(r.stdout).error?.code).toBe("BAD_AS_OF");
  });

  it("validates a correctly pinned native pilot receipt", () => {
    scaffoldConsistent();
    addNativePilot();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(checkIds(r)).not.toContain("capability-pilot-receipt-invalid");
  });

  it.each(["mutated-bytes", "zeroed-digest", "malformed-pin", "traversal-pin"])(
    "rejects a %s receipt pin through the real knowledge check command",
    (caseName) => {
      scaffoldConsistent();
      addNativePilot();
      if (caseName === "mutated-bytes") {
        write("knowledge/native-macos/pilot-01-evidence.json", `${receiptBytes()}\n`);
      } else if (caseName === "zeroed-digest") {
        replaceNativePin(`knowledge/native-macos/pilot-01-evidence.json#${"sha256:" + "0".repeat(64)}`);
      } else if (caseName === "malformed-pin") {
        replaceNativePin("not-a-pilot-receipt-pin");
      } else {
        replaceNativePin(`knowledge/../outside.json#${"sha256:" + "0".repeat(64)}`);
      }
      const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
      expect(r.exitCode).toBe(1);
      expect(checkIds(r)).toContain("capability-pilot-receipt-invalid");
    },
  );

  it("rejects a missing native pilot pin through the real knowledge check command", () => {
    scaffoldConsistent();
    addNativePilot();
    const catalog = JSON.parse(readFileSync(join(root, "knowledge", "capability-profiles.json"), "utf8")) as {
      profiles: Array<Record<string, unknown>>;
    };
    const native = catalog.profiles.find((profile) => profile["id"] === "native-macos");
    if (native === undefined) throw new Error("native pilot profile missing from test scaffold");
    delete native["qualificationEvidence"];
    write("knowledge/capability-profiles.json", JSON.stringify(catalog));
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("capability-pilot-receipt-missing");
  });

  it("rejects a receipt symlink that resolves outside knowledge", () => {
    scaffoldConsistent();
    addNativePilot({ writeReceipt: false });
    const bytes = receiptBytes();
    write("outside.json", bytes);
    const receiptPath = join(root, "knowledge", "native-macos", "pilot-01-evidence.json");
    mkdirSync(dirname(receiptPath), { recursive: true });
    symlinkSync(join(root, "outside.json"), receiptPath);
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("capability-pilot-receipt-invalid");
  });

  it("rejects an unqualified capability with no registered pilot identity", () => {
    scaffoldConsistent();
    addNativePilot();
    const catalog = JSON.parse(readFileSync(join(root, "knowledge", "capability-profiles.json"), "utf8")) as {
      profiles: Array<Record<string, unknown>>;
    };
    const native = catalog.profiles.find((profile) => profile["id"] === "native-macos");
    if (native === undefined) throw new Error("native pilot profile missing from test scaffold");
    native["id"] = "unregistered-native";
    write("knowledge/capability-profiles.json", JSON.stringify(catalog));
    write("knowledge/need-routing.md", readFileSync(join(root, "knowledge", "need-routing.md"), "utf8")
      .replace("`native-macos`", "`unregistered-native`"));
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("capability-pilot-receipt-invalid");
  });
});
