import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { APPROVED_RUNTIME_DEPS } from "./approved-runtime-deps.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

describe("package.json", () => {
  it("ships only the runtime dependencies that were approved by name", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([...APPROVED_RUNTIME_DEPS]);
  });

  it("keeps the binary offline: no HTTP client among them", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const name of Object.keys(pkg.dependencies ?? {}))
      expect(name).not.toMatch(/axios|node-fetch|got|undici|superagent|request/);
  });
});
