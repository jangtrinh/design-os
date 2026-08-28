import { parseCapabilityCatalog } from "./capability-catalog.js";
import type { CapabilityProfile } from "./capability-catalog.js";
import type { KnowledgeFinding } from "./knowledge-lint.js";

export interface CapabilityCheckInput {
  catalogJson: string | null;
  knowledgeIndexJson: string | null;
  needRoutingMd: string | null;
  workflowVerbs: readonly string[];
  commandNames: readonly string[];
  repoFiles: readonly string[];
}

interface SurfaceProfile {
  availability: string;
  assurance: string;
  route: string | null;
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
  if (!parsed.ok) {
    const checkId = parsed.code === "CAPABILITY_PROFILE_DUPLICATE"
      ? "capability-profile-duplicate"
      : parsed.code === "CAPABILITY_PROFILE_POLICY"
        ? "capability-profile-policy-mismatch"
        : "capability-catalog-bad";
    return [finding(checkId, parsed.message)];
  }

  const out: KnowledgeFinding[] = [];
  const ids = new Set<string>();
  const knowledgeIds = indexIds(input.knowledgeIndexJson);
  const routedProfiles = surfaceProfiles(input.needRoutingMd, input.workflowVerbs);
  for (const profile of parsed.catalog.profiles) {
    if (ids.has(profile.id)) out.push(finding("capability-profile-duplicate", `duplicate capability '${profile.id}'`));
    ids.add(profile.id);
    checkProfile(profile, input, knowledgeIds, out);
    checkRouting(profile, routedProfiles.get(profile.id), out);
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

  if (profile.availability === "available") {
    if (profile.workflow === null || !input.workflowVerbs.includes(profile.workflow)) {
      out.push(finding("capability-workflow-unknown", `available capability '${profile.id}' names unknown workflow '${profile.workflow}'`));
    }
    for (const witness of machineWitnesses) {
      if (!input.commandNames.includes(witness)) out.push(finding("capability-witness-unknown", `'${profile.id}' names unknown machine witness '${witness}'`));
    }
    if (requiredKnowledge.length === 0 || machineWitnesses.length === 0 ||
        renderedWitnesses.length === 0 || manualWitnesses.length === 0) {
      out.push(finding("capability-available-incomplete", `available capability '${profile.id}' needs knowledge and all witness classes`));
    }
    if (!evidenceExists(profile.assuranceEvidence, input.repoFiles)) {
      out.push(finding("capability-evidence-missing", `'${profile.id}' assuranceEvidence does not resolve`));
    }
  } else if (profile.workflow !== null || profile.assurance !== "unassessed" ||
      profile.refusalCode !== "CAPABILITY_UNQUALIFIED" || typeof profile.action !== "string" ||
      strings(profile.qualificationRequirements).length === 0) {
    out.push(finding("capability-refusal-incomplete", `unavailable capability '${profile.id}' needs a typed refusal and recovery action`));
  }

  for (const id of [...requiredKnowledge, ...strings(profile.advisoryKnowledge)]) {
    if (!knowledgeIds.has(id)) out.push(finding("capability-knowledge-unknown", `'${profile.id}' names unknown knowledge id '${id}'`));
  }
}

function checkRouting(profile: CapabilityProfile, routed: SurfaceProfile | undefined, out: KnowledgeFinding[]): void {
  if (routed === undefined) {
    out.push(finding("capability-routing-uncovered", `capability '${profile.id}' has no Surface activation table row`));
    return;
  }
  if (routed.availability !== profile.availability) {
    out.push(finding("capability-routing-availability-drift", `'${profile.id}' availability differs between table and catalog`));
  }
  if (routed.assurance !== profile.assurance) {
    out.push(finding("capability-routing-assurance-drift", `'${profile.id}' assurance differs between table and catalog`));
  }
  if (routed.route !== profile.workflow) {
    out.push(finding("capability-routing-route-drift", `'${profile.id}' route differs between table and catalog`));
  }
}

function evidenceExists(reference: unknown, repoFiles: readonly string[]): boolean {
  return typeof reference === "string" && repoFiles.includes(reference.split("#", 1)[0] ?? "");
}

function indexIds(raw: string | null): Set<string> {
  if (raw === null) return new Set();
  try {
    const value = JSON.parse(raw) as { entries?: Array<{ id?: unknown }> };
    return new Set((value.entries ?? []).map((entry) => entry.id).filter((id): id is string => typeof id === "string"));
  } catch { return new Set(); }
}

function surfaceProfiles(md: string | null, workflowVerbs: readonly string[]): Map<string, SurfaceProfile> {
  if (md === null) return new Map();
  const heading = /^## Surface activation table\s*$/m.exec(md);
  if (heading === null) return new Map();
  const rest = md.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(rest);
  const section = next === null ? rest : rest.slice(0, next.index);
  const profiles = new Map<string, SurfaceProfile>();
  for (const row of section.split("\n")) {
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const id = /^`([a-z0-9-]+)`$/.exec(cells[0] ?? "")?.[1];
    if (id === undefined) continue;
    const v2 = cells.length >= 4;
    const availability = v2 ? cells[1] ?? "" : legacyAvailability(cells[1] ?? "");
    const assurance = v2 ? cells[2] ?? "" : legacyAssurance(cells[1] ?? "");
    const routeCell = v2 ? cells[3] ?? "" : cells[2] ?? "";
    const route = [...routeCell.matchAll(/`([a-z0-9-]+)`/g)]
      .map((match) => match[1] as string).find((candidate) => workflowVerbs.includes(candidate)) ?? null;
    profiles.set(id, { availability, assurance, route });
  }
  return profiles;
}

function legacyAvailability(status: string): string {
  return status === "qualified" ? "available" : status === "unqualified" ? "unavailable" : status;
}

function legacyAssurance(status: string): string {
  return status === "qualified" ? "qualified" : status === "unqualified" ? "unassessed" : status;
}
