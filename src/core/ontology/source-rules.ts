/**
 * `rule` nodes: what the owner ratified or promoted. Three ring-1 sources, each listed honestly in the summary:
 * a ratified `design/soul.md` (its `## Never` / `## Always` bullets), promoted adherence rules
 * (`design/rules/_adherence.rules.json`), and measured conventions (`design/conventions.json`, only when it exists).
 * Proposals (`_adherence.proposed.json`, `## Never (proposed)`) are counted, never nodes. A project with none of the
 * sources reports rules as not sensed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AdherenceRuleError, loadAdherenceRules } from "../adherence-rules.js";
import { DSError } from "../design-system.js";
import { derivedRules, parseConventionsDoc, CONVENTIONS_JSON_REL } from "./conventions-machine-form.js";
import type { ConventionsDoc, MeasuredRule } from "./conventions-machine-form.js";
import { gateFamilyFor } from "./gate-table.js";
import type { RuleOrigin } from "./gate-table.js";
import { nodeId, soulRuleKey } from "./node-ids.js";
import { BAD_SOURCE, OntologyReadError, parseSourceJson } from "./read-error.js";
import { readSoulRules } from "./soul-rules-reader.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

/** What link rules need of a rule: where it came from, its kind (adherence only) and its source's own target. */
export interface RuleFact { id: string; origin: RuleOrigin; kind: string }
export interface RuleRead { nodes: OntNode[]; facts: RuleFact[]; report: SourceReport; proposals: { rules: number; soul: number }; conventions: ConventionsDoc | null }

export const SOUL_REL = "design/soul.md";

function adherenceNodes(projectDir: string): { nodes: OntNode[]; facts: RuleFact[]; proposed: number } {
  let loaded;
  try { loaded = loadAdherenceRules(join(projectDir, "design")); }
  catch (e) {
    if (e instanceof AdherenceRuleError || e instanceof DSError) throw new OntologyReadError(BAD_SOURCE, `design/rules: ${e.message.split(projectDir).join("").replace(/^\/+/, "")}`);
    throw e;
  }
  const nodes = loaded.binding.map(({ rule }): OntNode => ({
    id: nodeId("rule", `adherence:${rule.id}`), kind: "rule", name: rule.message, origin: "adherence", ruleKind: rule.kind, severity: rule.severity,
    ...(gateFamilyFor("adherence", rule.kind) === undefined ? {} : { gate: gateFamilyFor("adherence", rule.kind) }),
  }));
  const facts = loaded.binding.map(({ rule }): RuleFact => ({ id: nodeId("rule", `adherence:${rule.id}`), origin: "adherence", kind: rule.kind }));
  return { nodes, facts, proposed: loaded.proposed.length };
}

/** Derived from the document's totals, never from its stored `rules`: an edited or added rule becomes no node (the lint reports it). */
function conventionNodes(doc: ConventionsDoc): OntNode[] {
  return derivedRules(doc).map((r: MeasuredRule): OntNode => ({ id: nodeId("rule", `convention:${r.id}`), kind: "rule", name: r.statement, origin: "convention", category: r.category, measured: r.measured }));
}

export function readRuleNodes(projectDir: string): RuleRead {
  const lines: string[] = [];
  const nodes: OntNode[] = [];
  const facts: RuleFact[] = [];
  let soulProposed = 0;

  const soulPath = join(projectDir, SOUL_REL);
  if (existsSync(soulPath)) {
    const soul = readSoulRules(readFileSync(soulPath, "utf8"));
    soulProposed = soul.proposed;
    if (soul.rules.length > 0) {
      for (const r of soul.rules) {
        const id = nodeId("rule", `soul:${soulRuleKey(r.section, r.text)}`);
        nodes.push({ id, kind: "rule", name: r.text, origin: "soul", section: r.section });
        facts.push({ id, origin: "soul", kind: r.section });
      }
      lines.push(`soul: ${soul.rules.length} ratified`);
    } else lines.push(`soul: ${soul.status === "ratified" ? "ratified, no rule under Never or Always" : "not ratified, so its rules are not nodes (set status: ratified)"}`);
  } else lines.push(`soul: ${SOUL_REL} absent (ui ds soul)`);

  const adherence = adherenceNodes(projectDir);
  nodes.push(...adherence.nodes);
  facts.push(...adherence.facts);
  lines.push(adherence.nodes.length > 0 ? `adherence: ${adherence.nodes.length} promoted` : "adherence: no promoted rule file");

  let conventions: ConventionsDoc | null = null;
  const convPath = join(projectDir, CONVENTIONS_JSON_REL);
  if (existsSync(convPath)) {
    const parsed = parseConventionsDoc(parseSourceJson(CONVENTIONS_JSON_REL, readFileSync(convPath, "utf8")));
    if (typeof parsed === "string") throw new OntologyReadError(BAD_SOURCE, `${CONVENTIONS_JSON_REL}: ${parsed}; re-run ui synthesize-conventions`);
    conventions = parsed;
    const cn = conventionNodes(parsed);
    nodes.push(...cn);
    facts.push(...cn.map((n): RuleFact => ({ id: n.id, origin: "convention", kind: String(n["category"]) })));
    lines.push(`conventions: ${cn.length} measured`);
  } else lines.push("conventions: absent (ui synthesize-conventions)");

  const waiting = [adherence.proposed > 0 ? `${adherence.proposed} adherence` : "", soulProposed > 0 ? `${soulProposed} soul` : ""].filter((s) => s !== "");
  if (waiting.length > 0) lines.push(`${waiting.join(" and ")} proposal(s) waiting, not nodes`);
  const report: SourceReport = nodes.length > 0
    ? { kind: "rule", status: "read", nodes: nodes.length, note: lines.join("; ") }
    : { kind: "rule", status: "not-sensed", nodes: 0, note: `no ratified or promoted rule source: ${lines.join("; ")}` };
  return { nodes, facts, report, proposals: { rules: adherence.proposed, soul: soulProposed }, conventions };
}
