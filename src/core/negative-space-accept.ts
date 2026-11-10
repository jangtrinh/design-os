/**
 * negative-space-accept.ts - `ui ds harvest-bans --accept <NS-id>`: the owner's act that promotes one
 * proposed machine rule. The only code that writes `_adherence.rules.json`, and only for an id the owner names.
 */
import { rmSync } from "node:fs";

import { parseAdherenceRules } from "./adherence-rules.js";
import { DSError } from "./design-system.js";
import { probeById } from "./negative-space-probes.js";
import { atomicWrite, bindingRulesPath, dumpRules, proposedRulesPath, readIfPresent } from "./negative-space-rule-files.js";

export interface AcceptIO { write: (path: string, text: string) => void }
const ID_RE = /^NS-(?:0[1-9]|1[0-2])$/;
export const defaultAcceptIO: AcceptIO = { write: atomicWrite };

/**
 * Promote one proposed machine rule: validate both files with the loader, append to the binding file,
 * then remove from the proposed file. Binding first: a crash between the two leaves the rule in both
 * files (recoverable, nothing lost), never in neither. A failure on the second write restores the first.
 * soul.md is not touched: the owner moves the bullet, and the next harvest keeps it, marked accepted,
 * until a line under the binding `## Never` names it.
 */
export function acceptProposal(designDir: string, id: string, io: AcceptIO = defaultAcceptIO): { id: string; rulesPath: string; proposedPath: string } {
  const bad = (msg: string): DSError => new DSError("BAD_ARG", msg);
  const def = ID_RE.test(id) ? probeById(id) : undefined;
  if (def === undefined) throw bad(`unknown probe id '${id}'. Probe ids run NS-01 to NS-12 ('ui ds harvest-bans --source <dir>' lists them).`);
  if (def.rule === undefined) {
    throw bad(`${id} is a bullet-only proposal: its machine rule comes with its rule kind in a later phase. To promote it now, move the bullet into '## Never' by hand.`);
  }
  const rulesPath = bindingRulesPath(designDir);
  const proposedPath = proposedRulesPath(designDir);
  const rulesText = readIfPresent(rulesPath);
  const proposedText = readIfPresent(proposedPath);
  if (rulesText !== undefined) parseAdherenceRules(rulesText, rulesPath, "binding");
  if (proposedText !== undefined) parseAdherenceRules(proposedText, proposedPath, "proposed");
  const rawRules = (text: string | undefined): Record<string, unknown>[] => (text === undefined ? [] : (JSON.parse(text.replace(/^\uFEFF/, "")) as { rules: Record<string, unknown>[] }).rules);
  if (rawRules(rulesText).some((r) => r["id"] === id)) {
    throw bad(`${id} is already promoted: its rule is in ${rulesPath}. Nothing was changed. If its bullet is still under '## Never (proposed)', move it under '## Never'.`);
  }
  const proposed = rawRules(proposedText);
  const rule = proposed.find((r) => r["id"] === id);
  if (rule === undefined) throw bad(`${id} is not in ${proposedPath}. Run 'ui ds harvest-bans --source <dir> --write' first, or the probe found the cliche.`);

  const nextRules = dumpRules([...rawRules(rulesText), rule]);
  parseAdherenceRules(nextRules, rulesPath, "binding"); // a duplicate id or an invalid merge stops here, before any write
  const nextProposed = dumpRules(proposed.filter((r) => r !== rule));

  io.write(rulesPath, nextRules);
  try { io.write(proposedPath, nextProposed); }
  catch (e) {
    try { if (rulesText === undefined) rmSync(rulesPath, { force: true }); else io.write(rulesPath, rulesText); }
    catch (restoreError) {
      throw new DSError("WRITE_ERROR", `accepting ${id} failed (${e instanceof Error ? e.message : String(e)}) and ${rulesPath} could not be restored (${restoreError instanceof Error ? restoreError.message : String(restoreError)}); remove ${id} from it by hand`);
    }
    throw e;
  }
  return { id, rulesPath, proposedPath };
}
