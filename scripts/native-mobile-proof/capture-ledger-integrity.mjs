import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

import { PILOT_POLICY } from "./native-mobile-proof-policy.mjs";
import { resolveContainedPath } from "./proof-path-integrity.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function verifyCaptureLedger(capture, root) {
  const findings = [];
  const captures = Array.isArray(capture?.captures) ? capture.captures : [];
  for (const [capabilityId, policy] of Object.entries(PILOT_POLICY)) {
    const entries = captures.filter((item) => item?.capabilityId === capabilityId);
    const actualPaths = entries.map((item) => item?.path).sort();
    const expectedPaths = [...policy.capturePaths].sort();
    if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
      findings.push(`${capabilityId} tier 3 capture set mismatch`);
      continue;
    }
    for (const entry of entries) {
      const nestedPath = typeof entry.path === "string" ? posix.join("evidence", entry.path) : "";
      let absolute;
      try {
        absolute = resolveContainedPath(root, nestedPath, "file");
      } catch {
        findings.push(`${capabilityId} tier 3 capture path is unsafe: ${String(entry.path)}`);
        continue;
      }
      if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") || sha256(readFileSync(absolute)) !== entry.sha256) {
        findings.push(`${capabilityId} tier 3 capture digest mismatch: ${entry.path}`);
      }
    }
  }
  const knownIds = new Set(Object.keys(PILOT_POLICY));
  if (captures.some((item) => !knownIds.has(item?.capabilityId))) findings.push("tier 3 capture ledger contains an unknown arm");
  return findings;
}
