/**
 * Guards for two DELIBERATE exemptions that the closed font allowlist must not "fix" (spec 031 PD-4).
 *
 *  - taste-checks-typography.ts: a monospace face already satisfies `data-numbers-not-tabular`
 *    (a mono column aligns its digits). The rule asks "do digits align?", not "is the font allowed?".
 *  - designmd-token-extractor.ts: generic families (`monospace`, `system-ui`, `ui-monospace`, ...) are not
 *    font TOKENS; the extractor must not surface them as candidates.
 *
 * D1 (an invented `ui-monospace` stack passing every gate) is closed by `off-system-font` in ds-usage,
 * which compares a page's stacks with the declared font tokens. Neither of these two files changes, so
 * these tests pin their behaviour from the outside: if someone later "fixes D1" by editing either file,
 * the matching test below goes red.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkDataNumbersNotTabular } from "../src/core/taste-checks-typography.js";
import { extractTokens } from "../src/core/designmd-token-extractor.js";
import { lintDsUsage } from "../src/core/ds-usage-lint.js";
import { fontTokenModel } from "../src/core/ds-usage-font-check.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { declaredCssVarNames } from "../src/core/token-emit.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/oi-browser/", import.meta.url));

/** A table with a numeric column and NO tabular-nums: the shape `data-numbers-not-tabular` looks for. */
const table = (family: string): string =>
  `<html><head><style>td { font-family: ${family}; }</style></head><body><table>` +
  [["Alpha", "1,204"], ["Beta", "9,871"], ["Gamma", "30,002"]].map(([a, n]) => `<tr><td>${a}</td><td>${n}</td></tr>`).join("") +
  `</table></body></html>`;

describe("data-numbers-not-tabular keeps accepting a monospace column", () => {
  it("fires on a proportional numeric column (the control: the rule is alive)", () => {
    expect(checkDataNumbersNotTabular(table("Inter, sans-serif")).map((f) => f.checkId)).toEqual(["data-numbers-not-tabular"]);
  });

  it("does not fire when the column is monospace, whether or not the design system declares that face", () => {
    for (const family of ["ui-monospace, SFMono-Regular, Menlo, monospace", "monospace", "'JetBrains Mono', monospace"]) {
      expect(checkDataNumbersNotTabular(table(family)), family).toEqual([]);
    }
  });

  it("the same monospace column IS an off-system-font error against the fixture design system: D1 is closed by ds-usage, not by taste", () => {
    const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(FIXTURES + "tokens.json", "utf8"))));
    const html = table("ui-monospace, SFMono-Regular, Menlo, monospace");
    expect(checkDataNumbersNotTabular(html)).toEqual([]);
    const r = lintDsUsage(html, { declaredVars: declaredCssVarNames(resolved), fonts: fontTokenModel(resolved) });
    expect(r.findings.map((f) => f.checkId)).toEqual(["off-system-font"]);
  });
});

describe("designmd-token-extractor keeps skipping generic font families", () => {
  const fontsOf = (css: string): string[] => extractTokens([{ name: "p.css", body: css }]).fonts.map((f) => f.family);

  it("extracts a named family from a stack, quotes stripped (the control: extraction is alive)", () => {
    expect(fontsOf(`.a { font-family: "Inter", sans-serif; }`)).toEqual(["Inter"]);
  });

  it("does not surface a stack whose first family is generic", () => {
    for (const first of ["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "inherit", "initial"]) {
      expect(fontsOf(`.a { font-family: ${first}, Menlo, monospace; }`), first).toEqual([]);
    }
  });

  it("does not surface var() references", () => {
    expect(fontsOf(`.a { font-family: var(--font-body); }`)).toEqual([]);
  });
});
