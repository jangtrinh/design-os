/**
 * The usage gate family (`ui ds-usage-lint`, the gate, the registry markup lint, `ui token-coverage`) judges a `var(--name)`
 * against the custom properties the project's CSS declares. A token written from CSS is declared under the property it
 * came from and under no other name: the set is what `ui tokens compile --target css` writes.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOM_PROPERTY_EXTENSION, parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { declaredCssVarNames, emitCss } from "../src/core/token-emit.js";
import { capture } from "./owner-rulings-helpers.js";
import { envelope } from "./ds-surface-helpers.js";

const from = (property: string) => ({ [CUSTOM_PROPERTY_EXTENSION]: property });

describe("the usage gate family declares a token under the custom property it was read from", () => {
  const resolved = resolveTokens(parseTokenFile({
    color: {
      x: { $type: "color", $value: "#111111", $extensions: from("--x") },
      "color-y": { $type: "color", $value: "#222222", $extensions: from("--color-y") },
      plain: { $type: "color", $value: "#333333" },
    },
  }));
  it("declaredCssVarNames holds the source names of the tokens that carry one, and the path names of the others", () => {
    expect([...declaredCssVarNames(resolved)].sort()).toEqual(["--color-plain", "--color-y", "--x"]);
  });
  it("it is exactly the set `ui tokens compile --target css` writes", () => {
    const written = [...emitCss(resolved, { sourceNames: true }).matchAll(/^\s+(--[\w-]+):/gm)].map((m) => m[1]).sort();
    expect([...declaredCssVarNames(resolved)].sort()).toEqual(written);
  });

  const files = (page: string): { page: string; tokens: string } => {
    const dir = mkdtempSync(join(tmpdir(), "ds-source-names-gate-"));
    writeFileSync(join(dir, "page.html"), page);
    writeFileSync(join(dir, "tokens.json"), JSON.stringify({
      color: {
        x: { $type: "color", $value: "#111111", $extensions: from("--x") },
        "color-y": { $type: "color", $value: "#222222", $extensions: from("--color-y") },
      },
    }));
    return { page: join(dir, "page.html"), tokens: join(dir, "tokens.json") };
  };
  const both = '<html><body><div style="color: var(--x); background: var(--color-y)">a</div></body></html>';
  it("ui ds-usage-lint: var(--x) and var(--color-y) are declared, not broken references", () => {
    const f = files(both);
    const d = envelope(capture(["ds-usage-lint", f.page, "--tokens", f.tokens, "--json"]).out).data!;
    expect(d["undeclaredTokenCount"]).toBe(0);
    expect(d["errorCount"]).toBe(0);
  });
  it("ui token-coverage: a declaration that reads var(--color-y) is a token declaration, not a raw one", () => {
    const f = files(both);
    const d = envelope(capture(["token-coverage", f.page, "--tokens", f.tokens, "--json"]).out).data!;
    expect(d["categories"]["color"]).toMatchObject({ token: 1, raw: 0 });
  });
  it("a var() that names no property of any token is still undeclared", () => {
    const f = files('<html><body><div style="color: var(--color-x)">a</div></body></html>');
    const d = envelope(capture(["ds-usage-lint", f.page, "--tokens", f.tokens, "--json"]).out).data!;
    expect(d["undeclaredTokenCount"]).toBe(1);
  });
});
