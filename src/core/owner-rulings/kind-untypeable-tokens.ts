/**
 * `untypeable-tokens` (FR-011): a variable or token is skipped for any reason other than a collision. One question,
 * sub-grouped by reason, so the owner is not asked once per reason. It is raised by more than one command (the Figma
 * ingest and, later, `ui ds import`): nothing here assumes which one is calling. The caller states each member's reason.
 * The member is the identity the door has (a variable id at the Figma door).
 */
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface UntypeableInput {
  items: { id: string; name: string; reason: string }[];
}

const LABELS: Record<string, string> = {
  "unmappable-type": "unmappable type",
  "null-leaf": "null value",
  "dangling-alias": "dangling alias",
  "alias-cycle": "alias cycle",
  "bad-colour": "bad colour",
  "ignored-key": "ignored `_` key",
  "not-token-group": "not a token group",
};
export const reasonLabel = (reason: string): string => LABELS[reason] ?? reason;

/** Per reason: how many, and up to three names. In a stable order. */
export function groupByReason(items: UntypeableInput["items"]): { reason: string; count: number; examples: string[] }[] {
  const groups = new Map<string, { count: number; examples: string[] }>();
  for (const i of items) {
    const g = groups.get(i.reason) ?? { count: 0, examples: [] };
    g.count++;
    if (g.examples.length < 3) g.examples.push(i.name);
    groups.set(i.reason, g);
  }
  return [...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([reason, g]) => ({ reason, ...g }));
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as UntypeableInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.items)) return null;
  return {
    kind: "untypeable-tokens",
    members: input.items.map((i) => i.id),
    domain: input.items.map((i) => i.id),
    ask(members) {
      const asked = new Set(members);
      const groups = groupByReason(input.items.filter((i) => asked.has(i.id)));
      const parts = groups.map((g) => `${reasonLabel(g.reason)} (${g.count}: ${g.examples.join(", ")}${g.count > g.examples.length ? ", …" : ""})`);
      return {
        question: `${members.length} variable(s) cannot become typed tokens: ${parts.join("; ")}. What happens to them?`,
        options: [
          { id: "keep-raw", label: "Keep them as raw string tokens", consequence: `${members.length} token(s) written under "raw" with their value as a string` },
          { id: "exclude", label: "Exclude them and record them", consequence: `${members.length} left out, counted per reason and named in the ledger` },
          { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${members.length} variable(s); you choose per variable` },
        ],
        evidence: { byReason: groups.map((g) => ({ reason: g.reason, count: g.count })) },
      };
    },
  };
}

export const untypeableTokensEmitter: KindEmitter = { kind: "untypeable-tokens", detect };
