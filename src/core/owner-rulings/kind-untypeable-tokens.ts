/**
 * `untypeable-tokens` (FR-011): a variable or token is skipped for any reason other than a collision. One question,
 * sub-grouped by reason, so the owner is not asked once per reason. It is raised by more than one command (the Figma
 * ingest and, later, `ui ds import`): nothing here assumes which one is calling. The caller states each member's
 * reason. The member is the identity the door has (a variable id at the Figma door).
 *
 * The question is assigned: a member that has a value to keep may take `keep-raw` or `exclude`; a member skipped for an
 * alias reason, or whose value is an alias, has one outcome, `exclude` (a raw token would hold an alias object, which
 * no consumer can use). "Keep them as raw string tokens" therefore assigns `keep-raw` to the members that can be kept
 * and `exclude` to the rest, and says both counts.
 */
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { ClusterOption } from "./cluster.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface UntypeableItem {
  id: string;
  name: string;
  reason: string;
  /** The mode whose value failed, when it is not the base mode. */
  mode?: string;
  /** True when the owner may keep it as a raw string token. Default true. */
  keepable?: boolean;
}

export interface UntypeableInput {
  items: UntypeableItem[];
  /**
   * One sentence the calling door adds when no member has a value to keep, naming the earlier answer of its own flow
   * that would keep them. This kind knows no door, so it never words that advice itself.
   */
  hint?: string;
  /** What the door calls one member in the question; default "variable(s)" (the Figma door). */
  noun?: string;
  /** False at a door whose members have no modes, so the keep-raw consequence does not mention them. Default true. */
  modes?: boolean;
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

export const KEEP_RAW = "keep-raw";
export const EXCLUDE = "exclude";

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

const keepable = (i: UntypeableItem): boolean => i.keepable !== false;
const labelOf = (i: UntypeableItem): string => `${i.name}: ${reasonLabel(i.reason)}${i.mode === undefined ? "" : `, in mode ${i.mode}`}`;

function detect(raw: unknown): KindDetection | null {
  const input = raw as UntypeableInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.items)) return null;
  const by = new Map(input.items.map((i) => [i.id, i]));
  return {
    kind: "untypeable-tokens",
    members: input.items.map((i) => i.id),
    domain: input.items.map((i) => i.id),
    ask(members) {
      const asked = members.map((m) => by.get(m)).filter((i): i is UntypeableItem => i !== undefined);
      const groups = groupByReason(asked);
      const parts = groups.map((g) => `${reasonLabel(g.reason)} (${g.count}: ${g.examples.join(", ")}${g.count > g.examples.length ? ", …" : ""})`);
      const keepers = asked.filter(keepable);
      const none = keepers.length === 0;
      const noun = input.noun ?? "variable(s)";
      const options: ClusterOption[] = [];
      if (!none) {
        options.push({
          id: KEEP_RAW, label: "Keep them as raw string tokens",
          consequence: `${keepers.length} token(s) written under "raw" ${input.modes === false ? "as a string" : "with every mode as a string"}; ${asked.length - keepers.length} can only be excluded (${input.modes === false ? "an alias, an object or a null" : "an alias, an object or a single failing mode"} has no string to keep), counted per reason and named`,
          assigns: Object.fromEntries(asked.map((i) => [i.id, keepable(i) ? KEEP_RAW : EXCLUDE])),
        });
      }
      options.push({
        id: EXCLUDE, label: none ? "Exclude them" : "Exclude them and record them",
        consequence: `${asked.length} left out, counted per reason and named in the ledger`,
        assigns: Object.fromEntries(asked.map((i) => [i.id, EXCLUDE])),
      });
      options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} ${noun}; you choose per ${noun.replace("(s)", "")}` });
      const hint = none && input.hint !== undefined ? ` ${input.hint}` : "";
      return {
        question: `${asked.length} ${noun} cannot become typed tokens: ${parts.join("; ")}. What happens to them?${hint}`,
        options,
        memberChoices: Object.fromEntries(asked.map((i) => [i.id, keepable(i)
          ? [{ id: KEEP_RAW, label: "Keep as a raw string token" }, { id: EXCLUDE, label: "Exclude it" }]
          : [{ id: EXCLUDE, label: "Exclude it" }]])),
        labels: Object.fromEntries(asked.map((i) => [i.id, labelOf(i)])),
        evidence: { byReason: groups.map((g) => ({ reason: g.reason, count: g.count })) },
      };
    },
  };
}

export const untypeableTokensEmitter: KindEmitter = { kind: "untypeable-tokens", detect };
