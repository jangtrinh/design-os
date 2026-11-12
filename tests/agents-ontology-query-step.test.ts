/**
 * The ontology query is a numbered step inside the first-action list of every role on every runtime, the hand-back names
 * it, and `ui agents check` is red on a generated file from which the step was removed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripBlocks } from "../src/core/agents-areas-block.js";
import { ring1Project } from "./ontology-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { check, claudeFile, init, name, pinStudioHome, prefix, read, ROLES } from "./agents-runtimes-helpers.js";

pinStudioHome();

const STEP_LINE = /^\d+\. .*`ui ontology query/;
const antigravityFile = (p: string, role: string): string => `.agent/skills/design-os-agent-${prefix(role)}-${name(p)}/SKILL.md`;
const noOntology = (): string => ring1Project();
const ALL = "claude,codex,antigravity";
const fresh = (): string => { const p = builtRing1(); expect(init(p, "--runtimes", ALL).code).toBe(0); return p; };
/** The text of one role in AGENTS.md: from its heading to the next heading. */
const codexSection = (p: string, role: string): string => {
  const text = read(p, "AGENTS.md");
  const start = text.indexOf(`### ${prefix(role)}-${name(p)}`);
  expect(start).toBeGreaterThan(-1);
  const next = text.indexOf("\n### ", start + 4);
  const end = text.indexOf("\n<!--", start);
  return text.slice(start, next === -1 ? (end === -1 ? undefined : end) : next);
};
const rendered = (p: string, runtime: string, role: string): string =>
  runtime === "claude" ? read(p, claudeFile(p, role)) : runtime === "antigravity" ? read(p, antigravityFile(p, role)) : codexSection(p, role);

/** The numbered items of the first-action list, with the generated block stripped first. */
function firstActionItems(text: string): string[] {
  const lines = stripBlocks(text).split("\n");
  const head = lines.findIndex((l) => l.startsWith("**First action, every task"));
  expect(head).toBeGreaterThan(-1);
  const items: string[] = [];
  for (const line of lines.slice(head + 1)) {
    if (/^\d+\. /.test(line)) items.push(line);
    else if (line.startsWith("**")) break;
    else if (items.length > 0 && !/^\s/.test(line) && line.trim() !== "") break;
  }
  return items;
}

const RUNTIME_LIST = ["claude", "codex", "antigravity"] as const;

describe("the ontology query step in the first-action list", () => {
  for (const role of ROLES) for (const runtime of RUNTIME_LIST) {
    it(`${role} on ${runtime}: a numbered item with the query is step 2 (designer and figma hand: before the registry step)`, () => {
      const p = fresh();
      const items = firstActionItems(rendered(p, runtime, role));
      const at = items.findIndex((l) => STEP_LINE.test(l));
      expect(at, items.join("\n")).toBe(1);
      expect(items[at]!.startsWith("2. ")).toBe(true);
      const registry = items.findIndex((l) => l.includes("ui registry list"));
      if (role !== "curator") { expect(registry).toBe(2); expect(at).toBeLessThan(registry); } else expect(registry).toBe(-1);
      expect(items.length).toBe(role === "curator" ? 2 : 5);
    });
    it(`${role} on ${runtime}: the hand-back names the query outside the generated block`, () => {
      const p = fresh();
      const outside = stripBlocks(rendered(p, runtime, role));
      const handback = outside.slice(outside.indexOf("**Handback format:**"));
      expect(handback).toContain("`ui ontology query` command you ran and its exit code, or why it");
    });
  }
});

describe("ui agents check is red when the step is removed from a generated file", () => {
  const removeStep = (text: string): string => {
    const from = text.indexOf("2. Run `ui ontology query");
    const to = text.search(/\n(3\. Run `ui registry list|\n\*\*Scope)/);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return text.slice(0, from) + text.slice(to + 1);
  };
  const files = (p: string): Record<string, string> => ({ claude: claudeFile(p, "designer"), antigravity: antigravityFile(p, "designer"), codex: "AGENTS.md" });
  for (const [label, make] of [["with an ontology file", builtRing1], ["with no ontology file", noOntology]] as const) {
    for (const runtime of RUNTIME_LIST) {
      it(`${runtime} target, ${label}`, () => {
        const p = make();
        expect(init(p, "--runtimes", "claude,codex,antigravity").code).toBe(0);
        expect(check(p).code).toBe(0);
        const file = join(p, files(p)[runtime]!);
        const before = readFileSync(file, "utf8");
        const after = runtime === "codex" ? removeFirst(before) : removeStep(before);
        expect(after).not.toBe(before);
        writeFileSync(file, after);
        const got = check(p);
        expect(got.code).toBe(1);
        expect(got.data.findings.map((f) => `${f.checkId}:${f.severity}`)).toEqual([runtime === "claude" ? "agent-stale:error" : "AGENTS_ROSTER_DRIFT:error"]);
      });
    }
  }
  /** In AGENTS.md the step is removed from the first role section only. */
  function removeFirst(text: string): string {
    const from = text.indexOf("2. Run `ui ontology query");
    const to = text.indexOf("3. Run `ui registry list", from);
    expect(from).toBeGreaterThan(-1);
    return text.slice(0, from) + text.slice(to);
  }
});

describe("init then check on a fresh project", () => {
  for (const [label, make] of [["with an ontology file", builtRing1], ["with no ontology file", noOntology]] as const) {
    it(`${label}: no finding for claude, codex and antigravity`, () => {
      const p = make();
      expect(init(p, "--runtimes", "claude,codex,antigravity").code).toBe(0);
      const got = check(p);
      expect(got.code).toBe(0);
      expect(got.data.findings).toEqual([]);
    });
  }
});
