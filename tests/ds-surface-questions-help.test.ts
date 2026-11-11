/**
 * The help text and the command signature of `ui ds surface` name the two registration questions and the code the stop
 * answer returns, and no longer name the refusal that sent the owner to a command that fails on a store that is not kit-bound.
 */
import { describe, expect, it } from "vitest";
import { signatureFor } from "../src/core/command-signatures.js";
import { capture } from "./owner-rulings-helpers.js";

const help = (): string => {
  const out = capture(["ds", "--help"]).out;
  const start = out.indexOf("'ds surface' options:");
  return out.slice(start, out.indexOf("'ds specimen' options:", start));
};

describe("ui ds surface help", () => {
  it("names both questions, their answers and the code of the stop answer", () => {
    const text = help();
    expect(text).toContain("component-source-changed");
    expect(text).toContain("component-lint-refused");
    expect(text).toMatch(/refresh/);
    expect(text).toMatch(/leave-out/);
    expect(text).toContain("SURFACE_LINT_STOPPED");
  });
  it("names no removed code and no command that fails on a store that is not kit-bound", () => {
    const text = help();
    expect(text).not.toContain("SURFACE_REGISTERED_SOURCE_CHANGED");
    expect(text).not.toContain("--force");
    expect(text).not.toMatch(/re-register/i); // the help may name the shared registration rules, never a next action that re-registers by force
  });
});

describe("the command signature", () => {
  it("lists the stop code and not the removed one", () => {
    const codes = signatureFor("ds", "surface")!.errorCodes;
    expect(codes).toContain("SURFACE_LINT_STOPPED");
    expect(codes).not.toContain("SURFACE_REGISTERED_SOURCE_CHANGED");
  });
  it("describes --register and --apply with the questions", () => {
    const flags = signatureFor("ds", "surface")!.flags;
    expect(flags.find((f) => f.name === "register")!.summary).toMatch(/question/i);
    expect(flags.find((f) => f.name === "apply")!.summary).toMatch(/question|ruling/i);
  });
});
