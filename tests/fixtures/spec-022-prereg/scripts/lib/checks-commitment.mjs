// scripts/lib/checks-commitment.mjs
//
// PR-016, PR-017, PR-018 — randomization-commitment validity, commitment-precedes-
// render, and clean-tree checks (architecture §H). Split out of checks-render.mjs
// per Article IX / BUILD-CONTRACT follow-up: pure move, no behaviour change.
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import { git } from "./git.mjs";
import { FROZEN_FILES, SPEC_DIR_REL, ownerSecretMapPath } from "./constants.mjs";

function dirHasEntries(absPath) {
  try {
    return readdirSync(absPath).length > 0;
  } catch {
    return false;
  }
}

// PR-016 commitment-valid — commitment schema-valid; secret_map_location does not
// resolve inside the repo root (checked WITHOUT opening the secret file); counts
// are 16/20/36/36.
export function prCommitmentValid(ctx) {
  const findings = [];
  const dataRes = ctx.readJSON("randomization-commitment.json");
  if (!dataRes.ok) {
    findings.push(finding("PR-016", "error", `missing or unreadable randomization-commitment.json: ${dataRes.error}`));
    return findings;
  }
  const schemaRes = ctx.readJSON("schemas/randomization-commitment.schema.json");
  if (!schemaRes.ok) {
    findings.push(finding("PR-016", "error", `cannot read commitment schema: ${schemaRes.error}`));
    return findings;
  }
  for (const e of validate(dataRes.data, schemaRes.data)) {
    findings.push(finding("PR-016", "error", `randomization-commitment.json ${e.path}: ${e.message}`));
  }
  const loc = dataRes.data.secret_map_location;
  if (typeof loc === "string" && loc.length > 0) {
    const resolved = resolve(loc);
    const repoResolved = resolve(ctx.repoRoot);
    if (resolved === repoResolved || resolved.startsWith(repoResolved + sep)) {
      findings.push(finding("PR-016", "error", `secret_map_location resolves inside the repo root: ${loc}`));
    }
    // R7 (amendment item 7 / AC-11 refinement 2) — PR-016 requires an EXACT
    // match against the expanded absolute owner custody path
    // (~/.design-os/prereg-022/randomization-map.secret.json under the
    // process's real $HOME), not merely "some absolute path outside the
    // repo". Any commitment produced by a sandboxed AC-11 dry-run carries a
    // temp HOME and fails here deterministically, so a throwaway artifact can
    // never be committed as the real one. See constants.mjs for why a path
    // pin beats a hash blocklist. Each rejection shape gets its own distinct
    // message so its dedicated mutation test can target it precisely.
    const custody = ownerSecretMapPath(homedir());
    if (loc.startsWith("~")) {
      findings.push(finding("PR-016", "error", `secret_map_location must be the expanded absolute owner custody path, not a "~"-prefixed shorthand: ${loc} (expected ${custody})`));
    } else if (!isAbsolute(loc)) {
      findings.push(finding("PR-016", "error", `secret_map_location must be an absolute path, not a relative one: ${loc} (expected ${custody})`));
    } else if (resolved !== resolve(custody)) {
      findings.push(finding("PR-016", "error", `secret_map_location is not the owner-pinned custody path (expected ${custody}, got ${loc})`));
    }
  }
  return findings;
}

// PR-017 commitment-precedes-render — pre-render ONLY: runs/ absent or empty;
// post-phase-a and later: the commitment blob has had exactly one revision since it
// was first committed (git log --follow shows no later change).
//
// F3 fix: `post-phase-a` no longer takes the pre-render branch. Requiring an empty
// runs/ tree at the Phase-A gate meant a genuinely completed Phase A could never
// pass it (Codex Stage-5 BLOCKER #3). Phase-A evidence is EXPECTED there; PR-031
// owns what may and may not exist at that gate.
export function prCommitmentPrecedesRender(ctx) {
  const findings = [];
  if (ctx.mode === "pre-render") {
    if (ctx.isDir("runs") && dirHasEntries(ctx.abs("runs"))) {
      findings.push(finding("PR-017", "error", "runs/ is non-empty before render (pre-render requires it absent or empty)"));
    }
    return findings;
  }
  try {
    const log = git(["-C", ctx.repoRoot, "log", "--follow", "--format=%H", "--", `${SPEC_DIR_REL}/randomization-commitment.json`], ctx.repoRoot);
    const commits = log.split("\n").filter(Boolean);
    if (commits.length > 1) {
      findings.push(finding("PR-017", "error", `randomization-commitment.json has ${commits.length} revisions on record — it must never change after the commitment commit`));
    } else if (commits.length === 0) {
      findings.push(finding("PR-017", "error", "randomization-commitment.json has no commit history"));
    }
  } catch (err) {
    findings.push(finding("PR-017", "error", `cannot verify commitment immutability via git log: ${err.message}`));
  }
  return findings;
}

// PR-018 clean-tree — `git status --porcelain` empty; HEAD contains every frozen
// file.
export function prCleanTree(ctx) {
  const findings = [];
  try {
    const status = git(["-C", ctx.repoRoot, "status", "--porcelain"], ctx.repoRoot);
    if (status.trim() !== "") findings.push(finding("PR-018", "error", "git tree is not clean (git status --porcelain is non-empty)"));
  } catch (err) {
    findings.push(finding("PR-018", "error", `cannot run git status: ${err.message}`));
    return findings;
  }
  try {
    const headSet = new Set(git(["-C", ctx.repoRoot, "ls-tree", "-r", "--name-only", "HEAD"], ctx.repoRoot).split("\n"));
    for (const rel of FROZEN_FILES) {
      const repoRel = `${SPEC_DIR_REL}/${rel}`;
      if (!headSet.has(repoRel)) findings.push(finding("PR-018", "error", `HEAD does not contain frozen file: ${repoRel}`, repoRel));
    }
  } catch (err) {
    findings.push(finding("PR-018", "error", `cannot list HEAD tree: ${err.message}`));
  }
  return findings;
}
