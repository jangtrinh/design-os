// scripts/lib/checks-reveal.mjs
//
// PR-025, PR-026 — post-reveal freeze custody and commitment match. PR-027..PR-029
// now live in checks-results.mjs (they grew a real recomputation engine); this file
// re-exports them so validate-prereg.mjs's import surface is unchanged.
//
// F6 rebuild: freeze coverage and ORDER are proven, not assumed. The previous
// implementation accepted any `{file: hash}` object — including one that omitted
// files — and proved only that both freeze commits were ancestors of HEAD, which
// says nothing about whether votes froze before the curator scored, or whether
// either preceded the reveal (Codex Stage-5 BLOCKER #6).
import { finding } from "./findings.mjs";
import { EXPECTED_TOTAL_PRESENTATIONS, parseRandomizationMap } from "./randomization-map.mjs";
import { loadFrozenInputs } from "./frozen-inputs.mjs";
import { CURATOR_DIR, REVEAL_MAP, VOTES_DIR, verifyFreezeEnvelope, verifyFreezeOrdering } from "./freeze.mjs";
import { enumerateArmDirs, safeReaddir } from "./evidence.mjs";

export { prResultRecompute, prTruthTable, prAllCandidatesAdvance } from "./checks-results.mjs";

// ---------------------------------------------------------------------------
// PR-025 freeze-order
// ---------------------------------------------------------------------------

// R9 (amendment item 9) — reveal evidence is REQUIRED at --mode post-reveal
// (that mode exists specifically to gate on it); absence there is an error,
// not a quiet warning. At every earlier mode a reveal genuinely cannot exist
// yet, so absence stays a warning.
function revealRequired(ctx) {
  return ctx.mode === "post-reveal";
}

export function prFreezeOrder(ctx) {
  const findings = [];
  if (!ctx.isDir("runs/reveal")) {
    findings.push(
      finding(
        "PR-025",
        revealRequired(ctx) ? "error" : "warning",
        revealRequired(ctx) ? `runs/reveal/ does not exist — reveal evidence is required at --mode ${ctx.mode}` : "runs/reveal/ does not exist — freeze-order not applicable yet",
      ),
    );
    return findings;
  }

  const frozen = loadFrozenInputs(ctx);
  const voteSchemaRes = ctx.readJSON("schemas/owner-vote.schema.json");
  const curatorSchemaRes = ctx.readJSON("schemas/curator-score.schema.json");

  // Expected coverage at full reveal: every presentation of every RENDERED pair,
  // and two curator codenames per endpoint-primary presentation of those pairs.
  //
  // Scoped to rendered pairs, not to the whole map: the map commits all 56
  // presentations up front, but Phase B renders only the surviving families' pairs.
  // A program where no family survives legitimately judges 20 presentations, and
  // demanding 56 votes there would fail a correct reveal. What must never happen is
  // the reverse — a rendered pair with no vote — and that is exactly what this set
  // enforces.
  const renderedPairs = new Set(enumerateArmDirs(ctx, ["A", "B"]).filter((d) => !d.malformed).map((d) => d.pairId));
  const expectedVoteNames = new Set();
  const expectedCuratorNames = new Set();
  const mapRes = ctx.readBytes(REVEAL_MAP);
  if (mapRes.ok && frozen.commitment) {
    const parsed = parseRandomizationMap(mapRes.data, frozen.commitment);
    for (const p of parsed.presentations) {
      if (!renderedPairs.has(p?.pair_id)) continue;
      if (typeof p?.presentation_id === "string") expectedVoteNames.add(`${p.presentation_id}.json`);
      if (p?.endpoint_primary === true) {
        expectedCuratorNames.add(`${p.left_code}.json`);
        expectedCuratorNames.add(`${p.right_code}.json`);
      }
    }
  }

  const phase = inferRevealPhase(ctx);
  const votesFreeze = verifyFreezeEnvelope(ctx, "PR-025", {
    dirRel: VOTES_DIR,
    kind: "votes",
    phase,
    itemSchema: voteSchemaRes.ok ? voteSchemaRes.data : null,
    expectedNames: expectedVoteNames.size > 0 ? expectedVoteNames : null,
  });
  findings.push(...votesFreeze.findings);

  const curatorFreeze = verifyFreezeEnvelope(ctx, "PR-025", {
    dirRel: CURATOR_DIR,
    kind: "curator",
    phase,
    itemSchema: curatorSchemaRes.ok ? curatorSchemaRes.data : null,
    expectedNames: expectedCuratorNames.size > 0 ? expectedCuratorNames : null,
  });
  findings.push(...curatorFreeze.findings);

  const ordering = verifyFreezeOrdering(ctx, "PR-025", {
    votesCommit: votesFreeze.freezeCommit,
    curatorCommit: curatorFreeze.freezeCommit,
  });
  findings.push(...ordering.findings);
  if (ordering.revealCommit === null) {
    findings.push(finding("PR-025", "error", `${REVEAL_MAP} has no commit history — a reveal that was never committed has no provable ordering against the freezes`, REVEAL_MAP));
  }

  return findings;
}

/**
 * A full reveal covers Phase B; a Phase-A-only reveal would be an early reveal and
 * is caught by PR-031. The envelope's own `phase` is compared against whether any
 * Phase-B evidence exists.
 */
function inferRevealPhase(ctx) {
  const entries = safeReaddir(ctx, "runs/phase-b");
  return entries !== null && entries.length > 0 ? "B" : "A";
}

// ---------------------------------------------------------------------------
// PR-026 commitment-match
// ---------------------------------------------------------------------------

export function prCommitmentMatch(ctx) {
  const findings = [];
  if (!ctx.exists(REVEAL_MAP)) {
    findings.push(
      finding(
        "PR-026",
        revealRequired(ctx) ? "error" : "warning",
        revealRequired(ctx) ? `${REVEAL_MAP} does not exist — reveal evidence is required at --mode ${ctx.mode}` : `${REVEAL_MAP} does not exist yet`,
      ),
    );
    return findings;
  }
  const frozen = loadFrozenInputs(ctx);
  if (!frozen.commitment) {
    findings.push(finding("PR-026", "error", "cannot read randomization-commitment.json — the revealed map cannot be matched against any commitment"));
    return findings;
  }
  const bytes = ctx.readBytes(REVEAL_MAP);
  if (!bytes.ok) {
    findings.push(finding("PR-026", "error", `cannot read ${REVEAL_MAP}: ${bytes.error}`, REVEAL_MAP));
    return findings;
  }

  const parsed = parseRandomizationMap(bytes.data, frozen.commitment);
  for (const e of parsed.errors) findings.push(finding("PR-026", "error", e, REVEAL_MAP));
  if (parsed.ok && parsed.presentations.length !== EXPECTED_TOTAL_PRESENTATIONS) {
    findings.push(finding("PR-026", "error", `revealed map has ${parsed.presentations.length} presentations, expected ${EXPECTED_TOTAL_PRESENTATIONS}`, REVEAL_MAP));
  }
  return findings;
}
