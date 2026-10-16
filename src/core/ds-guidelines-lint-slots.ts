/**
 * DS Guidelines Pack — slot and knowledge lint for one rendered file (pure, no fs).
 *
 *   SCENARIO_INCOMPLETE  error    an answer that has some of Do / Don't / Why but not all three
 *   OPEN_QUESTION        warning  a slot with no answer yet (the canonical pack allows these)
 *   UNBOUND_KNOWLEDGE    warning  host-written text cites a knowledge file with no gap id, or a gap
 *                                 id that is not measured in this pack (D8: knowledge only as the
 *                                 answer to a gap)
 */
import type { Finding } from "./ds-guidelines-lint.js";
import { hostWrittenLines } from "./ds-guidelines-render.js";
import { parseSlots } from "./ds-guidelines-slots.js";

const KNOWLEDGE_CITATION = /knowledge\/[A-Za-z0-9._/-]+\.md/;
/** A gap id always ends on an alphanumeric, so a sentence-ending dot is not part of it. */
const GAP_ID = /gap\.[A-Za-z0-9._-]*[A-Za-z0-9]/g;

export interface SlotLintResult {
  findings: Finding[];
  /** Slots without a complete answer (open + partial). */
  openQuestions: number;
}

/** `gapIds` = the gaps the manifest recorded; undefined when no manifest could be read. */
export function lintSlots(file: string, text: string, gapIds: ReadonlySet<string> | undefined): SlotLintResult {
  const findings: Finding[] = [];
  let openQuestions = 0;
  for (const slot of parseSlots(text)) {
    if (slot.status === "filled") continue;
    openQuestions++;
    if (slot.status === "partial") {
      findings.push({
        code: "SCENARIO_INCOMPLETE", severity: "error", file, line: slot.line,
        message: `slot '${slot.id}' answer is missing ${slot.missing.join(", ")} — a filled slot needs **Do:**, **Don't:** and **Why:**`,
      });
    } else {
      findings.push({
        code: "OPEN_QUESTION", severity: "warning", file, line: slot.line,
        message: `slot '${slot.id}' is unanswered — add **Do:**, **Don't:** and **Why:** lines under it`,
      });
    }
  }

  for (const { line, text: t } of hostWrittenLines(text)) {
    const cited = KNOWLEDGE_CITATION.exec(t)?.[0];
    if (cited === undefined) continue;
    const ids = [...t.matchAll(GAP_ID)].map((m) => m[0]);
    if (ids.length === 0) {
      findings.push({
        code: "UNBOUND_KNOWLEDGE", severity: "warning", file, line,
        message: `cites ${cited} without a gap id — knowledge enters the pack only as the answer to a measured gap`,
      });
      continue;
    }
    for (const id of ids) {
      if (gapIds !== undefined && !gapIds.has(id)) {
        findings.push({
          code: "UNBOUND_KNOWLEDGE", severity: "warning", file, line,
          message: `cites ${cited}, but '${id}' is not a measured gap in this pack`,
        });
      }
    }
  }
  return { findings, openQuestions };
}
