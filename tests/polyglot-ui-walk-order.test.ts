/**
 * The walk must list files in code-unit order whatever order the filesystem hands them back
 * (APFS returns names sorted, ext4 does not), so a report is the same on every machine.
 * The real `readdirSync` is wrapped to return each directory REVERSED, which no sorted
 * filesystem would ever do by itself.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, readdirSync: ((p: string) => [...real.readdirSync(p)].reverse()) as typeof real.readdirSync };
});

import { walkUiSources } from "../src/core/polyglot-ui-walk.js";

describe("walkUiSources order", () => {
  it("sorts by UTF-16 code unit at every level, not by what the filesystem returned", () => {
    const root = mkdtempSync(join(tmpdir(), "ease-walk-order-"));
    try {
      for (const f of ["b.html", "a.html", "Z.html", "_x.ts", "m/z.js", "m/a.js", "A/q.tsx"]) {
        mkdirSync(join(root, f, ".."), { recursive: true });
        writeFileSync(join(root, f), "x");
      }
      expect(walkUiSources(root).relative).toEqual(["A/q.tsx", "Z.html", "_x.ts", "a.html", "b.html", "m/a.js", "m/z.js"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
