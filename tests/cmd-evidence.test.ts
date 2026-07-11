/**
 * `ui evidence` — E2E via run(). Mirrors tests/cmd-critique-coverage.test.ts's
 * stdout/stderr capture + temp-dir pattern. Drives add/list/verify/show and
 * asserts the anti-fabrication gate (QUOTE_MISMATCH/QUOTE_TOO_SHORT) plus the
 * central UNKNOWN_FLAG guard.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

let dir: string;
let store: string;
let sourceFilePath: string;
const SOURCE_TEXT = "the checkout button was impossible to find during the usability session";
const QUOTE = "checkout button was impossible to find";

const jsonCode = (args: string[]): { code: number; envelope: { ok: boolean; data?: unknown; error?: { code: string; message: string } } } => {
  const r = capture([...args, "--json"]);
  return { code: r.code, envelope: JSON.parse(r.out) as { ok: boolean; data?: unknown; error?: { code: string; message: string } } };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-cmd-evid-"));
  store = join(dir, "store");
  sourceFilePath = join(dir, "interview1.txt");
  writeFileSync(sourceFilePath, SOURCE_TEXT, "utf8");
});

describe("evidence add", () => {
  it("kind=quote with a verbatim quote → exit 0, prints an id", () => {
    const r = capture(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("ev1");
  });

  it("--json support is 'quoted'", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    expect(code).toBe(0);
    expect((envelope.data as { support: string }).support).toBe("quoted");
  });

  it("a FABRICATED quote (not in source) → exit 1, QUOTE_MISMATCH", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", "this text never appeared in the transcript at all", "--source", sourceFilePath]);
    expect(code).toBe(1);
    expect(envelope.error?.code).toBe("QUOTE_MISMATCH");
  });

  it("a --quote too short to verify → QUOTE_TOO_SHORT", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", "short"]);
    expect(code).toBe(1);
    expect(envelope.error?.code).toBe("QUOTE_TOO_SHORT");
  });

  it("--kind observation with just a finding → exit 0, support 'unsupported'", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--kind", "observation", "--finding", "users seemed lost during onboarding"]);
    expect(code).toBe(0);
    expect((envelope.data as { support: string }).support).toBe("unsupported");
  });

  it("--kind metric with --metric + --unit + --source → exit 0, support 'metric'", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--kind", "metric", "--finding", "signup drop-off", "--metric", "42", "--unit", "%", "--source", sourceFilePath]);
    expect(code).toBe(0);
    expect((envelope.data as { support: string }).support).toBe("metric");
  });

  it("--kind metric with no --metric → BAD_ARG", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--kind", "metric", "--finding", "signup drop-off", "--source", sourceFilePath]);
    expect(code).toBe(1);
    expect(envelope.error?.code).toBe("BAD_ARG");
  });
});

describe("evidence list", () => {
  it("lists recorded findings; --json count matches", () => {
    capture(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    capture(["evidence", "add", "--dir", store, "--kind", "observation", "--finding", "users seemed lost"]);

    const textResult = capture(["evidence", "list", "--dir", store]);
    expect(textResult.code).toBe(0);
    expect(textResult.out).toContain("ev1");
    expect(textResult.out).toContain("ev2");

    const { code, envelope } = jsonCode(["evidence", "list", "--dir", store]);
    expect(code).toBe(0);
    expect((envelope.data as { count: number }).count).toBe(2);
  });
});

describe("evidence verify", () => {
  it("all-intact → exit 0", () => {
    capture(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    const r = capture(["evidence", "verify", "--dir", store]);
    expect(r.code).toBe(0);
  });

  it("a corrupted stored source → exit 1, that id's verify fails", () => {
    const { envelope: addEnvelope } = jsonCode(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    const id = (addEnvelope.data as { id: string }).id;

    // Corrupt the store's own copy of the source (not the original file) so the quote no longer matches.
    writeFileSync(join(store, "research-sources", "interview1.txt"), "an entirely unrelated transcript body", "utf8");

    const { code, envelope } = jsonCode(["evidence", "verify", "--dir", store]);
    expect(code).toBe(1);
    const results = (envelope.data as { results: { id: string; ok: boolean }[] }).results;
    const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
    expect(failedIds).toContain(id);
  });
});

describe("evidence show", () => {
  it("shows a finding by id", () => {
    capture(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    const r = capture(["evidence", "show", "ev1", "--dir", store]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("ev1");
    expect(r.out).toContain("checkout is confusing");
  });

  it("an unknown id → NOT_FOUND", () => {
    capture(["evidence", "add", "--dir", store, "--finding", "checkout is confusing", "--quote", QUOTE, "--source", sourceFilePath]);
    const { code, envelope } = jsonCode(["evidence", "show", "ev404", "--dir", store]);
    expect(code).toBe(1);
    expect(envelope.error?.code).toBe("NOT_FOUND");
  });
});

describe("evidence — dispatch errors", () => {
  it("no subcommand → BAD_ARG", () => {
    const { code, envelope } = jsonCode(["evidence"]);
    expect(code).toBe(1);
    expect(envelope.error?.code).toBe("BAD_ARG");
  });

  it("unknown flag → UNKNOWN_FLAG (central flag guard)", () => {
    const { code, envelope } = jsonCode(["evidence", "add", "--dir", store, "--finding", "x", "--kind", "observation", "--not-a-real-flag"]);
    expect(code).toBe(1);
    expect(envelope.error?.code).toBe("UNKNOWN_FLAG");
  });
});
