import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

const fixture = (name: string): string =>
  `${process.cwd()}/tests/fixtures/capability-activation/${name}.json`;

describe("ui knowledge activate", () => {
  it("refuses native macOS with route:null and an actionable machine envelope", () => {
    const result = capture(["knowledge", "activate", fixture("native-macos-words"), "--json"]);
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.out);
    expect(envelope.error.code).toBe("CAPABILITY_UNQUALIFIED");
    expect(envelope.data.route).toBeNull();
    expect(envelope.data.action).toContain("Do not run generate");
  });

  it.each(["web-marketing-words", "marketing-for-native-app"])(
    "qualifies %s as marketing HTML",
    (name) => {
      const result = capture(["knowledge", "activate", fixture(name), "--json"]);
      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.out);
      expect(envelope.data.disposition).toBe("QUALIFIED");
      expect(envelope.data.route).toBe("generate");
      expect(envelope.data.artifact).toBe("html");
      expect(envelope.data.requestDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(envelope.data.catalogDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    },
  );

  it("rejects an unknown surface with the supported profile list", () => {
    const result = capture(["knowledge", "activate", fixture("web-marketing-words"), "--json"]);
    const request = JSON.parse(readFileSync(fixture("web-marketing-words"), "utf8"));
    request.requestedSurface = "native-ios";
    const dir = mkdtempSync(join(tmpdir(), "activate-"));
    const file = join(dir, "request.json"); writeFileSync(file, JSON.stringify(request));
    const unknown = capture(["knowledge", "activate", file, "--json"]);
    expect(result.code).toBe(0);
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.out).error.code).toBe("UNKNOWN_CAPABILITY");
    expect(JSON.parse(unknown.out).data.supportedProfiles).toContain("native-macos");
  });
});
