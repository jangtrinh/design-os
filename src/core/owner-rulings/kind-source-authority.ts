/**
 * `source-authority` (FR-011): the sealed store and a second token source both exist and differ (the case of
 * `jangtrinh/design-os#211`). The question names both files and the measured difference and asks which one is the
 * source of truth. The member is the file, project-relative, so the answer names what it keeps by identity: no option
 * says "the first", and a reorder changes nothing. Single-choice, assigned: each option gives the two files one
 * outcome each, `authoritative` and `not-authoritative`; the per-file sheet is checked so exactly one file is
 * authoritative. The answer is stored; this spec does not change what `reseal` or the harvest do with it.
 *
 * It is the same condition `ui design lint` reports as `two-token-sources`: one function in design-token-sources.ts
 * answers it for both, over the same view of the project. `sense` reads the view; `detect` is pure over its result.
 */
import { existsSync } from "node:fs";
import { loadProjectView } from "../design-dir-scan.js";
import { SEALED_STORE, SECOND_SOURCE, diffTokenSources, loadDesignDirSchema, readDerived, tokenSourceConflict, tokenSourceInput } from "../design-token-sources.js";
import type { TokenSourceInput } from "../design-token-sources.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { Cluster, MemberChoice } from "./cluster.js";
import type { AnswerCheckRefusal, KindDetection, KindEmitter } from "./kind-emitter.js";

export { SEALED_STORE, SECOND_SOURCE };
export const AUTHORITATIVE = "authoritative";
export const NOT_AUTHORITATIVE = "not-authoritative";

export type SourceAuthorityInput = TokenSourceInput;

const CHOICES: MemberChoice[] = [{ id: AUTHORITATIVE, label: "This file is the source" }, { id: NOT_AUTHORITATIVE, label: "This file is not the source" }];
const count = (n: number): string => `${n} ${n === 1 ? "token" : "tokens"}`;

function detect(raw: unknown): KindDetection | null {
  const input = raw as SourceAuthorityInput | null;
  if (input === null || typeof input !== "object" || typeof input.sealedText !== "string" || typeof input.otherText !== "string") return null;
  const members = [SEALED_STORE, SECOND_SOURCE];
  return {
    kind: "source-authority",
    members: tokenSourceConflict(input) === null ? [] : members,
    domain: members,
    ask() {
      const d = diffTokenSources(input.sealedText, input.otherText);
      if (d === null) throw new Error("source-authority asked about two token files that cannot be compared");
      const settles = (kept: string, dropped: string, lost: number): string =>
        `${kept} stays the source; ${dropped} is not: its ${count(lost)} that ${kept} lacks and the ${d.differentValue} value(s) that differ are not carried; the answer is stored and neither file is changed`;
      return {
        question: `${SEALED_STORE} (the sealed store, ${count(d.sealedTokens)}) and ${SECOND_SOURCE} (${count(d.otherTokens)}) both exist and differ: ${d.onlyInSealed} only in the store, ${d.onlyInOther} only in ${SECOND_SOURCE}, ${d.differentValue} with a different value. Which one is the source?`,
        options: [
          { id: `authority:${SEALED_STORE}`, label: `${SEALED_STORE} is the source`, consequence: settles(SEALED_STORE, SECOND_SOURCE, d.onlyInOther), assigns: { [SEALED_STORE]: AUTHORITATIVE, [SECOND_SOURCE]: NOT_AUTHORITATIVE } },
          { id: `authority:${SECOND_SOURCE}`, label: `${SECOND_SOURCE} is the source`, consequence: settles(SECOND_SOURCE, SEALED_STORE, d.onlyInSealed), assigns: { [SEALED_STORE]: NOT_AUTHORITATIVE, [SECOND_SOURCE]: AUTHORITATIVE } },
          { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: "a sheet lists the two files; you mark exactly one as the source" },
        ],
        memberChoices: { [SEALED_STORE]: CHOICES, [SECOND_SOURCE]: CHOICES },
        labels: { [SEALED_STORE]: `the sealed store, ${count(d.sealedTokens)}`, [SECOND_SOURCE]: `the second source, ${count(d.otherTokens)}` },
        evidence: { onlyInSealed: d.onlyInSealed, onlyInOther: d.onlyInOther, differentValue: d.differentValue },
      };
    },
  };
}

/** The per-file answer must name exactly one source: two sources, or none, is the question again. */
function checkAnswer(cluster: Cluster, outcomes: Record<string, string>): AnswerCheckRefusal | null {
  const named = cluster.members.filter((m) => outcomes[m] === AUTHORITATIVE);
  if (named.length === 1) return null;
  return { code: "BAD_ANSWER", message: `exactly one file is the source: this answer names ${named.length}. Mark one of ${cluster.members.join(", ")} as "${AUTHORITATIVE}" and the other "${NOT_AUTHORITATIVE}"` };
}

/** The same view and the same condition as `ui design lint`: see design-token-sources.ts. Null when there is one source. */
function sense(projectDir: string): SourceAuthorityInput | null {
  if (!existsSync(projectDir)) return null; // a project that does not exist yet has no token files
  const view = loadProjectView(projectDir);
  return tokenSourceInput(view, readDerived(view, loadDesignDirSchema()).derived);
}

export const sourceAuthorityEmitter: KindEmitter = { kind: "source-authority", sense, detect, checkAnswer };
