// scripts/lib/freeze.mjs
//
// F6 — freeze custody and ordering, shared by the Phase-A gate (PR-031) and the
// post-reveal freeze check (PR-025).
//
// Codex Stage-5 BLOCKER #6: `FREEZE.json` was a loose `{file: hash}` object map, so
// a freeze could simply OMIT a vote or score file and the validator would happily
// verify the subset that was listed. And "both freeze commits are ancestors of
// HEAD" says nothing about ORDER — it does not prove votes froze before the curator
// scored, nor that either preceded the reveal.
//
// This module replaces both with:
//   * a schema'd envelope whose `files` list must EXACTLY equal its directory's
//     actual contents (no omissions, duplicates, extras, aliases, or symlinks);
//   * commit-derived ordering: votes freeze < curator freeze < first reveal, each a
//     STRICT ancestor, plus proof that no frozen file was touched after its freeze.
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import { SPEC_DIR_REL } from "./constants.mjs";
import { commitAdding, commitsTouching, gitOrNull, isAncestor, isStrictAncestor, safeReaddir, verifyEvidenceFile } from "./evidence.mjs";

export const VOTES_DIR = "runs/votes";
export const CURATOR_DIR = "runs/curator";
export const REVEAL_MAP = "runs/reveal/randomization-map.json";

/** Actual `*.json` payload files in a freeze directory (FREEZE.json excluded). */
function actualPayloadFiles(ctx, dirRel) {
  const entries = safeReaddir(ctx, dirRel);
  if (entries === null) return null;
  const out = [];
  for (const e of entries) {
    if (e.name === "FREEZE.json") continue;
    if (!e.name.endsWith(".json")) {
      out.push({ name: e.name, problem: "not a .json payload file" });
      continue;
    }
    if (e.isSymbolicLink()) {
      out.push({ name: e.name, problem: "is a symlink" });
      continue;
    }
    if (!e.isFile()) {
      out.push({ name: e.name, problem: "is not a regular file" });
      continue;
    }
    out.push({ name: e.name, problem: null });
  }
  return out;
}

/**
 * Verify one freeze envelope: schema, exact coverage, per-file hash + schema, and
 * the commit that created it.
 *
 * @param expectedNames  optional Set of file names the freeze MUST cover exactly
 *                       (the presentation/codename coverage the phase demands)
 * @returns {{findings: object[], freezeCommit: string|null, envelope: object|null, names: Set<string>}}
 */
export function verifyFreezeEnvelope(ctx, checkId, { dirRel, kind, phase, itemSchema, expectedNames }) {
  const findings = [];
  const names = new Set();
  const envelopeRel = `${dirRel}/FREEZE.json`;

  const schemaRes = ctx.readJSON("schemas/freeze-envelope.schema.json");
  const res = ctx.readJSON(envelopeRel);
  if (!res.ok) {
    findings.push(finding(checkId, "error", `missing/unreadable ${envelopeRel}: ${res.error}`, envelopeRel));
    return { findings, freezeCommit: null, envelope: null, names };
  }
  const envelope = res.data;
  if (schemaRes.ok) {
    for (const e of validate(envelope, schemaRes.data, "$")) findings.push(finding(checkId, "error", `${envelopeRel} ${e.path}: ${e.message}`, envelopeRel));
  } else {
    findings.push(finding(checkId, "error", `cannot read schemas/freeze-envelope.schema.json: ${schemaRes.error}`));
  }
  if (envelope.kind !== kind) findings.push(finding(checkId, "error", `${envelopeRel}: kind ${JSON.stringify(envelope.kind)} is not ${JSON.stringify(kind)}`, envelopeRel));
  if (envelope.phase !== phase) findings.push(finding(checkId, "error", `${envelopeRel}: phase ${JSON.stringify(envelope.phase)} is not ${JSON.stringify(phase)}`, envelopeRel));

  // --- the listed set, verified file by file --------------------------------
  const listed = Array.isArray(envelope.files) ? envelope.files : [];
  for (const item of listed) {
    const name = item?.file;
    if (typeof name !== "string") continue;
    if (names.has(name)) {
      findings.push(finding(checkId, "error", `${envelopeRel}: ${name} is listed more than once`, envelopeRel));
      continue;
    }
    names.add(name);
    const verified = verifyEvidenceFile(ctx, dirRel, `${dirRel}/${name}`, item.sha256);
    if (!verified.ok) {
      findings.push(finding(checkId, "error", `${envelopeRel}: ${name} — ${verified.error}`, `${dirRel}/${name}`));
      continue;
    }
    if (itemSchema) {
      const payload = ctx.readJSON(`${dirRel}/${name}`);
      if (!payload.ok) findings.push(finding(checkId, "error", `${dirRel}/${name}: ${payload.error}`, `${dirRel}/${name}`));
      else for (const e of validate(payload.data, itemSchema, "$")) findings.push(finding(checkId, "error", `${dirRel}/${name} ${e.path}: ${e.message}`, `${dirRel}/${name}`));
    }
  }

  // --- exact coverage of the directory --------------------------------------
  const actual = actualPayloadFiles(ctx, dirRel);
  if (actual === null) {
    findings.push(finding(checkId, "error", `${dirRel}/ does not exist or is unreadable`, dirRel));
  } else {
    for (const entry of actual) {
      if (entry.problem) {
        findings.push(finding(checkId, "error", `${dirRel}/${entry.name}: ${entry.problem}`, `${dirRel}/${entry.name}`));
        continue;
      }
      if (!names.has(entry.name)) {
        findings.push(finding(checkId, "error", `${dirRel}/${entry.name} exists but is not listed in FREEZE.json — a freeze that omits a file freezes nothing`, `${dirRel}/${entry.name}`));
      }
    }
    const actualNames = new Set(actual.filter((e) => !e.problem).map((e) => e.name));
    for (const name of names) {
      if (!actualNames.has(name)) findings.push(finding(checkId, "error", `${envelopeRel} lists ${name}, which does not exist in ${dirRel}/`, `${dirRel}/${name}`));
    }
  }

  // --- coverage against what the phase demands ------------------------------
  if (expectedNames) {
    for (const name of expectedNames) {
      if (!names.has(name)) findings.push(finding(checkId, "error", `${envelopeRel} does not cover required file ${name}`, name));
    }
    for (const name of names) {
      if (!expectedNames.has(name)) findings.push(finding(checkId, "error", `${envelopeRel} covers ${name}, which is not an expected ${kind} file for Phase ${phase}`, name));
    }
  }

  // --- custody: the commit that created this freeze -------------------------
  const repoRel = `${SPEC_DIR_REL}/${envelopeRel}`;
  const freezeCommit = commitAdding(ctx, repoRel);
  if (freezeCommit === null) {
    findings.push(finding(checkId, "error", `${envelopeRel} has no commit history — an uncommitted freeze proves no custody`, envelopeRel));
  } else {
    const revisions = commitsTouching(ctx, repoRel);
    if (revisions.length > 1) {
      findings.push(finding(checkId, "error", `${envelopeRel} has ${revisions.length} revisions — a freeze envelope is written once and never amended`, envelopeRel));
    }
    if (typeof envelope.evidence_commit === "string" && !isAncestor(ctx, envelope.evidence_commit, freezeCommit)) {
      findings.push(finding(checkId, "error", `${envelopeRel}: evidence_commit ${envelope.evidence_commit} is not an ancestor of the freeze commit ${freezeCommit}`, envelopeRel));
    }
    // Nothing frozen may move afterwards.
    for (const name of names) {
      const filePath = `${SPEC_DIR_REL}/${dirRel}/${name}`;
      const after = gitOrNull(["-C", ctx.repoRoot, "log", "--format=%H", `${freezeCommit}..HEAD`, "--", filePath], ctx.repoRoot);
      if (after !== null && after.trim() !== "") {
        findings.push(finding(checkId, "error", `${dirRel}/${name} was modified after its freeze commit ${freezeCommit}`, `${dirRel}/${name}`));
      }
    }
  }

  return { findings, freezeCommit, envelope, names };
}

/**
 * The custody ORDER the protocol requires (PREREGISTRATION.md §Reveal and records,
 * §Builder roles): the owner votes freeze strictly before the curator freeze — so
 * the curator cannot have seen a vote — and both freeze strictly before any reveal,
 * so neither judge could have seen an assignment.
 */
export function verifyFreezeOrdering(ctx, checkId, { votesCommit, curatorCommit }) {
  const findings = [];
  const revealCommit = commitAdding(ctx, `${SPEC_DIR_REL}/${REVEAL_MAP}`);

  if (votesCommit && curatorCommit) {
    if (!isStrictAncestor(ctx, votesCommit, curatorCommit)) {
      findings.push(
        finding(
          checkId,
          "error",
          `the owner-votes freeze (${votesCommit}) is not a strict ancestor of the curator freeze (${curatorCommit}) — votes must provably freeze first, and freezing both in one commit proves nothing`,
        ),
      );
    }
  }

  if (revealCommit) {
    for (const [label, commit] of [["owner-votes", votesCommit], ["curator", curatorCommit]]) {
      if (!commit) continue;
      if (!isStrictAncestor(ctx, commit, revealCommit)) {
        findings.push(finding(checkId, "error", `the ${label} freeze (${commit}) is not a strict ancestor of the reveal commit (${revealCommit}) — assignments were revealable before that freeze`));
      }
    }
    // The curator freeze commit's tree must not already carry the revealed map.
    if (curatorCommit) {
      const tree = gitOrNull(["-C", ctx.repoRoot, "ls-tree", "-r", "--name-only", curatorCommit], ctx.repoRoot);
      if (tree !== null && tree.split("\n").includes(`${SPEC_DIR_REL}/${REVEAL_MAP}`)) {
        findings.push(finding(checkId, "error", `the revealed randomization map already exists at the curator freeze commit ${curatorCommit} — the curator could see identity mappings`));
      }
    }
  }

  return { findings, revealCommit };
}
