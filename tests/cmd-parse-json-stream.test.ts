import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { run } from "../src/cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);

function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

describe("ui parse-json-stream", () => {
  it("text mode prints 2 NDJSON lines for a 2-object file", () => {
    const { code, out } = captureRun(["parse-json-stream", fix("stream/stream-2.txt")]);
    expect(code).toBe(0);
    const lines = out.trim().split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    // Each line must be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("stderr summary reports parsed count and trailing bytes", () => {
    const { err } = captureRun(["parse-json-stream", fix("stream/stream-2.txt")]);
    expect(err).toMatch(/parsed 2 objects/);
  });

  it("--json envelope has count:2, objects array, remainder", () => {
    const { code, out } = captureRun(["parse-json-stream", fix("stream/stream-2.txt"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { count: number; objects: unknown[]; remainder: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.count).toBe(2);
    expect(json.data.objects).toHaveLength(2);
    expect(typeof json.data.remainder).toBe("string");
  });

  it("partial trailing object appears in remainder with count:1", () => {
    const { code, out } = captureRun(["parse-json-stream", fix("stream/stream-partial.txt"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { data: { count: number; remainder: string } };
    expect(json.data.count).toBe(1);
    expect(json.data.remainder.length).toBeGreaterThan(0);
  });

  it("--strict on incomplete stream → exit 1, INCOMPLETE_STREAM", () => {
    const { code, out } = captureRun(["parse-json-stream", fix("stream/stream-partial.txt"), "--strict", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("INCOMPLETE_STREAM");
  });

  it("--strict on complete stream → exit 0", () => {
    const { code } = captureRun(["parse-json-stream", fix("stream/stream-2.txt"), "--strict"]);
    expect(code).toBe(0);
  });

  it("missing argument → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["parse-json-stream", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("nonexistent file → exit 1, FILE_NOT_FOUND", () => {
    const { code, out } = captureRun(["parse-json-stream", "/no/such.txt", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("--help exits 0", () => {
    const { code } = captureRun(["parse-json-stream", "--help"]);
    expect(code).toBe(0);
  });
});
