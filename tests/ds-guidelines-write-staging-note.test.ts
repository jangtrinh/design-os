/**
 * A failed export must say when it could not remove its own staging folder instead of dropping that
 * fact. Removing a folder cannot be made to fail through the CLI, so this unit test makes `rmSync`
 * throw for staging folders only (every other call is the real one).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    rmSync: (path: string, options?: Parameters<typeof real.rmSync>[1]): void => {
      if (String(path).includes(".figma-staging-")) throw new Error("EBUSY: staging folder is locked");
      real.rmSync(path, options);
    },
  };
});

import { cleanScratch, tempDir } from "./helpers/guidelines-harness.js";
import { writeBundleStaged } from "../src/commands/ds-guidelines-write.js";

afterEach(() => cleanScratch());

describe("writeBundleStaged keeps the staging-folder cleanup failure in the error", () => {
  it("appends the note to the error when the export fails and the staging folder cannot be removed", () => {
    const out = join(tempDir("ease-guidelines-write-"), "export");
    mkdirSync(join(out, "UPLOAD.md"), { recursive: true }); // UPLOAD.md cannot be written: it is a directory
    let message = "";
    try {
      writeBundleStaged(out, "figma-guidelines", [{ path: "a.md", content: "# a\n" }], "UPLOAD.md", "upload\n");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("EISDIR");
    expect(message).toMatch(/could not remove the staging folder '[^']*\.figma-staging-[^']*': EBUSY/);
  });
});
