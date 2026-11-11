/**
 * The help text and the command summaries of `ui ontology` describe what the commands do now: the build also refuses a
 * duplicate id, a dangling link and a conventions pair that differs; the lint judges the build it would run and names
 * both next actions for open questions; the two orphan codes are listed as warnings.
 */
import { describe, expect, it } from "vitest";
import { COMMAND_SIGNATURES } from "../src/core/command-signatures.js";
import { capture } from "./owner-rulings-helpers.js";

const help = capture(["ontology", "--help"]).out;
const build = help.slice(help.indexOf("\nbuild "), help.indexOf("\nlint "));
const lint = help.slice(help.indexOf("\nlint "), help.indexOf("\nOptions:"));
const subcommands = COMMAND_SIGNATURES["ontology"]!.subcommands!;

describe("ui ontology --help", () => {
  it("says the build refuses a duplicate id, a dangling link and a conventions pair that differs, writing nothing", () => {
    for (const code of ["ONTOLOGY_DUPLICATE_ID", "ONTOLOGY_DANGLING_LINK", "CONVENTIONS_PAIR_DRIFT"]) expect(build, code).toContain(code);
  });
  it("says the lint judges the build it would run and names both next actions for open questions", () => {
    expect(lint).toContain("Judges the build it would run now");
    expect(lint).toContain("ui onboard questions");
    expect(lint).toMatch(/ui ontology build for the questions only the build raises/);
  });
  it("lists both orphan codes as warnings", () => {
    expect(help).toMatch(/ONTOLOGY_ORPHAN {22}lint warning \(error under --strict\)/);
    expect(help).toMatch(/ONTOLOGY_ORPHAN_UNASKED {14}lint warning: /);
  });
});

describe("the ontology summaries of the command signatures", () => {
  it("name the build's refusals and the lint's two next actions", () => {
    expect(subcommands["build"]!.summary).toMatch(/refuses, writing nothing, on a duplicate id, a dangling link, a conventions pair that differs/);
    expect(subcommands["lint"]!.summary).toMatch(/ui onboard questions, or ui ontology build for the ones only the build raises/);
    expect(subcommands["lint"]!.summary).toContain("orphans are warnings");
  });
  it("declare the three refusal codes among the error codes of the build", () => {
    for (const code of ["ONTOLOGY_DUPLICATE_ID", "ONTOLOGY_DANGLING_LINK", "CONVENTIONS_PAIR_DRIFT"]) expect(subcommands["build"]!.errorCodes, code).toContain(code);
  });
});
