import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

import { PILOT_POLICY } from "./native-mobile-proof-policy.mjs";
import { resolveContainedPath } from "./proof-path-integrity.mjs";

const SOURCE_ALGORITHM = "design-os-source-tree-v1";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const ROOT_METADATA_NAMES = new Set([
  ".DS_Store",
  ".gitignore",
  "activation-receipt.json",
  "capability-activation.json",
  "generation-report.md",
]);

function enumerateSourceFiles(directory, current = "") {
  const records = [];
  for (const entry of readdirSync(join(directory, current), { withFileTypes: true })) {
    const rel = current ? posix.join(current, entry.name) : entry.name;
    if (current === "" && (ROOT_METADATA_NAMES.has(entry.name) || entry.name.endsWith(".xcodeproj"))) continue;
    if (entry.isSymbolicLink()) throw new Error(`source tree contains symlink: ${rel}`);
    if (entry.isDirectory()) records.push(...enumerateSourceFiles(directory, rel));
    else if (entry.isFile()) {
      const bytes = readFileSync(join(directory, ...rel.split("/")));
      records.push({ path: rel, byteCount: bytes.length, sha256: sha256(bytes) });
    }
  }
  return records.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function computeSourceTree(root, capabilityId) {
  const policy = PILOT_POLICY[capabilityId];
  if (!policy) throw new Error(`unknown proof arm: ${capabilityId}`);
  let directory;
  try {
    directory = resolveContainedPath(root, policy.appRoot, "directory");
  } catch {
    throw new Error("source tree root must be a real directory inside the proof root");
  }
  const files = enumerateSourceFiles(directory);
  const canonical = JSON.stringify({ algorithm: SOURCE_ALGORITHM, files });
  return { algorithm: SOURCE_ALGORITHM, files, sha256: sha256(canonical) };
}
