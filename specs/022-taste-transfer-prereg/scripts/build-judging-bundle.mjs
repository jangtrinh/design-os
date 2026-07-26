#!/usr/bin/env node
/**
 * build-judging-bundle.mjs — spec 022 (architecture §J closing paragraph, §L)
 *
 * Consumes the secret randomization map READ-ONLY and assembles
 * runs/judging/<presentation_id>/ bundles: codename-renamed artifact copies plus
 * screenshots, and a codename-neutral brief-facts.md. Strips HTML comments, <meta>
 * generator tags, and <title> (replaced with the codename); rewrites internal links
 * relative. PR-023 then scans the OUTPUT independently — this packager is not
 * trusted by its own gate.
 *
 * BUILD-CONTRACT: NOT run in this build stage against real data — no runs/ tree
 * exists yet to package, and packaging is out of scope until rendering has
 * happened. `--spec-dir`/`--secret-map` exist purely so tests can drive this
 * script over a synthetic fixture tree without touching the real repo.
 *
 * SAFETY (fix-spec F5): every path that comes from data (secret-map records,
 * run-manifest.json contents) is treated as untrusted. Before any directory is
 * created or any file is written, the whole job is PREFLIGHTED: the commitment
 * is schema-validated, the secret map's bytes are hash-verified against the
 * commitment, the map's structure is validated strictly, and every artifact /
 * screenshot path is resolved with strict containment, existence, regular-file
 * (non-symlink), and content-hash checks. Only after every presentation passes
 * preflight does the script perform any writes — an invalid input can never
 * leave a partial bundle tree on disk.
 *
 * Amendment item 2 (Fable Stage-6 B9/B11) — supplied-media neutrality + real
 * brief facts:
 *   1. Each side's primary artifact HTML is scanned for any frozen manifest
 *      `path`, any committed `asset_id`, or any R1 neutral alias
 *      (`asset-<role>-<n>`) that the generation model's prompt could have
 *      surfaced. Each distinct reference resolves to its underlying file
 *      (containment + regular-file + sha256-verified, same helpers as
 *      artifacts/screenshots), is copied into the bundle as
 *      `<codename>.asset-<role>-<n><ext>` (`<n>` = per-side, per-role 1-based
 *      order of first appearance), and the HTML reference is rewritten to that
 *      bare bundle-local filename.
 *
 *      DEVIATION from the amendment's literal `<codename>.media-<role>-<n>`
 *      wording: the fixed "media-" infix collides with this pilot's own
 *      "media" FAMILY name, and every presentation carrying a supplied asset
 *      IS, by construction, a media-family presentation (only PA-MED/PB-P1/
 *      PB-P2 briefs carry `supplied_assets`) — so that literal infix would
 *      make R3 item 1 (filename convention) and R3 item 3 (ban the 4 family
 *      names in every planned filename) mutually unsatisfiable for exactly
 *      the presentations R1 exists to protect. "asset-" reuses R1's own
 *      already-established neutral vocabulary (`asset_ref: "asset-<role>-<n>"`)
 *      instead of inventing a second, colliding one, and collides with no
 *      family/candidate/brief id.
 *   2. `brief-facts.md` is generated ONCE per presentation from the frozen
 *      brief run through the canonical `projectBrief` (R1) — the projected
 *      requirement/content facts, acceptance-check text, and the neutral asset
 *      list (`asset-<role>-<n>`, role). It never emits brief_id, candidate_id,
 *      family, ordinal, arm labels, patch text, or the probe fields P7 removes.
 *   3. Before ANY bundle directory is created, every planned filename and every
 *      planned text output is scanned for the full frozen identity universe
 *      (30 asset ids, 30 manifest paths, 12 candidate IDs, 4 family names, all
 *      52 brief IDs, arm labels, and media source-identity strings). Any hit is
 *      fatal.
 *
 * Usage: node build-judging-bundle.mjs [--spec-dir <path>] [--secret-map <path>]
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  lstatSync,
  statSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { validate } from "./lib/schema.mjs";
import { sha256Hex, sha256File } from "./lib/hash.mjs";
import { assetRoleMap, assetIdToNeutral, projectBrief } from "./lib/prompt-assembler.mjs";
import { scanIdentityTokens } from "./lib/identity-tokens.mjs";
import { CANDIDATE_IDS, FAMILIES } from "./lib/constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC_DIR = resolve(__dirname, "..");
// Frozen default — used ONLY (a) as the fallback secret-map location when the
// commitment itself does not exist yet, for the "nothing committed" error
// message, and (b) as the default when neither --secret-map nor a valid
// commitment.secret_map_location is available. The commitment is the authority
// for where the real map lives (spec.md "Secret-map record shape").
const DEFAULT_SECRET_MAP_PATH = join(homedir(), ".design-os", "prereg-022", "randomization-map.secret.json");

const PRESENTATION_ID_RE = /^PR-[0-9a-f]{8}$/;
const CODE_RE = /^[0-9a-f]{8}$/;
const PAIR_ID_RE = /^(PA-(AES|MOT|DEV|MED)-[1-4]|PB-(A[123]|M[123]|D[1-4]|P[12])-[1-3])$/;
const BRIEFS_FILE_BY_PHASE = Object.freeze({ A: "phase-a-briefs.json", B: "phase-b-briefs.json" });
const MEDIA_MANIFEST_REL = join("assets", "brief-media-manifest.json");
const ARM_LABELS = ["control", "treatment"];
const MEDIA_SOURCE_FIELDS = ["creator", "licence_source_label", "licence_url", "source_url", "source_original_url", "source_downloaded_derivative_url"];

class FatalError extends Error {}

function fatal(message) {
  throw new FatalError(message);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const args = { specDir: DEFAULT_SPEC_DIR, secretMap: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec-dir") {
      const value = argv[++i];
      if (value === undefined) fatal("--spec-dir requires a value");
      args.specDir = resolve(value);
    } else if (a === "--secret-map") {
      const value = argv[++i];
      if (value === undefined) fatal("--secret-map requires a value");
      args.secretMap = resolve(value);
    } else {
      process.stderr.write(`unrecognized argument: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Path safety helpers — every path built from data goes through one of these.
// ---------------------------------------------------------------------------

/**
 * Resolve `childName` under `baseDir` and require the result to equal or be a
 * strict descendant of the resolved base — compared with a trailing path.sep,
 * never a bare startsWith (which would let `/foo/barbaz` alias into `/foo/bar`).
 */
function resolveContainedChild(baseDir, childName, label) {
  const base = resolve(baseDir);
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  const candidate = resolve(base, childName);
  if (candidate !== base && !candidate.startsWith(baseWithSep)) {
    fatal(`${label} escapes its required directory: resolved to ${candidate}, must be within ${base}`);
  }
  return candidate;
}

/**
 * A path taken from data (run-manifest.json artifact/screenshot path, or a
 * brief-media-manifest.json asset path). Rejects an absolute path or a ".."
 * segment outright (never mind where it would resolve to), then requires
 * strict containment inside `baseDir`.
 */
function assertPathWithinDir(rawPath, baseDir, label) {
  if (typeof rawPath !== "string" || rawPath.length === 0) fatal(`${label}: missing or empty path`);
  if (isAbsolute(rawPath)) fatal(`${label}: absolute paths are not permitted: ${rawPath}`);
  if (rawPath.split(/[\\/]+/).includes("..")) fatal(`${label}: ".." path segments are not permitted: ${rawPath}`);
  return resolveContainedChild(baseDir, rawPath, label);
}

/** lstat (never follow a symlink to decide) and require a regular file. */
function assertRegularFile(absPath, label) {
  if (!existsSync(absPath)) fatal(`${label}: file does not exist: ${absPath}`);
  let st;
  try {
    st = lstatSync(absPath);
  } catch (err) {
    fatal(`${label}: cannot lstat ${absPath}: ${err.message}`);
    return;
  }
  if (!st.isFile()) fatal(`${label}: not a regular file (symlinks and other types are rejected): ${absPath}`);
}

// ---------------------------------------------------------------------------
// HTML transforms — unchanged behaviour.
// ---------------------------------------------------------------------------

function stripHtml(html, codename) {
  let out = html.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<meta[^>]+name=["']generator["'][^>]*>/gi, "");
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${codename}</title>`);
  return out;
}

function rewriteRelativeLinks(html) {
  // Internal links must stay relative and codename-scoped; strip any absolute
  // root-relative path that could leak repo/tree structure.
  return html.replace(/(href|src)=(["'])\/(?!\/)/gi, (_m, attr, quote) => `${attr}=${quote}./`);
}

// ---------------------------------------------------------------------------
// Frozen briefs + media manifest loading.
// ---------------------------------------------------------------------------

function loadBriefsFile(specDir, relName) {
  const abs = join(specDir, relName);
  if (!existsSync(abs)) fatal(`missing ${relName}: ${abs}`);
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    fatal(`cannot read ${abs}: ${err.message}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fatal(`${abs} is not valid JSON: ${err.message}`);
    return;
  }
  if (!data || !Array.isArray(data.briefs)) fatal(`${abs} is missing a "briefs" array`);
  return data.briefs;
}

/** { A: Map(brief_id -> brief), B: Map(brief_id -> brief) }, loaded once. */
function buildBriefIndex(specDir) {
  const index = { A: new Map(), B: new Map() };
  for (const brief of loadBriefsFile(specDir, BRIEFS_FILE_BY_PHASE.A)) {
    if (brief && typeof brief.brief_id === "string") index.A.set(brief.brief_id, brief);
  }
  for (const brief of loadBriefsFile(specDir, BRIEFS_FILE_BY_PHASE.B)) {
    if (brief && typeof brief.brief_id === "string") index.B.set(brief.brief_id, brief);
  }
  return index;
}

/**
 * Load the frozen brief for a presentation's pair_id, matching on brief_id in
 * the phase-appropriate briefs file. Fail closed — a presentation whose brief
 * cannot be identified must never be packaged (its identity cannot be proven
 * neutral).
 */
function findBrief(briefIndex, phase, pairId) {
  const map = phase === "A" ? briefIndex.A : briefIndex.B;
  const brief = map.get(pairId);
  if (!brief) {
    fatal(
      `no brief with brief_id "${pairId}" found in ${BRIEFS_FILE_BY_PHASE[phase]} — refusing to package a presentation whose brief cannot be identified`,
    );
    return;
  }
  return brief;
}

/** { data, byId: Map<asset_id, record> } for assets/brief-media-manifest.json. */
function loadMediaManifest(specDir) {
  const abs = join(specDir, MEDIA_MANIFEST_REL);
  if (!existsSync(abs)) fatal(`missing brief-media-manifest.json: ${abs}`);
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    fatal(`cannot read ${abs}: ${err.message}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fatal(`${abs} is not valid JSON: ${err.message}`);
    return;
  }
  if (!data || !Array.isArray(data.assets)) fatal(`${abs} is missing an "assets" array`);
  const byId = new Map();
  for (const asset of data.assets) {
    if (asset && typeof asset.asset_id === "string") byId.set(asset.asset_id, asset);
  }
  return { data, byId };
}

/**
 * Resolve one supplied asset's real file, verified through the SAME
 * containment + lstat regular-file + recorded-sha256 checks already applied
 * to artifacts and screenshots. The manifest record's `path` and `sha256` are
 * the authority (never the HTML text).
 */
function resolveMediaAsset(ctx, assetId, label) {
  const record = ctx.mediaAssetIndex.get(assetId);
  if (!record) {
    fatal(`${label}: asset id "${assetId}" has no matching record in brief-media-manifest.json`);
    return;
  }
  const abs = assertPathWithinDir(record.path, ctx.specDir, label);
  assertRegularFile(abs, label);
  const actualHash = sha256File(abs);
  if (actualHash !== record.sha256) {
    fatal(`${label}: recorded sha256 for asset "${assetId}" does not match its bytes (expected ${record.sha256}, got ${actualHash}): ${abs}`);
  }
  return { abs, ext: extname(record.path), record };
}

// ---------------------------------------------------------------------------
// R1/R3 — per-side supplied-media neutralization.
//
// A rendered artifact's prompt carried the R1 neutral alias
// ("asset-<role>-<n>"), never the committed id or path — but the packager
// treats the rendered HTML as untrusted output, not as proof the model
// behaved: it scans for all three possible surviving forms (frozen path,
// committed asset_id, R1 alias) and resolves each back to the real file
// through the frozen manifest, never through the HTML text.
// ---------------------------------------------------------------------------

/**
 * Neutralize one side's HTML: replace every reference to a resolvable media
 * asset with `<codename>.asset-<role>-<n><ext>` (`<n>` = per-side, per-role
 * 1-based order of first appearance in THIS side's html), and return the plan
 * of files that must be copied into the bundle to back those references.
 */
function neutralizeSideAssets(html, ctx, brief, codename, sideLabel) {
  const idToNeutral = assetIdToNeutral(brief, ctx.assetRoles);
  const neutralToId = new Map([...idToNeutral].map(([id, alias]) => [alias, id]));

  // Every detectable surface form, longest text first so a full manifest path
  // (which itself contains the bare asset id as a substring) is matched whole
  // rather than fragmenting into a shorter, ambiguous match. Scoped ONLY to
  // THIS BRIEF's own supplied assets (idToNeutral's domain) — a real asset id
  // or path belonging to a DIFFERENT brief must NOT be silently "resolved" and
  // rewritten here (there is no legitimate mapping for it in this brief's
  // context); it must survive into `htmlOut` unrewritten so the fail-closed
  // output identity scan catches it.
  const byText = new Map();
  for (const assetId of idToNeutral.keys()) {
    const record = ctx.mediaAssetIndex.get(assetId);
    if (record) byText.set(record.path, assetId);
    byText.set(assetId, assetId);
  }
  for (const [alias, assetId] of neutralToId) byText.set(alias, assetId);

  const texts = [...byText.keys()].sort((a, b) => b.length - a.length);
  const assetCopyByAssetId = new Map();
  let htmlOut = html;
  if (texts.length > 0) {
    const re = new RegExp(texts.map(escapeRegExp).join("|"), "g");
    const roleCounters = new Map();
    htmlOut = html.replace(re, (match) => {
      const assetId = byText.get(match);
      let copy = assetCopyByAssetId.get(assetId);
      if (!copy) {
        const label = `supplied asset "${assetId}" referenced by ${sideLabel}`;
        const resolved = resolveMediaAsset(ctx, assetId, label);
        const role = ctx.assetRoles.get(assetId);
        if (role === undefined) fatal(`${label}: not in the frozen media manifest's role map`);
        const next = (roleCounters.get(role) || 0) + 1;
        roleCounters.set(role, next);
        const destName = `${codename}.asset-${role}-${next}${resolved.ext}`;
        copy = { destName, srcAbs: resolved.abs };
        assetCopyByAssetId.set(assetId, copy);
      }
      return copy.destName;
    });
  }
  return { htmlOut, assetCopyPlans: [...assetCopyByAssetId.values()] };
}

// ---------------------------------------------------------------------------
// brief-facts.md (amendment item 2 / Fable B9)
//
// A real, codename-neutral document naming the surface to judge, derived from
// the frozen brief run through the ONE canonical projection (R1's
// `projectBrief`) — not a second, ad hoc removal list. The projection already
// strips brief_id/candidate_id/family/ordinal and the Phase-B leak_definition;
// this function only renders what survives.
// ---------------------------------------------------------------------------

function briefFactsMarkdown(projected, phase) {
  const lines = ["# Brief facts", "", "## Surface to judge", "", String(projected.title ?? ""), ""];

  if (phase === "A") {
    for (const req of projected.content_requirements || []) lines.push(`- ${req}`);
    lines.push("");
    if (projected.context_boundary) lines.push(`Context: ${projected.context_boundary}`, "");
  } else {
    if (projected.primary_surface?.description) lines.push(projected.primary_surface.description, "");
    for (const req of projected.primary_surface?.requirements || []) lines.push(`- ${req}`);
    lines.push("");
    const anti = projected.anti_context;
    if (anti && typeof anti === "object") {
      lines.push("## Embedded section", "");
      if (anti.embedded_state) lines.push(`This surface also includes ${anti.embedded_state}.`, "");
      if (anti.inactive_requirement) lines.push(`That section is meant to stay plain: ${anti.inactive_requirement}.`, "");
    }
  }

  lines.push("## Acceptance", "");
  for (const check of projected.acceptance_checks || []) {
    const text = typeof check === "string" ? check : (check?.description ?? check?.check ?? JSON.stringify(check));
    lines.push(`- ${text}`);
  }
  lines.push("");

  lines.push("## Supplied assets", "");
  const supplied = Array.isArray(projected.supplied_assets) ? projected.supplied_assets : [];
  if (supplied.length === 0) lines.push("(none supplied)");
  else for (const a of supplied) lines.push(`- ${a.asset_ref} (${a.role})`);
  lines.push("");

  lines.push("## Viewports", "");
  lines.push((projected.viewports || []).join(", "), "");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Amendment item 2 (part 3) — output identity scan, fail-closed, before write.
// ---------------------------------------------------------------------------

/**
 * Built once in main(): the frozen identity universe this pilot must never
 * leak. Two variants, because filenames and body TEXT have different false-
 * positive risk:
 *
 *  - `filenames` — every identity token, including the 4 family names. A
 *    planned filename is a pure identifier, never natural language, so a
 *    family name appearing there is never a coincidence.
 *  - `text` — everything EXCEPT family names. `motion`, `devices`,
 *    `aesthetics`, and `media` are ordinary UI/UX vocabulary that frozen brief
 *    prose legitimately uses (e.g. PB-A1-1's retained, arm-visible
 *    `anti_context.inactive_requirement` says "no narrative media bands" —
 *    real content, not a leak). Banning them in body text would make
 *    brief-facts.md unwritable for real briefs while catching nothing a blind
 *    owner could act on — the same false-positive shape as arm words in body
 *    copy (checks-judging.mjs). Family identity in TEXT is still protected:
 *    projectBrief() removes the `family` key itself from every projection.
 */
function buildBannedIdentitySets(ctx) {
  const briefIds = [...ctx.briefIndex.A.keys(), ...ctx.briefIndex.B.keys()];
  const substringTokens = ["assets/brief-media", "assets/brief-media-manifest.json#", "commons.wikimedia.org", "upload.wikimedia.org"];
  for (const record of ctx.mediaAssetIndex.values()) {
    substringTokens.push(record.path);
    for (const field of MEDIA_SOURCE_FIELDS) {
      if (typeof record[field] === "string" && record[field].length > 0) substringTokens.push(record[field]);
    }
  }
  const dedupedSubstring = [...new Set(substringTokens)];
  const sharedBoundary = [...briefIds, ...CANDIDATE_IDS, ...ARM_LABELS, ...ctx.mediaAssetIndex.keys()];
  return {
    filenames: { boundaryTokens: [...new Set([...sharedBoundary, ...FAMILIES])], substringTokens: dedupedSubstring },
    text: { boundaryTokens: [...new Set(sharedBoundary)], substringTokens: dedupedSubstring },
  };
}

function assertNoIdentityLeak(text, identitySets, label) {
  const hits = scanIdentityTokens(text, identitySets);
  if (hits.length > 0) fatal(`${label}: output identity scan found banned identity token(s) [${hits.join(", ")}] — refusing to write an unproven bundle`);
}

// ---------------------------------------------------------------------------
// Commitment + secret-map loading and validation.
// ---------------------------------------------------------------------------

function readSchema(specDir, relPath) {
  const abs = join(specDir, relPath);
  if (!existsSync(abs)) fatal(`missing schema file: ${abs}`);
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    fatal(`cannot read schema file ${abs}: ${err.message}`);
    return;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fatal(`schema file ${abs} is not valid JSON: ${err.message}`);
  }
}

function loadCommitment(specDir) {
  const commitmentPath = join(specDir, "randomization-commitment.json");
  if (!existsSync(commitmentPath)) {
    fatal(
      `randomization-commitment.json not found under ${specDir}. Nothing has been committed yet — ` +
        `run make-randomization-map.mjs first (frozen secret-map location: ${DEFAULT_SECRET_MAP_PATH}).`,
    );
  }
  let raw;
  try {
    raw = readFileSync(commitmentPath, "utf8");
  } catch (err) {
    fatal(`cannot read ${commitmentPath}: ${err.message}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fatal(`${commitmentPath} is not valid JSON: ${err.message}`);
    return;
  }
  const schema = readSchema(specDir, "schemas/randomization-commitment.schema.json");
  const errors = validate(data, schema);
  if (errors.length > 0) {
    fatal(`randomization-commitment.json failed schema validation: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  }
  return data;
}

/**
 * Read the external secret map from `commitment.secret_map_location` (the
 * commitment is the authority — never a hardcoded path), unless `--secret-map`
 * was given to override it for tests driving a fixture tree. Hash-verify the
 * exact bytes against `commitment.secret_map_sha256` before ever parsing them.
 */
function loadSecretMap(commitment, secretMapOverride) {
  const location = secretMapOverride ?? (typeof commitment.secret_map_location === "string" ? resolve(commitment.secret_map_location) : null);
  if (!location) fatal("commitment.secret_map_location is missing or not a string");
  if (!existsSync(location)) {
    fatal(`secret map not found at ${location} (commitment.secret_map_location). Nothing to package.`);
  }
  let bytes;
  try {
    bytes = readFileSync(location);
  } catch (err) {
    fatal(`cannot read secret map at ${location}: ${err.message}`);
    return;
  }
  const actualHash = sha256Hex(bytes);
  if (actualHash !== commitment.secret_map_sha256) {
    fatal(
      `secret map at ${location} does not match commitment.secret_map_sha256 ` +
        `(expected ${commitment.secret_map_sha256}, got ${actualHash}) — refusing to package an unverified map`,
    );
  }
  let map;
  try {
    map = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    fatal(`secret map at ${location} is not valid JSON: ${err.message}`);
    return;
  }
  return map;
}

/**
 * Strictly validate the secret map's structure per spec.md "Secret-map record
 * shape". Returns the validated `presentations` array on success; aborts on any
 * violation.
 */
function validateSecretMapStructure(map, commitment) {
  if (!map || typeof map !== "object" || !Array.isArray(map.presentations)) {
    fatal("secret map is missing a presentations array");
    return;
  }
  const expectedTotal = commitment.phase_a_presentations + commitment.phase_b_presentations;
  const presentations = map.presentations;
  if (presentations.length !== expectedTotal) {
    fatal(
      `secret map has ${presentations.length} presentation record(s), expected exactly ` +
        `${expectedTotal} (phase_a_presentations + phase_b_presentations = ${commitment.phase_a_presentations} + ${commitment.phase_b_presentations})`,
    );
  }

  const seenPresentationIds = new Set();
  const seenCodes = new Set();
  const seenOrders = new Set();
  let phaseACount = 0;
  let phaseBCount = 0;

  presentations.forEach((record, index) => {
    const label = `presentations[${index}]`;
    if (!record || typeof record !== "object") {
      fatal(`${label}: not an object`);
      return;
    }
    const { presentation_id, pair_id, phase, left_code, right_code, left_arm, presentation_order, is_duplicate, endpoint_primary } = record;

    if (typeof presentation_id !== "string" || !PRESENTATION_ID_RE.test(presentation_id)) {
      fatal(`${label}.presentation_id ${JSON.stringify(presentation_id)} does not match ^PR-[0-9a-f]{8}$`);
    }
    if (seenPresentationIds.has(presentation_id)) fatal(`${label}.presentation_id "${presentation_id}" is not globally unique`);
    seenPresentationIds.add(presentation_id);

    if (typeof pair_id !== "string" || !PAIR_ID_RE.test(pair_id)) {
      fatal(`${label}.pair_id ${JSON.stringify(pair_id)} does not match the frozen pair pattern`);
    }

    if (phase !== "A" && phase !== "B") fatal(`${label}.phase ${JSON.stringify(phase)} is not one of "A", "B"`);
    if (phase === "A") phaseACount++;
    else if (phase === "B") phaseBCount++;

    if (typeof left_code !== "string" || !CODE_RE.test(left_code)) fatal(`${label}.left_code ${JSON.stringify(left_code)} does not match ^[0-9a-f]{8}$`);
    if (typeof right_code !== "string" || !CODE_RE.test(right_code)) fatal(`${label}.right_code ${JSON.stringify(right_code)} does not match ^[0-9a-f]{8}$`);
    for (const code of [left_code, right_code]) {
      if (typeof code !== "string") continue;
      if (seenCodes.has(code)) fatal(`${label}: codename "${code}" is not globally unique across all records`);
      seenCodes.add(code);
    }

    if (left_arm !== "control" && left_arm !== "treatment") fatal(`${label}.left_arm ${JSON.stringify(left_arm)} is not one of "control", "treatment"`);

    if (typeof is_duplicate !== "boolean") fatal(`${label}.is_duplicate is not boolean`);
    if (typeof endpoint_primary !== "boolean") fatal(`${label}.endpoint_primary is not boolean`);

    if (!Number.isInteger(presentation_order) || presentation_order < 1 || presentation_order > expectedTotal) {
      fatal(`${label}.presentation_order ${JSON.stringify(presentation_order)} is not an integer in 1..${expectedTotal}`);
    } else {
      if (seenOrders.has(presentation_order)) fatal(`${label}.presentation_order ${presentation_order} is not globally unique`);
      seenOrders.add(presentation_order);
    }
  });

  if (phaseACount !== commitment.phase_a_presentations) {
    fatal(`secret map has ${phaseACount} Phase-A presentation(s), expected ${commitment.phase_a_presentations}`);
  }
  if (phaseBCount !== commitment.phase_b_presentations) {
    fatal(`secret map has ${phaseBCount} Phase-B presentation(s), expected ${commitment.phase_b_presentations}`);
  }

  return presentations;
}

// ---------------------------------------------------------------------------
// Run-manifest loading + per-presentation preflight.
// ---------------------------------------------------------------------------

function loadRunManifest(runDirAbs, runManifestSchema, expected) {
  const manifestPath = join(runDirAbs, "run-manifest.json");
  if (!existsSync(manifestPath)) fatal(`missing run-manifest.json in ${runDirAbs}`);
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (err) {
    fatal(`cannot read ${manifestPath}: ${err.message}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fatal(`${manifestPath} is not valid JSON: ${err.message}`);
    return;
  }
  const errors = validate(data, runManifestSchema);
  if (errors.length > 0) {
    fatal(`${manifestPath} failed schema validation: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  }
  if (data.pair_id !== expected.pairId) fatal(`${manifestPath}: pair_id ${JSON.stringify(data.pair_id)} !== expected ${JSON.stringify(expected.pairId)}`);
  if (data.phase !== expected.phase) fatal(`${manifestPath}: phase ${JSON.stringify(data.phase)} !== expected ${JSON.stringify(expected.phase)}`);
  if (data.arm !== expected.arm) fatal(`${manifestPath}: arm ${JSON.stringify(data.arm)} !== expected ${JSON.stringify(expected.arm)}`);
  return data;
}

function buildSides(presentation) {
  const rightArm = presentation.left_arm === "control" ? "treatment" : "control";
  return [
    { arm: presentation.left_arm, code: presentation.left_code },
    { arm: rightArm, code: presentation.right_code },
  ];
}

/**
 * Preflight ONE presentation: resolve both run dirs, validate their manifests,
 * validate + hash-check every artifact and screenshot path, neutralize
 * supplied-media references, and render brief-facts.md. Returns a plan
 * describing exactly what to write — performs no writes itself.
 */
function preflightPresentation(ctx, presentation) {
  const bundleDirAbs = resolveContainedChild(ctx.judgingDir, presentation.presentation_id, `bundle dir for ${presentation.presentation_id}`);
  const phaseDirName = presentation.phase === "A" ? "phase-a" : "phase-b";

  const brief = findBrief(ctx.briefIndex, presentation.phase, presentation.pair_id);

  const sidePlans = [];
  for (const side of buildSides(presentation)) {
    const sideLabel = `${presentation.pair_id}/${side.arm}`;
    const runDirRel = join(phaseDirName, presentation.pair_id, side.arm);
    const runDirAbs = resolveContainedChild(ctx.runsDir, runDirRel, `run dir for ${sideLabel}`);
    if (!existsSync(runDirAbs) || !statSync(runDirAbs).isDirectory()) {
      fatal(`missing render for ${sideLabel} (phase ${presentation.phase}): ${runDirAbs}`);
    }

    const manifest = loadRunManifest(runDirAbs, ctx.runManifestSchema, {
      pairId: presentation.pair_id,
      phase: presentation.phase,
      arm: side.arm,
    });

    const artifactEntries = [
      { key: "initial", data: manifest.artifacts.initial },
      ...(manifest.artifacts.repaired ? [{ key: "repaired", data: manifest.artifacts.repaired }] : []),
    ];

    let primaryBytes = null;
    for (const entry of artifactEntries) {
      const label = `artifacts.${entry.key} for ${sideLabel}`;
      const abs = assertPathWithinDir(entry.data.path, runDirAbs, label);
      assertRegularFile(abs, label);
      const bytes = readFileSync(abs);
      const actualHash = sha256Hex(bytes);
      if (actualHash !== entry.data.sha256) {
        fatal(`${label}: sha256 mismatch (expected ${entry.data.sha256}, got ${actualHash}): ${abs}`);
      }
      if (entry.key === manifest.artifacts.primary) primaryBytes = bytes;
    }
    if (!primaryBytes) {
      fatal(`manifest.artifacts.primary "${manifest.artifacts.primary}" has no corresponding validated artifact entry for ${sideLabel}`);
      return;
    }

    const rawHtmlOut = rewriteRelativeLinks(stripHtml(primaryBytes.toString("utf8"), side.code));
    const { htmlOut, assetCopyPlans } = neutralizeSideAssets(rawHtmlOut, ctx, brief, side.code, sideLabel);
    assertNoIdentityLeak(htmlOut, ctx.identitySets.text, `emitted HTML for ${side.code} (${sideLabel})`);

    const screenshotPlans = [];
    for (const shot of manifest.screenshots) {
      const label = `screenshot ${shot.viewport} for ${sideLabel}`;
      const abs = assertPathWithinDir(shot.path, runDirAbs, label);
      assertRegularFile(abs, label);
      const actualHash = sha256File(abs);
      if (actualHash !== shot.sha256) {
        fatal(`${label}: sha256 mismatch (expected ${shot.sha256}, got ${actualHash}): ${abs}`);
      }
      screenshotPlans.push({ srcAbs: abs, destName: `${side.code}.${shot.viewport}.png` });
    }

    sidePlans.push({ code: side.code, htmlOut, screenshotPlans, assetCopyPlans });
  }

  // Amendment item 2 (B9) — real brief-facts.md, once per presentation, from
  // the ONE canonical R1 projection.
  const assetRoles = ctx.assetRoles;
  const projected = projectBrief(brief, presentation.phase, { assetRoles });
  const briefFacts = briefFactsMarkdown(projected, presentation.phase);
  assertNoIdentityLeak(briefFacts, ctx.identitySets.text, `brief-facts.md for ${presentation.presentation_id}`);

  // Defensive: the planned filenames themselves must never carry a leak either.
  const plannedFilenames = [
    ...sidePlans.map((s) => `${s.code}.html`),
    ...sidePlans.flatMap((s) => s.screenshotPlans.map((sp) => sp.destName)),
    ...sidePlans.flatMap((s) => s.assetCopyPlans.map((a) => a.destName)),
    "brief-facts.md",
  ].join("\n");
  assertNoIdentityLeak(plannedFilenames, ctx.identitySets.filenames, `planned filenames for ${presentation.presentation_id}`);

  return { presentationId: presentation.presentation_id, bundleDirAbs, sides: sidePlans, briefFacts };
}

// ---------------------------------------------------------------------------
// Write phase — only reached once every presentation has preflighted clean.
// ---------------------------------------------------------------------------

function writeBundle(planned) {
  mkdirSync(planned.bundleDirAbs, { recursive: true });
  for (const side of planned.sides) {
    writeFileSync(join(planned.bundleDirAbs, `${side.code}.html`), side.htmlOut);
    for (const shot of side.screenshotPlans) {
      copyFileSync(shot.srcAbs, join(planned.bundleDirAbs, shot.destName));
    }
    for (const asset of side.assetCopyPlans) {
      copyFileSync(asset.srcAbs, join(planned.bundleDirAbs, asset.destName));
    }
  }
  writeFileSync(join(planned.bundleDirAbs, "brief-facts.md"), planned.briefFacts);
}

// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const specDir = args.specDir;
  const runsDir = join(specDir, "runs");
  const judgingDir = join(runsDir, "judging");

  const commitment = loadCommitment(specDir);
  const map = loadSecretMap(commitment, args.secretMap);
  const presentations = validateSecretMapStructure(map, commitment);
  const runManifestSchema = readSchema(specDir, "schemas/run-manifest.schema.json");
  const briefIndex = buildBriefIndex(specDir);
  const { byId: mediaAssetIndex } = loadMediaManifest(specDir);
  const assetRoles = assetRoleMap({ assets: [...mediaAssetIndex.values()] });

  const ctx = { specDir, runsDir, judgingDir, runManifestSchema, briefIndex, mediaAssetIndex, assetRoles };
  ctx.identitySets = buildBannedIdentitySets(ctx);

  // PREFLIGHT EVERY presentation before performing any write, so a single
  // invalid entry can never leave a partial bundle tree on disk.
  const plannedBundles = presentations.map((presentation) => preflightPresentation(ctx, presentation));

  for (const planned of plannedBundles) writeBundle(planned);

  process.stdout.write(`assembled ${plannedBundles.length} judging bundles under ${judgingDir}\n`);
}

try {
  main();
} catch (err) {
  const message = err instanceof FatalError ? err.message : err && err.stack ? err.stack : String(err);
  process.stderr.write(`FATAL: ${message}\n`);
  process.exit(1);
}
