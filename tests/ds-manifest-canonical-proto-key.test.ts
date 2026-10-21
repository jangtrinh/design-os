/**
 * canonicalStringify is shared by every sealed artifact. It used to copy keys by assignment, so an own
 * key named "__proto__" (which JSON.parse creates as a plain data property) set the prototype of the copy
 * instead and silently vanished from the output and from the hash. A direct test of the helper: no CLI
 * command passes user-chosen keys straight through it, so there is no honest CLI seam for this.
 */
import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "../src/core/ds-manifest.js";

describe("canonicalStringify keeps an own __proto__ key", () => {
  const parsed = JSON.parse('{"b":1,"__proto__":{"x":1},"a":{"__proto__":2,"z":0}}') as unknown;

  it("keeps it at every depth, with the keys still sorted", () => {
    const text = canonicalStringify(parsed);
    expect(text).toBe('{\n  "__proto__": {\n    "x": 1\n  },\n  "a": {\n    "__proto__": 2,\n    "z": 0\n  },\n  "b": 1\n}\n');
    // The output round-trips: the key is still an own property after parsing it back.
    expect(Object.keys(JSON.parse(text) as object)).toEqual(["__proto__", "a", "b"]);
  });

  it("hashes the key: the same data without it hashes differently", () => {
    expect(canonicalHash(parsed)).not.toBe(canonicalHash(JSON.parse('{"b":1,"a":{"z":0}}')));
  });

  it("leaves ordinary objects and arrays exactly as before", () => {
    expect(canonicalStringify({ b: [3, { y: 1, x: 2 }], a: null })).toBe('{\n  "a": null,\n  "b": [\n    3,\n    {\n      "x": 2,\n      "y": 1\n    }\n  ]\n}\n');
  });
});
