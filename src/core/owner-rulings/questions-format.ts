/**
 * Renders clusters as owner questions. The AskUserQuestion payload goes through the formatter that `ui brief
 * questions` also uses (PD-2), so the limits (4 questions, 2-4 options, header <= 12) live in one place.
 */
import { toClaudeQuestionPayload } from "../brief-questions-format.js";
import type { FormatQuestion } from "../brief-questions-format.js";
import type { Cluster } from "./cluster.js";
import { CLUSTER_KIND_TABLE, REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { memberText } from "./member-text.js";
import { DROP, KEEP } from "./ruling-store.js";

export const QUESTIONS_PER_ROUND = 4;

/** Ask order: the kinds whose answer can dissolve other clusters first; ties by fingerprint. */
export function orderClusters(clusters: readonly Cluster[]): Cluster[] {
  return [...clusters].sort((a, b) =>
    CLUSTER_KIND_TABLE[a.kind].rank - CLUSTER_KIND_TABLE[b.kind].rank || (a.fingerprint < b.fingerprint ? -1 : 1));
}

export function roundCount(clusters: readonly Cluster[]): number {
  return Math.max(1, Math.ceil(clusters.length / QUESTIONS_PER_ROUND));
}

function toFormatQuestion(c: Cluster): FormatQuestion {
  const shown = c.samples.map((m) => memberText(c, m));
  // The question text is never cut. Only this sample line is capped, at a whole item, and it points at the full list.
  const sample = c.samples.length < c.count
    ? `${shown.join(", ")}, and ${c.count - c.samples.length} more. The full list is in the sheet: ui onboard questions --format markdown`
    : shown.join(", ");
  return {
    id: c.fingerprint,
    header: CLUSTER_KIND_TABLE[c.kind].header,
    question: `${c.question}\n${c.count} affected: ${sample}`,
    multiSelect: CLUSTER_KIND_TABLE[c.kind].setValued,
    options: c.options.map((o) => ({ label: o.label, description: o.consequence, recommended: o.recommended === true })),
  };
}

/** How a multi-select question is answered member by member; it is never one of the options. */
const PER_MEMBER_NOTE = `To decide member by member, answer with choice ["${REVIEW_INDIVIDUALLY}"] and a members map giving each member "${KEEP}" or "${DROP}".`;

/** One round of the AskUserQuestion payload, plus the key that maps each question back to its fingerprint and option ids. */
export function toOwnerClaudePayload(clusters: readonly Cluster[], round: number): Record<string, unknown> {
  const ordered = orderClusters(clusters).slice((round - 1) * QUESTIONS_PER_ROUND);
  const payload = toClaudeQuestionPayload(ordered.map(toFormatQuestion));
  const asked = ordered.slice(0, QUESTIONS_PER_ROUND);
  return {
    ...payload,
    round,
    rounds: roundCount(clusters),
    answerKey: asked.map((c) => ({
      fingerprint: c.fingerprint, kind: c.kind, multiSelect: CLUSTER_KIND_TABLE[c.kind].setValued,
      options: c.options.map((o) => ({ id: o.id, label: o.label, ...(o.selects === undefined ? {} : { selects: o.selects }), ...(o.assigns === undefined ? {} : { assigns: o.assigns }) })),
      ...(c.memberChoices === undefined ? {} : { memberChoices: c.memberChoices, perMemberAnswer: { choice: REVIEW_INDIVIDUALLY, members: c.members } }),
      ...(c.labels === undefined ? {} : { labels: c.labels }),
      ...(CLUSTER_KIND_TABLE[c.kind].setValued ? { perMemberAnswer: { choice: [REVIEW_INDIVIDUALLY], values: [KEEP, DROP], members: c.members } } : {}),
    })),
  };
}

/** The sheet a team can answer asynchronously: every cluster with every member listed (FR-004). */
/** The note a json listing carries once for all its multi-select questions. */
export const PER_MEMBER_ANSWER_NOTE = PER_MEMBER_NOTE;

export function toOwnerMarkdown(clusters: readonly Cluster[]): string {
  const lines = ["# Owner questions", "", "Answer each question, then give the host an answers file: `ui onboard answer --file <answers.json>`.", ""];
  for (const c of orderClusters(clusters)) {
    const multi = CLUSTER_KIND_TABLE[c.kind].setValued;
    lines.push(`## ${c.kind} · ${c.count} affected`, "", c.question, "", `Fingerprint: \`${c.fingerprint}\``, multi ? "Pick every option that applies." : "Pick one option.", "");
    for (const o of c.options) {
      lines.push(`- [ ] \`${o.id}\` ${o.label}${o.recommended === true ? " (Recommended)" : ""} — ${o.consequence}`);
      if (o.selects !== undefined) lines.push(`  - stands for: ${o.selects.map((m) => memberText(c, m)).join(", ")}`);
    }
    if (multi) lines.push("", PER_MEMBER_NOTE);
    lines.push("", "Members:");
    for (const m of c.members) {
      lines.push(`- ${memberText(c, m)}`);
      const choices = c.memberChoices?.[m];
      if (choices !== undefined) lines.push(...choices.map((x) => `  - \`${x.id}\` ${x.label}`));
    }
    if (c.memberChoices !== undefined) lines.push("", `To decide member by member, answer with choice "${REVIEW_INDIVIDUALLY}" and a members map giving each member one of its choice ids above.`);
    lines.push("", "Answer: ", "");
  }
  return `${lines.join("\n")}\n`;
}
