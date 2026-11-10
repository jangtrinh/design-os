/**
 * Stylesheet forms a probe can match: each has one input that must count and one look-alike that must not.
 * The forms that are listed as limits instead are named in the report and the help.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { capture } from "./helpers/cli-capture.js";
import { harvestNegativeSpace } from "../src/core/negative-space-harvester.js";
import { NEGATIVE_SPACE_LIMITS } from "../src/core/negative-space-probes.js";

function count(id: string, name: string, text: string): number {
  const dir = mkdtempSync(join(tmpdir(), "ns-forms-"));
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), text);
  return (harvestNegativeSpace({ sourceDir: dir }).probes.find((p) => p.id === id))?.count ?? -1;
}

describe("@apply lists are read as class lists", () => {
  it("counts a pill with a pastel fill in one @apply list (NS-02) and a tinted tile (NS-09)", () => {
    expect(count("NS-02", "s.css", ".pill{@apply rounded-full bg-green-100 px-2;}")).toBe(1);
    expect(count("NS-02", "s.css", ".pill{@apply rounded-full bg-[#dcfce7] !important;}")).toBe(1);
    expect(count("NS-09", "s.css", ".tile{@apply size-10 rounded-lg bg-sky-100;}")).toBe(1);
  });
  it("does not count a rounded-md pastel, a pill with a token fill, or a hover-only pastel", () => {
    expect(count("NS-02", "s.css", ".pill{@apply rounded-md bg-green-100;}")).toBe(0);
    expect(count("NS-02", "s.css", ".pill{@apply rounded-full bg-primary;}")).toBe(0);
    expect(count("NS-02", "s.css", ".pill{@apply rounded-full hover:bg-green-100;}")).toBe(0);
  });
  it("counts glow, monospace and gradient classes inside @apply (NS-11, NS-01, NS-10)", () => {
    expect(count("NS-11", "s.css", ".a{@apply shadow-[0_0_12px_#fff];}")).toBe(1);
    expect(count("NS-01", "s.css", ".a{@apply font-mono;}")).toBe(1);
    expect(count("NS-10", "s.css", ".a{@apply bg-linear-to-r from-a to-b;}")).toBe(1);
    expect(count("NS-10", "s.css", ".a{@apply bg-primary;}")).toBe(0);
  });
});

describe("pill radii in em and rem", () => {
  it("counts 999 or more in em and rem next to px", () => {
    expect(count("NS-02", "s.css", ".b{border-radius:999em;background:#dcfce7}")).toBe(1);
    expect(count("NS-02", "s.css", ".b{border-radius:62.5rem 1000rem;background:#dcfce7}")).toBe(1);
  });
  it("does not count an ordinary em or rem radius", () => {
    expect(count("NS-02", "s.css", ".b{border-radius:0.5rem;background:#dcfce7}")).toBe(0);
    expect(count("NS-02", "s.css", ".b{border-radius:2em;background:#dcfce7}")).toBe(0);
  });
});

describe("light fills as #hex, rgb() and hsl() in the rule that carries the shape", () => {
  it("counts a pastel rgb(), rgba() and hsl() with a pill radius, and a pastel tile", () => {
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background:rgb(220,252,231)}")).toBe(1);
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background-color:rgba(220 252 231 / 0.9)}")).toBe(1);
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background:hsl(142 76% 90%)}")).toBe(1);
    expect(count("NS-09", "s.css", ".t{width:40px;height:40px;border-radius:8px;background:hsl(199, 89%, 92%)}")).toBe(1);
  });
  it("does not count a dark, grey or saturated mid-tone fill, or a var() reference", () => {
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background:rgb(20,20,20)}")).toBe(0);
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background:rgb(240,240,240)}")).toBe(0);
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background:hsl(142 76% 40%)}")).toBe(0);
    expect(count("NS-02", "s.css", ".b{border-radius:999px;background:var(--green-100)}")).toBe(0);
  });
});

describe("glow written as drop-shadow() and a ring written as a zero-offset spread shadow", () => {
  it("counts filter: drop-shadow(0 0 Npx) and box-shadow: 0 0 0 Npx (NS-11)", () => {
    expect(count("NS-11", "s.css", ".a{filter:drop-shadow(0 0 8px #0ff)}")).toBe(1);
    expect(count("NS-11", "s.css", ".a{box-shadow:0 0 0 3px #3b82f6}")).toBe(1);
    expect(count("NS-11", "s.css", ".a{box-shadow:0 1px 2px rgba(0,0,0,.1), 0 0 0 4px rgba(59,130,246,.4)}")).toBe(1);
  });
  it("does not count an offset drop shadow, a hairline, a plain elevation, or a ring in a :focus rule", () => {
    expect(count("NS-11", "s.css", ".a{filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))}")).toBe(0);
    expect(count("NS-11", "s.css", ".a{box-shadow:0 0 0 1px rgba(0,0,0,.1)}")).toBe(0);
    expect(count("NS-11", "s.css", ".a{box-shadow:0 1px 3px rgba(0,0,0,.2)}")).toBe(0);
    expect(count("NS-11", "s.css", "input:focus-visible{box-shadow:0 0 0 3px #3b82f6}")).toBe(0);
  });
});

describe("named monospace families without a generic keyword", () => {
  it("counts Menlo, Consolas, Monaco and Courier New in a font declaration (NS-01)", () => {
    for (const fam of ["Menlo", "Consolas", "Monaco", '"Courier New"', "Courier"]) {
      expect(count("NS-01", "s.css", `.a{font-family:${fam}, sans-serif}`), fam).toBe(1);
    }
    expect(count("NS-01", "a.tsx", "export const S = { fontFamily: 'Menlo, Consolas' };")).toBe(1);
  });
  it("does not count the words in copy, or a sans stack", () => {
    expect(count("NS-01", "a.html", "<p>Our office is in Monaco; a Courier delivers.</p>")).toBe(0);
    expect(count("NS-01", "s.css", ".a{font-family:system-ui, sans-serif}")).toBe(0);
  });
});

describe("the forms that are limits are listed in the report and in the help", () => {
  const phrases = ["var() reference", "Object-style CSS-in-JS", "Nested SCSS"];
  it("the limits list names each", () => {
    for (const p of phrases) expect(NEGATIVE_SPACE_LIMITS.some((l) => l.includes(p)), p).toBe(true);
  });
  it("the report text and ds --help name each", () => {
    const dir = mkdtempSync(join(tmpdir(), "ns-limits-"));
    writeFileSync(join(dir, "a.html"), "<p>x</p>");
    const report = capture(["ds", "harvest-bans", "--source", dir, "--dir", dir]).out;
    const help = capture(["ds", "--help"]).out;
    for (const p of ["var() reference", "Object-style CSS-in-JS", "Nested SCSS"]) expect(report, p).toContain(p);
    for (const p of ["var() reference", "object-style CSS-in-JS", "nested SCSS selectors"]) expect(help, p).toContain(p);
  });
});
