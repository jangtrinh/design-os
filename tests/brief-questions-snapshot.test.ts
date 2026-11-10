/**
 * The brief question contract must not move when the option/limit logic is shared with `ui onboard questions`.
 * The golden files were captured from the formatter as it was before it was generalised.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";

const FIX = join(process.cwd(), "tests", "fixtures", "brief");
const GOLDEN = join(process.cwd(), "tests", "fixtures", "owner-rulings", "brief-golden");
const CASES = ["webapp-needs-language", "webapp-many-questions", "landing-shaped-low-confidence"];

function questionsFile(name: string): string {
  const file = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "brief-snap-")), "questions.json");
  capture(["brief", "lint", join(FIX, `${name}.json`), "--questions", file, "--json"]);
  return file;
}

describe("ui brief questions output is byte-identical to the pre-share snapshot", () => {
  it.each(CASES)("%s — claude payload", (name) => {
    const { code, out } = capture(["brief", "questions", questionsFile(name), "--format", "claude"]);
    expect(code).toBe(0);
    expect(out).toBe(readFileSync(join(GOLDEN, `${name}.claude.json`), "utf8"));
  });
  it.each(CASES)("%s — markdown gap sheet", (name) => {
    const { code, out } = capture(["brief", "questions", questionsFile(name), "--format", "markdown"]);
    expect(code).toBe(0);
    expect(out).toBe(readFileSync(join(GOLDEN, `${name}.markdown.md`), "utf8"));
  });
});
