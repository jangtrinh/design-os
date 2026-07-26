// scripts/lib/checks-candidates.mjs
//
// PR-007..PR-010 — candidate-manifest, patch-integrity, banned-token scan, and
// family-separation checks (architecture §H). Split out of checks-freeze.mjs per
// Article IX / BUILD-CONTRACT follow-up: pure move, no behaviour change. The
// PR-009 case-insensitive / word-boundary token matching is carried over exactly
// as fixed by the coordinator — do not revert to `.includes()`.
import { readdirSync } from "node:fs";
import { finding } from "./findings.mjs";
import { sha256Hex } from "./hash.mjs";
import { CANDIDATE_IDS, CANDIDATE_FAMILY, PHASE_A_FAMILY_PATCHES } from "./constants.mjs";
import { boundaryTokenRegex } from "./identity-tokens.mjs";

// PR-007 candidates-frozen — exactly 12 candidates, exact ID set, families
// correct, every source_path present in selection manifest with disposition
// selected and matching sha256.
export function prCandidatesFrozen(ctx) {
  const findings = [];
  const candidateRes = ctx.readJSON("candidate-manifest.json");
  const manifestRes = ctx.readJSON("selection-manifest.json");
  if (!candidateRes.ok) return findings;
  const candidates = candidateRes.data.candidates || [];
  if (candidates.length !== 12) findings.push(finding("PR-007", "error", `expected exactly 12 candidates, got ${candidates.length}`));
  const seen = new Set();
  for (const c of candidates) {
    seen.add(c.candidate_id);
    if (CANDIDATE_FAMILY[c.candidate_id] && c.family !== CANDIDATE_FAMILY[c.candidate_id]) {
      findings.push(finding("PR-007", "error", `${c.candidate_id}: family is ${c.family}, expected ${CANDIDATE_FAMILY[c.candidate_id]}`, c.candidate_id));
    }
  }
  for (const id of CANDIDATE_IDS) if (!seen.has(id)) findings.push(finding("PR-007", "error", `missing candidate ${id}`, id));

  if (manifestRes.ok) {
    const bySelPath = new Map((manifestRes.data.records || []).map((r) => [r.path, r]));
    for (const c of candidates) {
      (c.source_paths || []).forEach((p, i) => {
        const rec = bySelPath.get(p);
        if (!rec) {
          findings.push(finding("PR-007", "error", `candidate ${c.candidate_id} source ${p} not present in selection-manifest.json`, p));
          return;
        }
        if (rec.disposition !== "selected") {
          findings.push(finding("PR-007", "error", `candidate ${c.candidate_id} source ${p} has disposition:${rec.disposition}, expected selected`, p));
        }
        const expectedHash = (c.source_sha256 || [])[i];
        if (rec.sha256 !== expectedHash) {
          findings.push(finding("PR-007", "error", `candidate ${c.candidate_id} source ${p} sha256 mismatch vs selection-manifest.json`, p));
        }
      });
    }
  }
  return findings;
}

// PR-008 patch-integrity — patches/phase-a has exactly the 4 family files;
// patches/phase-b exactly the 12 candidate IDs; candidate-manifest patch_sha256
// matches file bytes.
export function prPatchIntegrity(ctx) {
  const findings = [];
  for (const name of PHASE_A_FAMILY_PATCHES) {
    if (!ctx.exists(`patches/phase-a/${name}.md`)) findings.push(finding("PR-008", "error", `missing patches/phase-a/${name}.md`));
  }
  if (ctx.isDir("patches/phase-a")) {
    for (const f of readdirSync(ctx.abs("patches/phase-a"))) {
      if (!PHASE_A_FAMILY_PATCHES.includes(f.replace(/\.md$/, ""))) findings.push(finding("PR-008", "error", `unexpected file in patches/phase-a: ${f}`));
    }
  }
  for (const id of CANDIDATE_IDS) {
    if (!ctx.exists(`patches/phase-b/${id}.md`)) findings.push(finding("PR-008", "error", `missing patches/phase-b/${id}.md`));
  }
  if (ctx.isDir("patches/phase-b")) {
    for (const f of readdirSync(ctx.abs("patches/phase-b"))) {
      if (!CANDIDATE_IDS.includes(f.replace(/\.md$/, ""))) findings.push(finding("PR-008", "error", `unexpected file in patches/phase-b: ${f}`));
    }
  }
  const candidateRes = ctx.readJSON("candidate-manifest.json");
  if (candidateRes.ok) {
    for (const c of candidateRes.data.candidates || []) {
      if (!c.patch_path) continue;
      const bytesRes = ctx.readBytes(c.patch_path);
      if (!bytesRes.ok) {
        findings.push(finding("PR-008", "error", `candidate ${c.candidate_id}: cannot read ${c.patch_path}: ${bytesRes.error}`, c.patch_path));
        continue;
      }
      if (sha256Hex(bytesRes.data) !== c.patch_sha256) {
        findings.push(finding("PR-008", "error", `candidate ${c.candidate_id}: patch_sha256 mismatch for ${c.patch_path}`, c.patch_path));
      }
    }
  }
  return findings;
}

function loadBannedIdentityTokens(ctx, findings) {
  const rolesRes = ctx.readText("roles.md");
  if (!rolesRes.ok) {
    findings.push(finding("PR-009", "error", `cannot read roles.md: ${rolesRes.error}`));
    return [];
  }
  const blocks = rolesRes.data.match(/```json\s*[\s\S]*?```/g) || [];
  for (const block of blocks) {
    const inner = block.replace(/```json\s*/, "").replace(/```$/, "");
    try {
      const parsed = JSON.parse(inner);
      if (parsed && Array.isArray(parsed.banned_identity_tokens)) return parsed.banned_identity_tokens;
    } catch {
      // try the next fenced block
    }
  }
  findings.push(finding("PR-009", "error", "roles.md: no fenced JSON block with key banned_identity_tokens found"));
  return [];
}

// PR-009 patch-clean — banned-token scan over patches, arm-prompt-template.md, and
// both briefs files. Banned set: URLs, the 121 corpus slugs (from
// selection-manifest.json), fixed provider/brand tokens, roles.md's
// banned_identity_tokens, Tailwind-looking class strings, and candidate IDs inside
// patch body text.
export function prPatchClean(ctx) {
  const findings = [];
  const bannedIdentityTokens = loadBannedIdentityTokens(ctx, findings);

  const manifestRes = ctx.readJSON("selection-manifest.json");
  let slugs = [];
  if (manifestRes.ok) {
    slugs = [...new Set((manifestRes.data.records || []).map((r) => r.path.split("/")[2]).filter(Boolean))];
  } else {
    findings.push(finding("PR-009", "error", "cannot derive corpus slugs: selection-manifest.json unreadable"));
  }

  // Matching rules. Identity/brand words are matched case-INSENSITIVELY and on word
  // boundaries (the shared `identity-tokens.mjs` helper — R4): a case-sensitive
  // substring scan both fails open (lowercase token "sonnet" never matches a
  // written "Sonnet") and fires falsely ("anthropic" inside "philanthropic").
  // Corpus slugs get the same treatment for the same reason — the slug
  // "editorial-tech" must not fire on the ordinary phrase "editorial-technical",
  // while a bare "editorial-tech" still must. Only structural tokens stay plain
  // substrings, because "http://" has no word-boundary sense.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const structuralTokens = ["http://", "https://", "aura.build"];
  const brandTokens = ["MengTo", "Meng To", "Neuform", "Unsplash", "Aura"];
  const wordTokens = [...brandTokens, ...slugs, ...bannedIdentityTokens].filter(Boolean);
  const bannedTokens = [
    ...structuralTokens.map((t) => ({ token: t, re: new RegExp(escapeRe(t), "i") })),
    ...wordTokens.map((t) => ({ token: t, re: boundaryTokenRegex(t, "i") })),
  ];
  const tailwindRe = /class\s*=\s*["'][^"']*\b(flex|grid|px-\d|py-\d|bg-\w+-\d{2,3}|text-\w+-\d{2,3})\b[^"']*["']/;

  const patchFiles = [
    ...PHASE_A_FAMILY_PATCHES.map((n) => `patches/phase-a/${n}.md`),
    ...CANDIDATE_IDS.map((id) => `patches/phase-b/${id}.md`),
    "arm-prompt-template.md",
  ];

  const scanFile = (rel, checkCandidateIds) => {
    const textRes = ctx.readText(rel);
    if (!textRes.ok) return; // reported by PR-001/PR-008
    for (const { token, re } of bannedTokens) {
      if (re.test(textRes.data)) findings.push(finding("PR-009", "error", `banned token "${token}" found in ${rel}`, rel));
    }
    if (tailwindRe.test(textRes.data)) findings.push(finding("PR-009", "error", `Tailwind-looking class-string block found in ${rel}`, rel));
    if (checkCandidateIds) {
      for (const id of CANDIDATE_IDS) {
        if (boundaryTokenRegex(id, "").test(textRes.data)) findings.push(finding("PR-009", "error", `candidate ID "${id}" found in body text of ${rel}`, rel));
      }
    }
  };

  for (const rel of patchFiles) scanFile(rel, true);
  scanFile("phase-a-briefs.json", false);
  scanFile("phase-b-briefs.json", false);
  return findings;
}

// PR-010 family-b-separation (pre-freeze half) — phase-b patch files contain no
// phase-a family-patch inclusion text. (The post-render half — enforced against
// run manifests — has nothing to check until runs/ exists.)
export function prFamilyBSeparation(ctx) {
  const findings = [];
  for (const id of CANDIDATE_IDS) {
    const rel = `patches/phase-b/${id}.md`;
    const textRes = ctx.readText(rel);
    if (!textRes.ok) continue;
    if (/patches\/phase-a/i.test(textRes.data)) findings.push(finding("PR-010", "error", `${rel} references patches/phase-a`, rel));
    for (const familyPatch of PHASE_A_FAMILY_PATCHES) {
      if (new RegExp(`\\b${familyPatch}\\.md\\b`, "i").test(textRes.data)) {
        findings.push(finding("PR-010", "error", `${rel} references phase-a patch file ${familyPatch}.md`, rel));
      }
    }
  }
  return findings;
}
