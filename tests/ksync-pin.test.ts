import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scratch, ui } from "./ksync-helpers.js";

const S = scratch();
afterEach(() => S.done());
const SHA = "a".repeat(40);
const pin = (route: string, node: string, extra: string[] = []) =>
  ui(["ksync", "pin", route, "--file", "FILEKEY", "--node", node, "--pins", S.path("pins.json"), "--commit", SHA, "--at", "2026-09-26T00:00:00.000Z", ...extra]);

describe("ui ksync pin", () => {
  it("creates the pins file with pinnedAt and builtFrom", () => {
    const r = pin("alpha/list/home", "1:1");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(S.read("pins.json"))).toEqual({
      schema: "ksync-pins/1",
      pins: [{ route: "alpha/list/home", file: "FILEKEY", node: "1:1", pinnedAt: "2026-09-26T00:00:00.000Z", builtFrom: SHA }],
    });
  });

  it("is idempotent: the same pin twice leaves one entry and identical bytes", () => {
    pin("alpha/list/home", "1:1");
    const once = S.read("pins.json");
    const again = pin("alpha/list/home", "1:1");
    expect(again.stdout).toContain("updated");
    expect(S.read("pins.json")).toBe(once);
  });

  it("keys by frame: a second frame on the same route adds an entry, a re-route moves the first", () => {
    pin("alpha/list/home", "1:2");
    pin("alpha/list/home", "1:1");
    expect(JSON.parse(S.read("pins.json")).pins.map((p: { node: string }) => p.node)).toEqual(["1:1", "1:2"]);
    pin("alpha/list/other", "1:1");
    const pins = JSON.parse(S.read("pins.json")).pins as { route: string; node: string }[];
    expect(pins).toHaveLength(2);
    expect(pins.find((p) => p.node === "1:1")?.route).toBe("alpha/list/other");
  });

  it("sorts by (file, node) whatever the insertion order", () => {
    for (const n of ["9:9", "1:1", "5:5"]) pin("r", n);
    expect(JSON.parse(S.read("pins.json")).pins.map((p: { node: string }) => p.node)).toEqual(["1:1", "5:5", "9:9"]);
  });

  it("stores --spec-hash, and stamps the real git HEAD when --commit is omitted", () => {
    const r = ui(["ksync", "pin", "r", "--file", "F", "--node", "1:1", "--pins", S.path("pins.json"), "--spec-hash", "h1"]);
    expect(r.exitCode).toBe(0);
    const p = JSON.parse(S.read("pins.json")).pins[0];
    expect(p.specHash).toBe("h1");
    expect(p.builtFrom).toMatch(/^[0-9a-f]{40}$/);
  });

  it("refuses a missing --node with a coded error, and a corrupt pins file without overwriting it", () => {
    const r = ui(["ksync", "pin", "r", "--file", "F", "--pins", S.path("pins.json"), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
    pin("r", "1:1");
    const bad = JSON.stringify({ schema: "ksync-pins/1", pins: [{ route: "r" }] });
    writeFileSync(S.path("pins.json"), bad);
    const r2 = pin("r", "2:2");
    expect(r2.exitCode).toBe(1);
    expect(S.read("pins.json")).toBe(bad);
  });

  it("rejects a flag outside the signature", () => {
    expect(ui(["ksync", "pin", "r", "--file", "F", "--node", "1", "--bogus", "x"]).exitCode).toBe(1);
  });

  it("ships a schema whose pin fields match what the validator accepts", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "ksync-pins.schema.json"), "utf8"));
    expect(Object.keys(schema.definitions.pin.properties).sort()).toEqual(["builtFrom", "file", "node", "pinnedAt", "route", "specHash"]);
    expect(schema.definitions.pin.required).toEqual(["route", "file", "node", "pinnedAt", "builtFrom"]);
    expect(schema.definitions.pin.additionalProperties).toBe(false);
  });
});
