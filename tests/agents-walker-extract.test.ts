/**
 * The extractor of the walker, on its own: one line of each form the tool prints, and the lines that must not be taken.
 */
import { describe, expect, it } from "vitest";
import { extractCommands, QUERY_PLACEHOLDER } from "./agents-walker-extract.js";

describe("extractCommands takes a command from every form the tool prints", () => {
  const cases: [string, string, string[][]][] = [
    ["Next:", "Next: ui ontology build", [["ontology", "build"]]],
    ["Then:", "Then: ui agents init --force --runtimes claude --roster designer", [["agents", "init", "--force", "--runtimes", "claude", "--roster", "designer"]]],
    ["with:", "No target yet for antigravity, codex; add them with: ui agents init --runtimes antigravity,codex", [["agents", "init", "--runtimes", "antigravity,codex"]]],
    ["regenerate it:", "  ✗ [agent-stale]: 'x' is stale; regenerate it: ui agents init --force --runtimes claude", [["agents", "init", "--force", "--runtimes", "claude"]]],
    ["run with single quotes", "no design-os agents under 'x' — agents are opt-in; run 'ui agents init' to create them", [["agents", "init"]]],
    ["run without quotes", "then run ui ontology build to refresh it", [["ontology", "build"]]],
    ["backticks", "run `ui ontology build`, then `ui agents check` prints the command", [["ontology", "build"], ["agents", "check"]]],
    ["a command followed by a sentence", "  ✗ [x]: it is stale; regenerate it: ui agents init --force --runtimes claude. The Codex section cannot be regenerated: shorten the text.", [["agents", "init", "--force", "--runtimes", "claude"]]],
    ["run in a sentence stops at the prose", "fix it or remove it, then run ui ontology build again", [["ontology", "build"]]],
  ];
  for (const [label, text, want] of cases) {
    it(label, () => { expect(extractCommands(text)).toEqual(want); });
  }
  it("a Ways out list: every indented ui line, and not the manual action under it", () => {
    const text = ["ui: refused", "Ways out:", "  ui agents init --runtimes claude --force", "  ui agents init --force --roster designer", "  or shorten the project's own text in AGENTS.md, then run the command again"].join("\n");
    expect(extractCommands(text)).toEqual([["agents", "init", "--runtimes", "claude", "--force"], ["agents", "init", "--force", "--roster", "designer"]]);
  });
  it("a quoted word is one argument, and the same command is taken once", () => {
    expect(extractCommands("Next: ui ontology query \"two words\" --area \"page:Kit\"\nNext: ui ontology query \"two words\" --area \"page:Kit\"")).toEqual([["ontology", "query", "two words", "--area", "page:Kit"]]);
  });
});

describe("extractCommands skips what is not a command to run", () => {
  it("the query command with its placeholder, by name", () => {
    const text = `\`ui ontology query "${QUERY_PLACEHOLDER}" --area "<area key>"\``;
    expect(extractCommands(text)).toEqual([]);
    expect(extractCommands(`run \`ui ontology query "${QUERY_PLACEHOLDER}"\` and \`ui agents check\``)).toEqual([["agents", "check"]]);
  });
  it("a hint that names a command in quotes without telling the reader to run it", () => {
    expect(extractCommands("hint: no studio soul — 'ui ds soul init --studio' gives your agents a studio genealogy")).toEqual([]);
  });
  it("prose that mentions ui in a word", () => {
    expect(extractCommands("the ui kernel reads design/ds.json")).toEqual([]);
  });
});
