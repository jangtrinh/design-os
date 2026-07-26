// scripts/lib/checks-judging.mjs
//
// PR-023, PR-024, PR-030 — blinding-leak scan, owner vote coverage, and curator
// blindness-shape checks (architecture §H). Split out of checks-render.mjs per
// Article IX / BUILD-CONTRACT follow-up: pure move, no behaviour change.
import { readdirSync } from "node:fs";
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import { CANDIDATE_IDS } from "./constants.mjs";
import { boundaryTokenRegex } from "./identity-tokens.mjs";

// Arm words. R4 (amendment item 4 / Fable B6) requires these be matched on word
// boundaries rather than a bare `.includes()` — a substring scan guaranteed FALSE
// errors on a correctly-blinded bundle (the ordinary English word "controls"
// contains "control"). Boundary matching, not scope restriction, is the fix: these
// tokens are still banned everywhere a judging bundle can carry text (filenames and
// content alike), matching PR-023's pre-amendment scope. Some committed briefs use
// "control"/"treatment" as ordinary nouns in their own prose (e.g. "a batch-approval
// control") — a real generated artifact that legitimately renders such brief text
// into a judging bundle would need a bundle-time rewrite to avoid tripping this
// check; that is a known residual risk for real (post-fixture) generation runs,
// out of r3's fixture-level scope, and is flagged in the build report rather than
// silently special-cased here.
const ARM_WORDS = ["control", "treatment"];

// Source and provider names are never ordinary English in this corpus, so they are
// banned everywhere, body copy included. R4: these stay plain substrings (long,
// distinctive, no legitimate partial-match risk) — only the SHORT/ordinary-word
// tokens (arm words, candidate IDs, asset ids) need boundary matching.
const SOURCE_TOKENS = ["mengto", "neuform"];

/**
 * F8: absence is a warning ONLY where the evidence genuinely cannot exist yet.
 * From the Phase-A gate onward, judging bundles, owner votes and curator scores are
 * required evidence — their absence is an error, not a quiet pass.
 */
function judgingRequired(ctx) {
  return ctx.mode === "post-phase-a" || ctx.mode === "post-render" || ctx.mode === "post-reveal";
}

function absence(ctx, checkId, message) {
  return finding(checkId, judgingRequired(ctx) ? "error" : "warning", judgingRequired(ctx) ? `${message} — required at --mode ${ctx.mode}` : message);
}

function walkFiles(absDir, relDir, visit) {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const childAbs = `${absDir}/${entry.name}`;
    const childRel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) walkFiles(childAbs, childRel, visit);
    else visit(childRel, entry.name);
  }
}

/** The full frozen media-identity universe: every committed asset_id and manifest path. */
function loadMediaIdentity(ctx) {
  const assetIds = [];
  const assetPaths = [];
  const assetsRes = ctx.readJSON("assets/brief-media-manifest.json");
  if (assetsRes.ok) {
    for (const a of assetsRes.data.assets || []) {
      if (typeof a?.asset_id === "string" && a.asset_id.length > 0) assetIds.push(a.asset_id);
      if (typeof a?.path === "string" && a.path.length > 0) assetPaths.push(a.path);
    }
  }
  return { assetIds, assetPaths };
}

// PR-023 blinding-leak-scan — over runs/judging/** recursively: filenames/paths
// are codename-only; file CONTENTS never carry arm/candidate/provider identity.
// The packager (build-judging-bundle.mjs) is not trusted by its own gate — this
// scans the OUTPUT independently.
export function prBlindingLeakScan(ctx) {
  const findings = [];
  if (!ctx.isDir("runs/judging")) {
    findings.push(absence(ctx, "PR-023", "runs/judging/ does not exist yet — nothing to scan"));
    return findings;
  }
  const candidateRes = ctx.readJSON("candidate-manifest.json");
  const candidateIds = candidateRes.ok ? (candidateRes.data.candidates || []).map((c) => c.candidate_id) : CANDIDATE_IDS;
  const manifestRes = ctx.readJSON("selection-manifest.json");
  const slugs = manifestRes.ok ? (manifestRes.data.records || []).map((r) => r.path.split("/")[2]) : [];
  const { assetIds, assetPaths } = loadMediaIdentity(ctx);

  // R4 (amendment item 4 / Fable B6) — every SHORT/ordinary-word identity token is
  // matched on WORD BOUNDARIES via the shared `identity-tokens.mjs` helper, never
  // with a bare `.includes()`. PR-009 learned this rule and wrote down the
  // rationale (checks-candidates.mjs: "do not revert to .includes()"); it was never
  // propagated to this second consumer, which is the repo's own "fix it at the
  // shared layer" lesson reproducing itself. Substring matching over short tokens
  // is guaranteed to produce FALSE errors on correctly-blinded bundles: candidate
  // IDs are hex digrams, so "a1"/"d2" fire inside any 8-hex codename and inside
  // `#1a1a1a`; "control" fires inside the ordinary English word "controls". A gate
  // that cries wolf on valid evidence is not a stricter gate, it is a broken one.
  const boundaryLabelled = [
    ...ARM_WORDS.map((t) => ({ token: t, label: `arm word "${t}"` })),
    ...candidateIds.filter((id) => typeof id === "string" && id.length > 0).map((id) => ({ token: id, label: `candidate label "${id}"` })),
    ...assetIds.map((id) => ({ token: id, label: `the committed asset id "${id}" — supplied assets must be neutrally renamed` })),
  ];

  // Long/distinctive values keep plain substring matching — a partial occurrence
  // is still a leak, and boundary semantics would only weaken the check. R4:
  // source/provider tokens and corpus slugs stay substring; the frozen manifest
  // paths (added here so brief-facts.md and rewritten HTML are covered) do too.
  const substringLabelled = [
    ...SOURCE_TOKENS.map((t) => ({ token: t, label: `source/provider token "${t}"` })),
    ...slugs.filter(Boolean).map((s) => ({ token: s, label: `corpus slug "${s}"` })),
    ...assetPaths.map((p) => ({ token: p, label: `a committed media path "${p}"` })),
    { token: "assets/brief-media", label: 'a "assets/brief-media" directory reference' },
  ];

  const scanText = (text, childRel, where) => {
    for (const { token, label } of boundaryLabelled) {
      if (boundaryTokenRegex(token).test(text)) findings.push(finding("PR-023", "error", `judging ${where} leaks ${label}: ${childRel}`, childRel));
    }
    for (const { token, label } of substringLabelled) {
      if (text.toLowerCase().includes(token.toLowerCase())) findings.push(finding("PR-023", "error", `judging ${where} leaks ${label}: ${childRel}`, childRel));
    }
  };

  walkFiles(ctx.abs("runs/judging"), "runs/judging", (childRel, name) => {
    scanText(childRel, childRel, "filename");
    if (/\.(html|md|txt|log|json|map)$/i.test(name)) {
      const textRes = ctx.readText(childRel);
      if (textRes.ok) {
        scanText(textRes.data, childRel, "content");
        if (/(href|src)=["']\/(?!\/)/i.test(textRes.data)) {
          findings.push(finding("PR-023", "error", `${childRel}: absolute-rooted internal link (must be relative)`, childRel));
        }
      }
    }
  });
  return findings;
}

// PR-024 vote-coverage — one schema-valid owner vote per expected presentation;
// every vote's codenames exist in judging bundles; reasons non-empty.
export function prVoteCoverage(ctx) {
  const findings = [];
  if (!ctx.isDir("runs/judging") || !ctx.isDir("runs/votes")) {
    findings.push(absence(ctx, "PR-024", "judging bundles or runs/votes/ not present yet — vote coverage not checked"));
    return findings;
  }
  const schemaRes = ctx.readJSON("schemas/owner-vote.schema.json");
  const judgingIds = readdirSync(ctx.abs("runs/judging"));
  const voteFiles = readdirSync(ctx.abs("runs/votes")).filter((f) => f.endsWith(".json") && f !== "FREEZE.json");

  for (const f of voteFiles) {
    const rel = `runs/votes/${f}`;
    const res = ctx.readJSON(rel);
    if (!res.ok) {
      findings.push(finding("PR-024", "error", `cannot read ${rel}: ${res.error}`, rel));
      continue;
    }
    if (schemaRes.ok) {
      for (const e of validate(res.data, schemaRes.data)) findings.push(finding("PR-024", "error", `${rel} ${e.path}: ${e.message}`, rel));
    }
    if (!res.data.reason || !String(res.data.reason).trim()) findings.push(finding("PR-024", "error", `${rel}: empty reason`, rel));
    if (!judgingIds.includes(res.data.presentation_id)) {
      findings.push(finding("PR-024", "error", `${rel}: presentation_id ${res.data.presentation_id} has no judging bundle`, rel));
    }
  }
  // Exact one-to-one coverage. A substring match ("f.includes(pid)") would let one
  // oddly-named file stand in for several presentations.
  const votedIds = new Set(voteFiles.map((f) => f.replace(/\.json$/, "")));
  for (const pid of judgingIds) {
    if (!votedIds.has(pid)) findings.push(finding("PR-024", "error", `no owner vote found for presentation ${pid} (expected runs/votes/${pid}.json)`, pid));
  }
  for (const voted of votedIds) {
    if (!judgingIds.includes(voted)) findings.push(finding("PR-024", "error", `owner vote runs/votes/${voted}.json has no judging bundle`, voted));
  }
  return findings;
}

// PR-030 curator-blindness-shape — curator score files reference codenames only;
// schema additionalProperties:false structurally forbids assignment/source/patch
// fields.
export function prCuratorBlindnessShape(ctx) {
  const findings = [];
  if (!ctx.isDir("runs/curator")) {
    findings.push(absence(ctx, "PR-030", "runs/curator/ does not exist yet"));
    return findings;
  }
  const schemaRes = ctx.readJSON("schemas/curator-score.schema.json");
  for (const f of readdirSync(ctx.abs("runs/curator")).filter((n) => n.endsWith(".json") && n !== "FREEZE.json")) {
    const rel = `runs/curator/${f}`;
    const res = ctx.readJSON(rel);
    if (!res.ok) {
      findings.push(finding("PR-030", "error", `cannot read ${rel}: ${res.error}`, rel));
      continue;
    }
    if (schemaRes.ok) {
      for (const e of validate(res.data, schemaRes.data)) findings.push(finding("PR-030", "error", `${rel} ${e.path}: ${e.message}`, rel));
    }
  }
  return findings;
}
