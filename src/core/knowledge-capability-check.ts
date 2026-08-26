import { parseCapabilityCatalog } from "./capability-activation.js";
import type { CapabilityProfile } from "./capability-activation.js";
import type { KnowledgeFinding } from "./knowledge-lint.js";

export interface CapabilityCheckInput {
  catalogJson: string | null;
  knowledgeIndexJson: string | null;
  needRoutingMd: string | null;
  workflowVerbs: readonly string[];
  commandNames: readonly string[];
  repoFiles: readonly string[];
}

const finding = (checkId: string, message: string): KnowledgeFinding =>
  ({ checkId, severity: "error", message });
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function capabilityChecks(input: CapabilityCheckInput): KnowledgeFinding[] {
  if (input.catalogJson === null) {
    return [finding("capability-catalog-missing", "knowledge/capability-profiles.json is missing")];
  }
  const parsed = parseCapabilityCatalog(input.catalogJson);
  if (!parsed.ok) return [finding("capability-catalog-bad", parsed.message)];
  const out: KnowledgeFinding[] = [];
  const ids = new Set<string>();
  const knowledgeIds = indexIds(input.knowledgeIndexJson);
  const routedProfiles = surfaceProfiles(input.needRoutingMd, input.workflowVerbs);
  for (const profile of parsed.catalog.profiles) {
    if (ids.has(profile.id)) out.push(finding("capability-profile-duplicate", `duplicate capability '${profile.id}'`));
    ids.add(profile.id);
    checkProfile(profile, input, knowledgeIds, out);
    const routed = routedProfiles.get(profile.id);
    if (routed === undefined) {
      out.push(finding("capability-routing-uncovered", `capability '${profile.id}' has no Surface activation table row`));
    } else {
      if (routed.status !== profile.status) out.push(finding("capability-routing-status-drift", `'${profile.id}' status differs between table and catalog`));
      if (routed.route !== profile.workflow) out.push(finding("capability-routing-route-drift", `'${profile.id}' route differs between table and catalog`));
    }
  }
  for (const routed of routedProfiles.keys()) {
    if (!ids.has(routed)) out.push(finding("capability-routing-unknown", `surface table names unknown capability '${routed}'`));
  }
  return out;
}

function checkProfile(
  profile: CapabilityProfile,
  input: CapabilityCheckInput,
  knowledgeIds: Set<string>,
  out: KnowledgeFinding[],
): void {
  const requiredKnowledge = strings(profile.requiredKnowledge);
  const machineWitnesses = strings(profile.machineWitnesses);
  const renderedWitnesses = strings(profile.renderedWitnesses);
  const manualWitnesses = strings(profile.manualWitnesses);

  if (profile.status === "qualified") {
    if (profile.workflow === null || !input.workflowVerbs.includes(profile.workflow)) {
      out.push(finding("capability-workflow-unknown", `qualified capability '${profile.id}' names unknown workflow '${profile.workflow}'`));
    }
    for (const witness of machineWitnesses) {
      if (!input.commandNames.includes(witness)) out.push(finding("capability-witness-unknown", `'${profile.id}' names unknown machine witness '${witness}'`));
    }
    if (requiredKnowledge.length === 0 || machineWitnesses.length === 0 ||
        renderedWitnesses.length === 0 || manualWitnesses.length === 0) {
      out.push(finding("capability-qualified-incomplete", `qualified capability '${profile.id}' needs knowledge and all witness classes`));
    }
    if (typeof profile.qualificationEvidence !== "string" || !input.repoFiles.includes(profile.qualificationEvidence)) {
      out.push(finding("capability-evidence-missing", `'${profile.id}' qualificationEvidence does not resolve`));
    }
  } else {
    if (profile.workflow !== null) out.push(finding("capability-unqualified-route", `unqualified capability '${profile.id}' must have workflow:null`));
    if (profile.refusalCode !== "CAPABILITY_UNQUALIFIED" || typeof profile.action !== "string" ||
        strings(profile.qualificationRequirements).length === 0) {
      out.push(finding("capability-refusal-incomplete", `unqualified capability '${profile.id}' needs refusalCode, action and qualificationRequirements`));
    }
  }
  const references = [...requiredKnowledge, ...strings(profile.advisoryKnowledge)];
  for (const id of references) {
    if (!knowledgeIds.has(id)) out.push(finding("capability-knowledge-unknown", `'${profile.id}' names unknown knowledge id '${id}'`));
  }
}

function indexIds(raw: string | null): Set<string> {
  if (raw === null) return new Set();
  try {
    const value = JSON.parse(raw) as { entries?: Array<{ id?: unknown }> };
    return new Set((value.entries ?? []).map((entry) => entry.id).filter((id): id is string => typeof id === "string"));
  } catch { return new Set(); }
}

function surfaceProfiles(
  md: string | null,
  workflowVerbs: readonly string[],
): Map<string, { status: string; route: string | null }> {
  if (md === null) return new Map();
  const heading = /^## Surface activation table\s*$/m.exec(md);
  if (heading === null) return new Map();
  const rest = md.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(rest);
  const section = next === null ? rest : rest.slice(0, next.index);
  const profiles = new Map<string, { status: string; route: string | null }>();
  for (const row of section.split("\n")) {
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const id = /^`([a-z0-9-]+)`$/.exec(cells[0] ?? "")?.[1];
    if (id === undefined) continue;
    const status = cells[1] ?? "";
    const route = [...(cells[2] ?? "").matchAll(/`([a-z0-9-]+)`/g)]
      .map((match) => match[1] as string).find((candidate) => workflowVerbs.includes(candidate)) ?? null;
    profiles.set(id, { status, route });
  }
  return profiles;
}
