/**
 * `ambiguous-roles` (FR-011): `ui ds import` asks for the role of every colour token whose name ties between two or
 * more roles (`recognizeRoles` flags it and never guesses). The member is the token path, `category.name`; the
 * outcome names the role the owner gives it (a canonical role, or `none` to leave it without one), so a ruling
 * survives a reorder of the file and a rename is a new member. The answer is applied through `ui ds set-role`.
 *
 * Single-choice, assigned: one outcome per token. There is no recommended role: a tie is the case where the name
 * cannot decide, so the options are "leave them all without a role" and the per-token sheet.
 */
import { CANONICAL_ROLES } from "../role-recognition.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { MemberChoice } from "./cluster.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface AmbiguousRolesInput {
  /** Token paths (`category.name`) that `recognizeRoles` reported as ambiguous. */
  ambiguous: string[];
}

export const NO_ROLE = "none";
export const LEAVE_UNASSIGNED = "leave-unassigned";

const leafOf = (path: string): string => path.slice(path.indexOf(".") + 1);

const CHOICES: MemberChoice[] = [
  ...CANONICAL_ROLES.map((r) => ({ id: r, label: `Role ${r}` })),
  { id: NO_ROLE, label: "Leave it without a role" },
];

function detect(raw: unknown): KindDetection | null {
  const input = raw as AmbiguousRolesInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.ambiguous)) return null;
  return {
    kind: "ambiguous-roles",
    members: input.ambiguous,
    domain: input.ambiguous,
    ask(members) {
      const shown = members.slice(0, 5).join(", ");
      return {
        question: `${members.length} colour token(s) tie between roles, so the name alone cannot decide: ${shown}${members.length > 5 ? ", …" : ""}. Which role does each play?`,
        options: [
          {
            id: LEAVE_UNASSIGNED, label: "Leave them without a role",
            consequence: `${members.length} token(s) are written with no role and counted as gaps; nothing is guessed, and ui ds set-role can give one later`,
            assigns: Object.fromEntries(members.map((m) => [m, NO_ROLE])),
          },
          { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${members.length} token(s); you give each a role, applied through ui ds set-role` },
        ],
        memberChoices: Object.fromEntries(members.map((m) => [m, CHOICES])),
        labels: Object.fromEntries(members.map((m) => [m, leafOf(m)])),
      };
    },
  };
}

export const ambiguousRolesEmitter: KindEmitter = { kind: "ambiguous-roles", detect };
