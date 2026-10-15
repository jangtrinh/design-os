/**
 * DS Guidelines Pack — cross-file lint (pure, no fs).
 *
 *   DUPLICATE_RULE   the same rule text sits in two different files (a pack repeats nothing)
 *   PACK_INCOMPLETE  the manifest lists a file that is gone, or a generated block that is gone,
 *                    or the manifest itself is missing/unreadable (completeness cannot be proved)
 */
import { PACK_MANIFEST_NAME } from "./ds-guidelines-model.js";
import type { Finding } from "./ds-guidelines-lint.js";
import { parseGeneratedBlocks } from "./ds-guidelines-render.js";

export interface PackText {
  path: string;
  text: string;
}

/** Rule lines shorter than this carry too little text to call a repeat (e.g. "- none"). */
const MIN_RULE_KEY_LENGTH = 20;

/** Normalised text of a list-item rule: id prefix and since/source tail removed, case and punctuation folded. */
function ruleKey(line: string): string | null {
  const m = /^\s*[-*+]\s+(.*)$/.exec(line);
  if (m === null) return null;
  const key = (m[1] ?? "")
    .replace(/^\*\*[^*]+\*\*\s*[—-]\s*/, "")
    .replace(/\s*\((?:since|source)[^)]*\)\s*$/i, "")
    .replace(/[*_`]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return key.length >= MIN_RULE_KEY_LENGTH ? key : null;
}

/**
 * Same normalised rule text in two files. The occurrence inside a generated block is the
 * canonical one (else the first); every copy in another file is reported. A ruling scoped to
 * several apps is repeated in each `apps/*.md` by design, so two app files never clash.
 */
export function findDuplicateRules(files: readonly PackText[]): Finding[] {
  interface Occurrence { file: string; line: number; generated: boolean }
  const byKey = new Map<string, Occurrence[]>();
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const blocks = parseGeneratedBlocks(f.text).blocks;
    f.text.split("\n").forEach((raw, idx) => {
      const key = ruleKey(raw);
      if (key === null) return;
      const line = idx + 1;
      const generated = blocks.some((b) => line > b.line && line < b.endLine);
      byKey.set(key, [...(byKey.get(key) ?? []), { file: f.path, line, generated }]);
    });
  }
  const findings: Finding[] = [];
  for (const occurrences of byKey.values()) {
    const canonical = occurrences.find((o) => o.generated) ?? occurrences[0];
    if (canonical === undefined) continue;
    for (const o of occurrences) {
      if (o.file === canonical.file) continue;
      if (o.file.startsWith("apps/") && canonical.file.startsWith("apps/")) continue;
      findings.push({
        code: "DUPLICATE_RULE", severity: "error", file: o.file, line: o.line,
        message: `same rule as ${canonical.file}:${canonical.line} — keep it in one file`,
      });
    }
  }
  return findings;
}

/** Compare the manifest's file list and recorded block ids with what is on disk. */
export function checkCompleteness(manifestText: string | undefined, files: readonly PackText[]): Finding[] {
  const incomplete = (file: string, message: string): Finding => ({ code: "PACK_INCOMPLETE", severity: "error", file, line: 1, message });
  if (manifestText === undefined) {
    return [incomplete(PACK_MANIFEST_NAME, "manifest is missing — run 'ui ds guidelines build' to regenerate the pack")];
  }
  let listed: { path?: unknown; blocks?: unknown }[];
  try {
    const parsed = JSON.parse(manifestText) as { files?: unknown };
    if (!Array.isArray(parsed.files)) throw new Error("no files array");
    listed = parsed.files as { path?: unknown; blocks?: unknown }[];
  } catch {
    return [incomplete(PACK_MANIFEST_NAME, "manifest is not readable JSON with a files list — run 'ui ds guidelines build' to regenerate it")];
  }
  const byPath = new Map(files.map((f) => [f.path, f.text]));
  const findings: Finding[] = [];
  for (const entry of listed) {
    if (typeof entry.path !== "string") continue;
    const text = byPath.get(entry.path);
    if (text === undefined) {
      findings.push(incomplete(entry.path, "listed in the manifest but missing from the pack"));
      continue;
    }
    const present = new Set(parseGeneratedBlocks(text).blocks.map((b) => b.id));
    const recorded = Array.isArray(entry.blocks) ? entry.blocks.filter((b): b is string => typeof b === "string") : [];
    for (const id of recorded) {
      if (!present.has(id)) findings.push(incomplete(entry.path, `generated block '${id}' is recorded in the manifest but missing from the file`));
    }
  }
  return findings;
}
