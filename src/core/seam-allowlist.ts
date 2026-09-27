import type { ProseRead } from "./seam-scan.js";
export interface SeamAllowance extends ProseRead { data: string; proposedJsonHome: string }
export interface SeamFinding { checkId: string; severity: "error"; message: string; line?: number }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export function parseSeamAllowlist(raw: string): SeamAllowance[] {
  const doc: unknown = JSON.parse(raw);
  if (!record(doc) || doc["version"] !== 1 || !Array.isArray(doc["reads"])) throw new Error("expected { version: 1, reads: [...] }");
  const locations = new Set<string>();
  return doc["reads"].map((entry: unknown, index: number) => {
    if (!record(entry) || !nonempty(entry["file"]) || !/^src\/.+\.[cm]?[jt]sx?$/.test(entry["file"]) ||
      entry["file"].split("/").includes("..") || !Number.isInteger(entry["line"]) || Number(entry["line"]) < 1 ||
      !nonempty(entry["readCall"]) || !Array.isArray(entry["paths"]) || !entry["paths"].length || !entry["paths"].every(nonempty) ||
      !nonempty(entry["data"]) || !nonempty(entry["proposedJsonHome"])) throw new Error(`invalid read entry ${index + 1}; require file, line, readCall, paths, data, proposedJsonHome`);
    const location = `${entry["file"]}:${entry["line"]}:${entry["readCall"]}`;
    if (locations.has(location)) throw new Error(`duplicate read entry ${index + 1}: ${location}`);
    locations.add(location);
    return entry as unknown as SeamAllowance;
  });
}
const identity = (read: ProseRead) => JSON.stringify([read.file, read.readCall, [...read.paths].sort()]);
export function lintSeamReads(reads: ProseRead[], allowed: SeamAllowance[]) {
  const remaining = [...allowed]; const findings: SeamFinding[] = []; let newCount = 0;
  for (const read of reads) {
    const index = remaining.findIndex((entry) => identity(entry) === identity(read));
    if (index >= 0) remaining.splice(index, 1);
    else {
      newCount++;
      findings.push({ checkId: "seam-new-read", severity: "error", line: read.line,
        message: `${read.file}:${read.line}: unlisted runtime prose read: ${read.readCall}` });
    }
  }
  for (const entry of remaining) findings.push({ checkId: "seam-stale-entry", severity: "error", line: entry.line,
    message: `${entry.file}:${entry.line}: allowance no longer matches a read; remove it` });
  return { reads, readCount: reads.length, allowedCount: allowed.length, newCount, staleCount: remaining.length,
    findings, errorCount: findings.length, warningCount: 0 };
}
