/** One reader of a Figma inventory file, shared by the registry provenance check and the negative-space harvest. */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { INVENTORY_FILE_NAMES, InventoryJsonError, readInventoryEntries } from "../src/core/figma-inventory-entries.js";
import { readInventory } from "../src/core/negative-space-sources.js";
import { DSError } from "../src/core/design-system.js";

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "inv-"));
  mkdirSync(dir, { recursive: true });
  for (const [n, t] of Object.entries(files)) writeFileSync(join(dir, n), t);
  return dir;
}

describe("readInventoryEntries", () => {
  it("lists components then component sets, objects only, and tolerates a BOM", () => {
    const dir = dirWith({ "ds.json": `\uFEFF${JSON.stringify({ components: [{ id: "1:1", name: "A" }, 7, null], componentSets: [{ id: "1:2", name: "B" }], frames: [{ id: "9:9" }] })}` });
    expect(readInventoryEntries(join(dir, "ds.json"))?.map((e) => e["id"])).toEqual(["1:1", "1:2"]);
  });
  it("is undefined for an absent file and throws InventoryJsonError naming the file for bad JSON", () => {
    const dir = dirWith({ "ds.json": "{ nope" });
    expect(readInventoryEntries(join(dir, "canvas-inventory.json"))).toBeUndefined();
    expect(() => readInventoryEntries(join(dir, "ds.json"))).toThrowError(InventoryJsonError);
    expect(() => readInventoryEntries(join(dir, "ds.json"))).toThrowError(/ds\.json/);
  });
  it("names the two inventory files once", () => {
    expect([...INVENTORY_FILE_NAMES]).toEqual(["ds.json", "canvas-inventory.json"]);
  });
});

describe("the harvest keeps its own error code for the shared reader", () => {
  it("BAD_JSON with the fix hint", () => {
    const dir = dirWith({ "canvas-inventory.json": "[" });
    try { readInventory(dir); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(DSError); expect((e as DSError).code).toBe("BAD_JSON"); expect((e as DSError).message).toContain("Fix the file or remove it"); }
  });
  it("reads names and sizes of both files and labels each with its file", () => {
    const dir = dirWith({ "ds.json": JSON.stringify({ components: [{ name: "Card header", w: 300, h: 40 }, { id: "x" }] }), "canvas-inventory.json": JSON.stringify({ componentSets: [{ name: "Badge" }] }) });
    const inv = readInventory(dir);
    expect(inv.files).toEqual(["design/ds.json", "design/canvas-inventory.json"]);
    expect(inv.components).toEqual([{ name: "Card header", file: "design/ds.json", w: 300, h: 40 }, { name: "Badge", file: "design/canvas-inventory.json" }]);
  });
});
