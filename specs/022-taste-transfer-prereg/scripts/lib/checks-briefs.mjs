// scripts/lib/checks-briefs.mjs
//
// PR-011..PR-015 — Phase-A/Phase-B brief shape, arithmetic, assets-manifest, and
// reconciliation-hash checks (architecture §H). Split out of checks-freeze.mjs per
// Article IX / BUILD-CONTRACT follow-up: pure move, no behaviour change.
import { lstatSync, realpathSync } from "node:fs";
import { sep } from "node:path";
import { finding } from "./findings.mjs";
import { sha256Hex, SHA1_RE } from "./hash.mjs";
import { CANDIDATE_IDS } from "./constants.mjs";

// PR-011 phase-a-shape — 16 briefs; per family 3 ordinary + 1 contradiction
// (ordinal 4); ordinal-2 briefs flagged is_duplicate_source.
export function prPhaseAShape(ctx) {
  const findings = [];
  const res = ctx.readJSON("phase-a-briefs.json");
  if (!res.ok) return findings;
  const briefs = res.data.briefs || [];
  if (briefs.length !== 16) findings.push(finding("PR-011", "error", `expected 16 briefs, got ${briefs.length}`));
  for (const fam of ["aesthetics", "motion", "devices", "media"]) {
    const famBriefs = briefs.filter((b) => b.family === fam);
    if (famBriefs.length !== 4) {
      findings.push(finding("PR-011", "error", `family ${fam}: expected 4 briefs, got ${famBriefs.length}`));
      continue;
    }
    const ordinary = famBriefs.filter((b) => b.role === "ordinary");
    const contradiction = famBriefs.filter((b) => b.role === "contradiction");
    if (ordinary.length !== 3) findings.push(finding("PR-011", "error", `family ${fam}: expected 3 ordinary briefs, got ${ordinary.length}`));
    if (contradiction.length !== 1) findings.push(finding("PR-011", "error", `family ${fam}: expected 1 contradiction brief, got ${contradiction.length}`));
    for (const b of contradiction) {
      if (b.ordinal !== 4) findings.push(finding("PR-011", "error", `${b.brief_id}: contradiction must have ordinal 4, got ${b.ordinal}`, b.brief_id));
    }
    for (const b of famBriefs) {
      const shouldBeDup = b.ordinal === 2 && b.role === "ordinary";
      if (Boolean(b.is_duplicate_source) !== shouldBeDup) {
        findings.push(finding("PR-011", "error", `${b.brief_id}: is_duplicate_source=${b.is_duplicate_source}, expected ${shouldBeDup}`, b.brief_id));
      }
    }
  }
  return findings;
}

// PR-012 phase-b-shape — 36 briefs; 3 per candidate; every brief has non-empty
// primary_surface AND anti_context.leak_definition.
export function prPhaseBShape(ctx) {
  const findings = [];
  const res = ctx.readJSON("phase-b-briefs.json");
  if (!res.ok) return findings;
  const briefs = res.data.briefs || [];
  if (briefs.length !== 36) findings.push(finding("PR-012", "error", `expected 36 briefs, got ${briefs.length}`));
  for (const id of CANDIDATE_IDS) {
    const forId = briefs.filter((b) => b.candidate_id === id);
    if (forId.length !== 3) findings.push(finding("PR-012", "error", `candidate ${id}: expected 3 briefs, got ${forId.length}`, id));
  }
  for (const b of briefs) {
    if (!b.primary_surface?.description?.trim()) findings.push(finding("PR-012", "error", `${b.brief_id}: empty primary_surface`, b.brief_id));
    if (!b.anti_context?.leak_definition?.trim()) findings.push(finding("PR-012", "error", `${b.brief_id}: empty anti_context.leak_definition`, b.brief_id));
  }
  return findings;
}

// PR-013 arithmetic — 16×2=32; 36×2=72; 32+72=104, computed from the actual brief
// counts, not assumed.
export function prArithmetic(ctx) {
  const findings = [];
  const aRes = ctx.readJSON("phase-a-briefs.json");
  const bRes = ctx.readJSON("phase-b-briefs.json");
  if (!aRes.ok || !bRes.ok) {
    findings.push(finding("PR-013", "error", "cannot compute arithmetic: briefs files unreadable"));
    return findings;
  }
  const aCount = (aRes.data.briefs || []).length;
  const bCount = (bRes.data.briefs || []).length;
  const phaseAMax = aCount * 2;
  const phaseBMax = bCount * 2;
  const programMax = phaseAMax + phaseBMax;
  if (phaseAMax !== 32) findings.push(finding("PR-013", "error", `Phase-A max artifacts = ${phaseAMax}, expected 32`));
  if (phaseBMax !== 72) findings.push(finding("PR-013", "error", `Phase-B max artifacts = ${phaseBMax}, expected 72`));
  if (programMax !== 104) findings.push(finding("PR-013", "error", `program max artifacts = ${programMax}, expected 104`));
  return findings;
}

// PR-014 assets-manifest — validates the COMPLETE brief-media-manifest.json (all 30
// records), not only brief-referenced ones: exact counts, exact role/required-role
// mapping, brief-ref role agreement, full referential coverage in both directions,
// on-disk file safety + hash + dimensions + ratio, full provenance allowlisting,
// cross-record duplicate/source-reuse rejection, and identity-disclaimer-by-role.
// FAILS CLOSED while the media pack is unavailable — see BUILD-CONTRACT P4. Never
// softened: every branch below is a distinct, isolated error with its own message
// substring (spec 022 fix-spec F7 — "Exact media-manifest contract").
const LICENCE_RE = /^(?:CC0|Public Domain|CC BY(?:-SA)?)(?: \d+\.\d+)?$/i;
const COMMONS_FILE_RE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/;
const LICENCE_URL_RE = /^https:\/\/(?:creativecommons\.org\/(?:licenses|publicdomain)\/|commons\.wikimedia\.org\/wiki\/Template:)/;
const UPLOAD_WIKIMEDIA_RE = /^https:\/\/upload\.wikimedia\.org\//;
const SOURCE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// Exact role census the frozen 30-asset pack must satisfy (BUILD-CONTRACT media pack).
const ROLE_COUNTS = {
  wide: 9,
  macro: 6,
  headshot: 4,
  portrait: 4,
  "directory-headshot": 6,
  "presskit-headshot": 1,
};
const KNOWN_ROLES = Object.keys(ROLE_COUNTS);
// Longest-name-first so a suffix match picks "directory-headshot" over "headshot".
const ROLES_BY_LENGTH_DESC = [...KNOWN_ROLES].sort((a, b) => b.length - a.length);
const HUMAN_ROLES = new Set(["headshot", "portrait", "directory-headshot", "presskit-headshot"]);
const NON_HUMAN_ROLES = new Set(["wide", "macro"]);

// Decodes the role encoded in an asset_id's `-<role>-<n>` suffix, matching the
// longest known role name first (so "...-directory-headshot-1" is never
// mis-decoded as "...-headshot-1").
function roleFromAssetId(assetId) {
  if (typeof assetId !== "string") return null;
  for (const role of ROLES_BY_LENGTH_DESC) {
    if (new RegExp(`-${role}-\\d+$`).test(assetId)) return role;
  }
  return null;
}

// Groups records by a key, returning only the groups with more than one member —
// used for every "duplicate X across records" rule (asset_id, path, sha256,
// source_sha1, source_url, source_original_url). Blank/missing keys are ignored;
// their absence is caught by the field's own required-ness check instead.
function duplicateGroups(records, keyFn) {
  const seen = new Map();
  for (const rec of records) {
    const key = keyFn(rec);
    if (key === undefined || key === null || key === "") continue;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(rec);
  }
  return [...seen.entries()].filter(([, group]) => group.length > 1);
}

// Rejects `..`, absolute paths, and symlinks, and requires the resolved file to
// live inside the spec dir — never trusts a manifest-declared path at face value.
function checkAssetPathSafety(ctx, rel) {
  if (typeof rel !== "string" || rel.trim() === "") return { safe: false, reason: "path is missing or empty" };
  if (rel.startsWith("/") || rel.split(/[\\/]/).includes("..")) return { safe: false, reason: "path is absolute or escapes the spec dir" };
  const abs = ctx.abs(rel);
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return { safe: false, reason: "file does not exist on disk" };
  }
  if (st.isSymbolicLink()) return { safe: false, reason: "path is a symlink, not a regular file" };
  if (!st.isFile()) return { safe: false, reason: "path is not a regular file" };
  let specReal;
  let fileReal;
  try {
    specReal = realpathSync(ctx.specDir);
    fileReal = realpathSync(abs);
  } catch {
    return { safe: false, reason: "path could not be resolved" };
  }
  if (fileReal !== specReal && !fileReal.startsWith(specReal + sep)) {
    return { safe: false, reason: "path resolves outside the spec dir" };
  }
  return { safe: true };
}

function imageDimensions(bytes) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(pngSignature) && bytes.subarray(12, 16).toString("ascii") === "IHDR") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 11 && bytes.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (offset + 4 > bytes.length) return null;
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2) return null;
      offset += 2 + segmentLength;
    }
  }
  return null;
}

function ratioMatchesRole(role, width, height) {
  if (!width || !height) return false;
  const ratio = width / height;
  if (role === "wide") return Math.abs(ratio - 16 / 9) <= 0.02;
  if (role === "macro") return Math.abs(ratio - 1) <= 0.02 || Math.abs(ratio - 4 / 5) <= 0.02;
  if (["portrait", "headshot", "directory-headshot", "presskit-headshot"].includes(role)) {
    return Math.abs(ratio - 4 / 5) <= 0.02 || Math.abs(ratio - 3 / 4) <= 0.02;
  }
  return false;
}

export function prAssetsManifest(ctx) {
  const findings = [];
  const manifestRes = ctx.readJSON("assets/brief-media-manifest.json");
  if (!manifestRes.ok) {
    findings.push(finding("PR-014", "error", `cannot read assets/brief-media-manifest.json: ${manifestRes.error}`));
    return findings;
  }
  const manifest = manifestRes.data || {};
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];

  // --- Rule 1: exact size + asset_count agreement -------------------------------
  if (assets.length !== 30) {
    findings.push(finding("PR-014", "error", `expected 30 assets, got ${assets.length}`));
  }
  if (manifest.asset_count !== assets.length) {
    findings.push(finding("PR-014", "error", `asset_count (${manifest.asset_count}) does not equal assets.length (${assets.length})`));
  }

  // --- Rule 12: status must be "complete" once the pack is fully present --------
  if (assets.length === 30 && manifest.status !== "complete") {
    findings.push(finding("PR-014", "error", `status is ${JSON.stringify(manifest.status)} but must be "complete" when 30 assets are present`));
  }

  // --- Rule 2: local-record uniqueness (asset_id, path, sha256) -----------------
  for (const [id, group] of duplicateGroups(assets, (a) => a?.asset_id)) {
    findings.push(finding("PR-014", "error", `duplicate asset_id "${id}" appears on ${group.length} records`, id));
  }
  for (const [path, group] of duplicateGroups(assets, (a) => a?.path)) {
    findings.push(finding("PR-014", "error", `duplicate path "${path}" appears on ${group.length} records`, path));
  }
  for (const [hash, group] of duplicateGroups(assets, (a) => a?.sha256)) {
    findings.push(
      finding(
        "PR-014",
        "error",
        `duplicate sha256 "${hash}" appears on ${group.length} records (${group.map((a) => a?.asset_id).join(", ")}) — duplicate local bytes are rejected even when paths differ`,
        hash,
      ),
    );
  }

  // --- Rule 10: cross-record source-reuse uniqueness ----------------------------
  for (const [value, group] of duplicateGroups(assets, (a) => a?.source_sha1)) {
    findings.push(finding("PR-014", "error", `duplicate source_sha1 "${value}" reused across records (${group.map((a) => a?.asset_id).join(", ")})`, value));
  }
  for (const [value, group] of duplicateGroups(assets, (a) => a?.source_url)) {
    findings.push(finding("PR-014", "error", `duplicate source_url "${value}" reused across records (${group.map((a) => a?.asset_id).join(", ")})`, value));
  }
  for (const [value, group] of duplicateGroups(assets, (a) => a?.source_original_url)) {
    findings.push(finding("PR-014", "error", `duplicate source_original_url "${value}" reused across records (${group.map((a) => a?.asset_id).join(", ")})`, value));
  }

  // --- Rule 3: exact role census -------------------------------------------------
  const roleCounts = new Map();
  for (const a of assets) {
    const role = a?.role;
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }
  for (const role of KNOWN_ROLES) {
    const actual = roleCounts.get(role) || 0;
    if (actual !== ROLE_COUNTS[role]) {
      findings.push(finding("PR-014", "error", `role "${role}": expected ${ROLE_COUNTS[role]} assets, got ${actual}`, role));
    }
  }
  for (const role of roleCounts.keys()) {
    if (!KNOWN_ROLES.includes(role)) {
      findings.push(finding("PR-014", "error", `asset role ${JSON.stringify(role)} is not an allowed role value`, String(role)));
    }
  }

  // --- Rule 4: exact role-to-required-ID mapping --------------------------------
  const requiredRoles = Array.isArray(manifest.required_roles) ? manifest.required_roles : [];
  const seenRequiredRoles = new Set();
  for (const entry of requiredRoles) {
    const role = entry?.role;
    if (!KNOWN_ROLES.includes(role)) {
      findings.push(finding("PR-014", "error", `required_roles entry declares unknown role ${JSON.stringify(role)}`, String(role)));
      continue;
    }
    seenRequiredRoles.add(role);
    const declaredIds = Array.isArray(entry.asset_ids) ? entry.asset_ids : [];
    if (entry.count !== declaredIds.length) {
      findings.push(finding("PR-014", "error", `required_roles role "${role}": count (${entry.count}) does not equal asset_ids.length (${declaredIds.length})`, role));
    }
    const declaredSet = new Set(declaredIds);
    const actualSet = new Set(assets.filter((a) => a?.role === role).map((a) => a.asset_id));
    const missing = [...declaredSet].filter((id) => !actualSet.has(id));
    const extra = [...actualSet].filter((id) => !declaredSet.has(id));
    if (missing.length > 0 || extra.length > 0) {
      findings.push(
        finding(
          "PR-014",
          "error",
          `required_roles role "${role}": manifest asset_ids do not exactly match required_roles.asset_ids (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
          role,
        ),
      );
    }
  }
  for (const role of KNOWN_ROLES) {
    if (!seenRequiredRoles.has(role)) {
      findings.push(finding("PR-014", "error", `required_roles is missing an entry for role "${role}"`, role));
    }
  }

  // --- Rule 5 + Rule 6: brief-reference resolution, role agreement, coverage ---
  const assetsByRef = new Map();
  for (const a of assets) {
    if (a?.asset_id) assetsByRef.set(a.asset_id, a);
  }
  const referenced = new Set();
  const unresolved = new Set();
  for (const rel of ["phase-a-briefs.json", "phase-b-briefs.json"]) {
    const res = ctx.readJSON(rel);
    if (!res.ok) continue;
    for (const b of res.data.briefs || []) {
      for (const sa of b.supplied_assets || []) {
        const rec = assetsByRef.get(sa.asset_id);
        if (!rec) {
          unresolved.add(sa.asset_id);
          continue;
        }
        referenced.add(sa.asset_id);
        const encodedRole = roleFromAssetId(sa.asset_id);
        if (encodedRole && rec.role && encodedRole !== rec.role) {
          findings.push(
            finding(
              "PR-014",
              "error",
              `asset ${sa.asset_id}: brief reference role "${encodedRole}" disagrees with manifest record role "${rec.role}"`,
              sa.asset_id,
            ),
          );
        }
      }
    }
  }
  for (const id of unresolved) {
    findings.push(finding("PR-014", "error", `supplied asset "${id}" does not resolve in assets/brief-media-manifest.json`, id));
  }
  for (const a of assets) {
    if (a?.asset_id && !referenced.has(a.asset_id)) {
      findings.push(finding("PR-014", "error", `asset ${a.asset_id}: manifest record is not referenced by any brief`, a.asset_id));
    }
  }

  // --- Per-record checks: file safety/hash/dimensions/ratio, provenance, disclaimer
  for (const rec of assets) {
    const id = rec?.asset_id ? String(rec.asset_id) : "(missing asset_id)";

    // Rule 7: on-disk file safety + hash.
    const safety = checkAssetPathSafety(ctx, rec?.path);
    if (!safety.safe) {
      findings.push(finding("PR-014", "error", `asset ${id}: ${safety.reason} (path: ${JSON.stringify(rec?.path)})`, id));
    } else {
      const bytesRes = ctx.readBytes(rec.path);
      if (!bytesRes.ok) {
        findings.push(finding("PR-014", "error", `asset ${id}: file could not be read (${bytesRes.error})`, id));
      } else {
        const actualHash = sha256Hex(bytesRes.data);
        if (actualHash !== rec.sha256) {
          findings.push(finding("PR-014", "error", `asset ${id}: sha256 mismatch (recorded ${rec.sha256}, actual ${actualHash})`, id));
        }

        // Rule 8: declared dimensions vs parsed bytes, and ratio-vs-role — two
        // independent error branches.
        const dimensions = imageDimensions(bytesRes.data);
        if (!dimensions) {
          findings.push(finding("PR-014", "error", `asset ${id}: could not parse image dimensions from file bytes`, id));
        } else {
          if (dimensions.width !== rec.width || dimensions.height !== rec.height) {
            findings.push(
              finding(
                "PR-014",
                "error",
                `asset ${id}: declared dimensions ${rec.width}x${rec.height} do not match parsed dimensions ${dimensions.width}x${dimensions.height}`,
                id,
              ),
            );
          }
          if (!ratioMatchesRole(rec.role, dimensions.width, dimensions.height)) {
            findings.push(finding("PR-014", "error", `asset ${id}: image dimensions do not satisfy the ${rec.role || "missing"} ratio contract`, id));
          }
        }
      }
    }

    // Rule 9: provenance — every field required and individually checked.
    if (!String(rec?.creator || "").trim()) {
      findings.push(finding("PR-014", "error", `asset ${id}: creator is empty`, id));
    }
    if (!LICENCE_RE.test(String(rec?.licence || ""))) {
      findings.push(finding("PR-014", "error", `asset ${id}: licence is not on the allowlist (got ${JSON.stringify(rec?.licence)})`, id));
    }
    if (!LICENCE_URL_RE.test(String(rec?.licence_url || ""))) {
      findings.push(finding("PR-014", "error", `asset ${id}: licence_url is not on the allowlist (got ${JSON.stringify(rec?.licence_url)})`, id));
    }
    if (!COMMONS_FILE_RE.test(String(rec?.source_url || ""))) {
      findings.push(finding("PR-014", "error", `asset ${id}: source_url is not a Commons File: URL (got ${JSON.stringify(rec?.source_url)})`, id));
    }
    if (!UPLOAD_WIKIMEDIA_RE.test(String(rec?.source_original_url || ""))) {
      findings.push(finding("PR-014", "error", `asset ${id}: source_original_url is not an upload.wikimedia.org URL (got ${JSON.stringify(rec?.source_original_url)})`, id));
    }
    if (!UPLOAD_WIKIMEDIA_RE.test(String(rec?.source_downloaded_derivative_url || ""))) {
      findings.push(
        finding(
          "PR-014",
          "error",
          `asset ${id}: source_downloaded_derivative_url is not an upload.wikimedia.org URL (got ${JSON.stringify(rec?.source_downloaded_derivative_url)})`,
          id,
        ),
      );
    }
    if (!SHA1_RE.test(String(rec?.source_sha1 || ""))) {
      findings.push(finding("PR-014", "error", `asset ${id}: source_sha1 is not 40 lowercase hex characters (got ${JSON.stringify(rec?.source_sha1)})`, id));
    }
    if (!SOURCE_TIMESTAMP_RE.test(String(rec?.source_revision_timestamp || ""))) {
      findings.push(
        finding(
          "PR-014",
          "error",
          `asset ${id}: source_revision_timestamp is not a strict ISO-8601 UTC instant (got ${JSON.stringify(rec?.source_revision_timestamp)})`,
          id,
        ),
      );
    }
    if (!String(rec?.crop_method || "").trim()) {
      findings.push(finding("PR-014", "error", `asset ${id}: crop_method is empty`, id));
    }

    // Rule 11: identity_disclaimer required for human roles, null for non-human.
    if (HUMAN_ROLES.has(rec?.role)) {
      if (!String(rec?.identity_disclaimer || "").trim()) {
        findings.push(finding("PR-014", "error", `asset ${id}: role "${rec?.role}" requires a non-empty identity_disclaimer`, id));
      }
    } else if (NON_HUMAN_ROLES.has(rec?.role)) {
      if (rec?.identity_disclaimer !== null) {
        findings.push(
          finding(
            "PR-014",
            "error",
            `asset ${id}: role "${rec?.role}" must have identity_disclaimer set to null (got ${JSON.stringify(rec?.identity_disclaimer)})`,
            id,
          ),
        );
      }
    }
  }

  return findings;
}

const RECONCILIATION_DOCS = [
  "mengto-skills-opus5-report.md",
  "mengto-fable-initial.md",
  "mengto-codex-crosscheck.md",
  "mengto-fable-final.md",
  "mengto-crossmodel-strategy.md",
];

// PR-015 reconciliation-hashes — reconciliation.md lists the 5 docs with 64-hex
// hashes that match the reconciliation/ copies (recomputed, never trusted from the
// architecture's own reference values); file contains the verbatim strings
// "VERDICT: BLOCKER" and "VERDICT: APPROVE".
export function prReconciliationHashes(ctx) {
  const findings = [];
  const mainRes = ctx.readText("reconciliation.md");
  if (!mainRes.ok) {
    findings.push(finding("PR-015", "error", `cannot read reconciliation.md: ${mainRes.error}`));
    return findings;
  }
  for (const doc of RECONCILIATION_DOCS) {
    const rel = `reconciliation/${doc}`;
    const bytesRes = ctx.readBytes(rel);
    if (!bytesRes.ok) {
      findings.push(finding("PR-015", "error", `missing reconciliation copy: ${rel}`, rel));
      continue;
    }
    const actual = sha256Hex(bytesRes.data);
    const escaped = doc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = mainRes.data.match(new RegExp(`${escaped}[^\\n]*?([0-9a-f]{64})`, "i"));
    if (!m) {
      findings.push(finding("PR-015", "error", `reconciliation.md does not associate a 64-hex hash with ${doc}`, doc));
      continue;
    }
    if (m[1] !== actual) {
      findings.push(finding("PR-015", "error", `reconciliation.md hash for ${doc} (${m[1]}) != actual file hash (${actual})`, doc));
    }
  }
  if (!mainRes.data.includes("VERDICT: BLOCKER")) findings.push(finding("PR-015", "error", 'reconciliation.md missing verbatim string "VERDICT: BLOCKER"'));
  if (!mainRes.data.includes("VERDICT: APPROVE")) findings.push(finding("PR-015", "error", 'reconciliation.md missing verbatim string "VERDICT: APPROVE"'));
  return findings;
}
