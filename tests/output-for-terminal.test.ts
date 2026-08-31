/**
 * Values lifted out of an artifact are AUTHOR-controlled, and `ui` stdout is a
 * machine channel an agent parses.
 *
 * This was a real regression, not a hypothetical: the unresolved-stylesheet note
 * used to print a COUNT and was changed to print the hrefs themselves. An href is
 * an HTML attribute the page author wrote, so a newline in one manufactures a line
 * that reads as the engine speaking, and an ESC sequence repaints the terminal of
 * whoever ran the command.
 *
 * Red probe: return `raw` unchanged from `forTerminal` and the first three cases
 * fail. The "leaves ordinary text alone" case is the control — a sanitiser that
 * mangles a normal URL would be worse than none, because nobody could act on the
 * report.
 */
import { describe, expect, it } from "vitest";
import { forTerminal } from "../src/core/output.js";

const ESC = String.fromCharCode(0x1b);

describe("artifact text cannot forge engine output", () => {
  it("cannot manufacture a new line", () => {
    const forged = `x.css\n  ✗ side-tab  everything is fine`;
    const safe = forTerminal(forged);
    expect(safe).not.toContain("\n");
    expect(safe).toContain("\\x0a");
  });

  it("cannot emit terminal control sequences", () => {
    const safe = forTerminal(`${ESC}[31mDANGER${ESC}[0m.css`);
    expect(safe).not.toContain(ESC);
    expect(safe).toContain("\\x1b");
  });

  it("cannot hide behind a carriage return", () => {
    // \r alone repaints the current line, which is how output gets overwritten
    // rather than appended — invisible in a scrollback, decisive in a terminal.
    const safe = forTerminal("harmless.css\rEVERYTHING PASSED");
    expect(safe).not.toContain("\r");
  });

  it("marks truncation instead of silently cutting", () => {
    const long = `https://example.com/${"a".repeat(400)}.css`;
    const safe = forTerminal(long, 60);
    expect(safe.length).toBe(60);
    expect(safe.endsWith("…")).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    // The control. A sanitiser nobody can read past is a report nobody can act on.
    const href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap";
    expect(forTerminal(href)).toBe(href);
    expect(forTerminal("./styles/base.css")).toBe("./styles/base.css");
  });
});
