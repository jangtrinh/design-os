/**
 * `inferred-links`, the command-level flow: a term named like a node blocks the write; the question is answered from the
 * `--format claude` key alone, with an option answer and with a per-member answer; a ruling survives a reorder.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { build, json, lint, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const CONTEXT = (...terms: string[]): string => `# Glossary\n\n${terms.map((t) => `**${t}**:\nA definition of ${t}.\n_Avoid_: other\n`).join("\n")}`;
const withTerms = (...terms: string[]): string => { const p = ring1Project(); write(p, "CONTEXT.md", CONTEXT(...terms)); return p; };
const key = (p: string): ReturnType<typeof keyOf> => keyOf(p).filter((k) => k.kind === "inferred-links");

describe("a term named like a node blocks the write and is answered from the key alone", () => {
  it("blocks with ONBOARD_BLOCKED_NEEDS_OWNER_RULING, writes nothing, stores the question, and still shows what would be written", () => {
    const p = withTerms("Card", "Ledger");
    const before = hashTree(p, [".design-os"]);
    const done = build(p);
    expect(done.code).toBe(1);
    const env = json(done.out);
    expect(env.error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(env.data!["wouldWrite"].coverage.find((r: { kind: string }) => r.kind === "term")).toMatchObject({ nodes: 2 });
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(existsSync(join(p, "design/knowledge/ontology.json"))).toBe(false);
    expect(key(p)).toHaveLength(1); // the question is stored; Ledger has no candidate and raises none
    expect(capture(["ontology", "build", "--dir", p]).err).toContain("Coverage");
  });
  it("an option answer links the term to its candidate and the next build writes the link", () => {
    const p = withTerms("Card");
    build(p);
    const entry = key(p)[0]!;
    expect(submit(p, [{ fingerprint: entry.fingerprint, choice: "link-all" }]).code).toBe(0);
    expect(build(p).code).toBe(0);
    expect(ontologyOf(p).links.filter((l) => l.kind === "defines")).toEqual([{ kind: "defines", from: "term:Card", to: "component:Card" }]);
  });
  it("a per-member answer decides node by node, from the key's own member list", () => {
    const p = withTerms("Card");
    write(p, "design/patterns/card.md", "# Card\n\nA pattern.\n");
    build(p);
    const entry = key(p)[0]!;
    expect(entry.perMemberAnswer!.members).toHaveLength(2);
    const members = Object.fromEntries(entry.perMemberAnswer!.members.map((m, i) => [m, i === 0 ? "link" : "standalone"]));
    expect(submit(p, [{ fingerprint: entry.fingerprint, choice: "review-individually", members }]).code).toBe(0);
    expect(build(p).code).toBe(0);
    expect(ontologyOf(p).links.filter((l) => l.kind === "defines")).toHaveLength(1);
  });
  it("standalone writes no link and the term is not an orphan; the lint says so", () => {
    const p = withTerms("Card");
    build(p);
    submit(p, [{ fingerprint: key(p)[0]!.fingerprint, choice: "standalone" }]);
    expect(build(p).code).toBe(0);
    const o = ontologyOf(p);
    expect(o.links.some((l) => l.kind === "defines")).toBe(false);
    expect(o.nodes.find((n) => n.id === "term:Card")).toMatchObject({ standalone: true });
    const l = json(lint(p, "--strict").out);
    expect(l.data!["findings"].filter((f: { message: string }) => f.message.includes("term node"))).toEqual([]);
  });
  it("a term nothing is named after is an orphan no question covers, counted and named in the summary", () => {
    const p = withTerms("Ledger");
    const done = build(p);
    expect(done.code).toBe(0);
    expect(ontologyOf(p)["uncovered"]).toContainEqual({ kind: "term", count: 1 });
    expect(capture(["ontology", "build", "--dir", p]).out).toContain("Orphans no question covers: 1 term");
  });
  it("a ruling stays attached to the pair when the glossary is reordered and its text changes: nothing is asked again", () => {
    const p = withTerms("Card", "Ledger");
    build(p);
    submit(p, [{ fingerprint: key(p)[0]!.fingerprint, choice: "link-all" }]);
    write(p, "CONTEXT.md", CONTEXT("Ledger", "Card").replace("A definition of Card.", "Another words for it."));
    const done = build(p);
    expect(done.code).toBe(0);
    expect(existsSync(join(p, ".design-os/onboard/pending.json"))).toBe(false);
    expect(ontologyOf(p).links.filter((l) => l.kind === "defines")).toHaveLength(1);
  });
});
