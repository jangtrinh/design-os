import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const SCOPE = "agent-skills/web-design";
const TEXT_EXTENSIONS = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mdx", ".mjs", ".rst",
  ".scss", ".svg", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const CATEGORIES = ["core", "style", "vendor", "composite"];
const DISPOSITIONS = ["adopted", "covered-existing", "rejected"];
const MENGTO_REVISION = "4c716b516b6b0143f3037631306b3730d2832344";
const MENGTO_COUNTS = {
  skillRecordCount: 88,
  categoryCounts: { core: 37, style: 27, vendor: 15, composite: 9 },
  dispositionCounts: { adopted: 34, "covered-existing": 41, rejected: 13 },
};

export function parseArgs(argv, required) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`malformed arguments near ${flag ?? "<end>"}`);
    }
    values[flag.slice(2)] = value;
  }
  for (const key of required) if (!values[key]) throw new Error(`missing --${key}`);
  if (!/^[0-9a-f]{40}$/.test(values.revision)) throw new Error("revision must be 40 lowercase hex characters");
  return values;
}
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function checkedOutBlob(corpus, entry) {
  const bytes = readFileSync(join(corpus, entry.path));
  const objectId = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (objectId !== entry.gitObjectId) {
    throw new Error(`checked-out bytes do not match pinned blob ${entry.path}`);
  }
  return bytes;
}
export function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error(`cannot read JSON ${path}: ${error.message}`); }
}
export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
export function git(corpus, args, encoding = null) {
  try {
    return execFileSync("git", ["-C", corpus, ...args], {
      encoding, maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
    });
  } catch (error) {
    throw new Error(`git ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

export function enumerate(corpus, revision) {
  git(corpus, ["cat-file", "-e", `${revision}^{commit}`]);
  const output = git(corpus, ["ls-tree", "-r", "-t", "-l", "--full-tree", revision, "--", SCOPE], "utf8");
  return output.trim().split("\n").filter(Boolean).map((line) => {
    const [metadata, path] = line.split("\t");
    const [mode, objectType, gitObjectId, size] = metadata.trim().split(/\s+/);
    return { path, mode, objectType, gitObjectId, byteCount: objectType === "blob" ? Number(size) : undefined };
  }).filter((entry) => entry.path.startsWith(`${SCOPE}/`))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function artifactClass(path) {
  const lower = path.toLowerCase();
  const file = basename(lower);
  const extension = extname(lower);
  if (!TEXT_EXTENSIONS.has(extension)) return "binary-asset";
  if (file.includes("license")) return "license-notice";
  if (file === "skill.md") return "skill";
  if (file === "source.json") return "source-metadata";
  if (lower.includes("/agents/") && [".yaml", ".yml"].includes(extension)) return "agent-yaml";
  if (/\.min\.(js|css)$/.test(file)) return "vendored-minified-js";
  if (extension === ".html") return "demo-html";
  if (file.includes("prompt") || lower.includes("/prompts/")) return "prompt";
  if ([".css", ".js", ".jsx", ".mjs", ".scss", ".svg", ".ts", ".tsx"].includes(extension)) return "authored-code";
  if ([".md", ".mdx", ".rst", ".txt"].includes(extension)) return "reference/article";
  return "other-text";
}

function countBy(rows, field, keys) {
  return Object.fromEntries(keys.map((key) => [key, rows.filter((row) => row[field] === key).length]));
}

export function duplicateBlobGroups(records) {
  const pathsByHash = new Map();
  for (const record of records) {
    if (record.objectType !== "blob") continue;
    const paths = pathsByHash.get(record.sha256) ?? [];
    paths.push(record.path);
    pathsByHash.set(record.sha256, paths);
  }
  return [...pathsByHash.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ sha256: hash, paths: paths.sort() }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}

export function findNeuformOwners(corpus, entries) {
  return new Set(entries
    .filter((entry) => entry.objectType === "blob" && entry.path.endsWith("/demo/source.json"))
    .filter((entry) => checkedOutBlob(corpus, entry).toString("utf8").toLowerCase().includes("neuform"))
    .map((entry) => entry.path.slice(`${SCOPE}/`.length).split("/")[0]));
}

export function verifyRootLicenseEvidence(corpus, revision, upstream) {
  const evidence = upstream?.rootLicenseEvidence;
  if (upstream?.rootLicense !== "MIT" || evidence?.path !== "LICENSE") {
    throw new Error("root MIT license requires pinned LICENSE evidence");
  }
  const line = git(corpus, ["ls-tree", "-l", revision, "--", evidence.path], "utf8").trim();
  if (!line) throw new Error("pinned root LICENSE is missing");
  const [metadata, path] = line.split("\t");
  const [mode, objectType, gitObjectId, byteCount] = metadata.split(/\s+/);
  if (path !== evidence.path || objectType !== "blob") throw new Error("root LICENSE evidence is not a blob");
  const bytes = git(corpus, ["cat-file", "blob", gitObjectId]);
  const actual = { path, mode, gitObjectId, byteCount: Number(byteCount), sha256: sha256(bytes) };
  if (JSON.stringify(actual) !== JSON.stringify(evidence)) throw new Error("root LICENSE evidence mismatch");
}

export function validateDecisions(value, revision) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.skills)) throw new Error("decisions require schemaVersion 1 and skills[]");
  if (value.upstream?.revision !== revision) throw new Error("decisions upstream revision mismatch");
  if (!value.upstream?.repository || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.upstream?.capturedAt ?? "")) {
    throw new Error("decisions upstream metadata incomplete");
  }
  const seen = new Set();
  for (const row of value.skills) {
    if (!row.skill || seen.has(row.skill)) throw new Error(`invalid or duplicate skill ${row.skill}`);
    seen.add(row.skill);
    if (!CATEGORIES.includes(row.category) || !DISPOSITIONS.includes(row.disposition)) throw new Error(`invalid decisions enum for ${row.skill}`);
    if (!row.reason?.trim() || !Array.isArray(row.techniqueIds) || !Array.isArray(row.existingKnowledgeRefs)) throw new Error(`incomplete decisions row ${row.skill}`);
    if (row.disposition === "adopted" && row.techniqueIds.length === 0) throw new Error(`adopted ${row.skill} requires techniqueIds`);
    if (row.disposition === "covered-existing" && row.techniqueIds.length + row.existingKnowledgeRefs.length === 0) throw new Error(`covered-existing ${row.skill} requires a destination`);
    if (row.disposition === "rejected" && row.techniqueIds.length + row.existingKnowledgeRefs.length > 0) throw new Error(`rejected ${row.skill} cannot have a destination`);
  }
  const actual = {
    skillRecordCount: value.skills.length,
    categoryCounts: countBy(value.skills, "category", CATEGORIES),
    dispositionCounts: countBy(value.skills, "disposition", DISPOSITIONS),
  };
  if (JSON.stringify(actual) !== JSON.stringify(value.expected)) throw new Error("decisions expected counts mismatch");
  if (revision === MENGTO_REVISION && JSON.stringify(actual) !== JSON.stringify(MENGTO_COUNTS)) {
    throw new Error("decisions do not match the approved MengTo count baseline");
  }
  return actual;
}

export function sourceRecord(corpus, entry, skillMap, neuformOwners = new Set()) {
  if (entry.objectType === "tree") return { path: entry.path, mode: entry.mode, objectType: "tree", gitObjectId: entry.gitObjectId };
  const bytes = checkedOutBlob(corpus, entry);
  const relative = entry.path.slice(`${SCOPE}/`.length);
  const ownerSkill = relative.includes("/") ? relative.split("/")[0] : null;
  const decision = ownerSkill ? skillMap.get(ownerSkill) : null;
  if (ownerSkill && !decision) throw new Error(`no decision for owner skill ${ownerSkill}`);
  const kind = ownerSkill ? artifactClass(entry.path) : "root-support";
  const neuformDerived = Boolean(ownerSkill && neuformOwners.has(ownerSkill) && relative.startsWith(`${ownerSkill}/demo/`));
  const quarantined = neuformDerived || !decision || decision.disposition === "rejected" || [
    "agent-yaml", "binary-asset", "license-notice", "source-metadata", "vendored-minified-js",
  ].includes(kind);
  const licenseEvidence = kind === "license-notice"
    ? "embedded-license-notice"
    : neuformDerived
      ? "license-unverified-quarantine"
    : ["binary-asset", "source-metadata"].includes(kind)
      ? "no-per-asset-license-field"
      : kind === "vendored-minified-js"
        ? "license-unverified-quarantine"
        : decision ? "repository-root-MIT" : "repository-support-only";
  const legalDisposition = kind === "license-notice"
    ? "license-evidence-only"
    : quarantined ? "metadata-only-quarantine" : "idea-only-independent-rewrite";
  return {
    path: entry.path, mode: entry.mode, objectType: "blob", gitObjectId: entry.gitObjectId,
    byteCount: bytes.length, sha256: sha256(bytes), artifactClass: kind, ownerSkill,
    provenance: neuformDerived ? "neuform-synchronized" : undefined,
    inspectionStatus: neuformDerived || ["binary-asset", "vendored-minified-js"].includes(kind) ? "not-inspected" : "statically-inspected",
    adoptability: quarantined ? "not-adoptable" : "idea-only",
    thirdPartyMarker: neuformDerived || ["binary-asset", "license-notice", "source-metadata", "vendored-minified-js"].includes(kind),
    licenseEvidence,
    legalDisposition,
    disposition: decision?.disposition ?? "rejected", techniqueIds: decision?.techniqueIds ?? [],
    existingKnowledgeRefs: decision?.existingKnowledgeRefs ?? [], reason: decision?.reason ?? "Root support metadata only",
  };
}
