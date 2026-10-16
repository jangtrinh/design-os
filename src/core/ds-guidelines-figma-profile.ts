/**
 * DS Guidelines Pack — the Figma guidelines profile (T3) (pure, no fs).
 *
 * Limits come from Figma's help article "Add guidelines files to a design library" and live in ONE
 * constant so a change in Figma's beta is a one-line edit. Upload is manual during that beta.
 */
import type { Finding } from "./ds-guidelines-lint.js";
import { parseSlots } from "./ds-guidelines-slots.js";

export const FIGMA_PROFILE = {
  maxFiles: 8,
  minFiles: 3,
  hardBytes: 200_000,
  softBytes: 100_000,
  extensions: [".md", ".txt", ".json"],
  articleUrl: "https://help.figma.com/hc/en-us/articles/43509372175511",
  checkedOn: "2026-10-15",
} as const;

export interface BundleFileInfo {
  path: string;
  bytes: number;
  /** Present for text files, so open slots can be found. */
  text?: string;
}

const extensionOf = (path: string): string => {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot).toLowerCase();
};

/** `--budget <n>kb` → bytes. n must be a positive integer no larger than the hard cap. */
export function parseBudgetFlag(raw: string | boolean | undefined): number | { error: string } | undefined {
  if (raw === undefined) return undefined;
  const m = typeof raw === "string" ? /^(\d+)kb$/i.exec(raw) : null;
  if (m === null) return { error: `--budget must look like '120kb', got '${String(raw)}'` };
  const bytes = Number(m[1]) * 1000;
  if (bytes <= 0 || bytes > FIGMA_PROFILE.hardBytes) {
    return { error: `--budget must be between 1kb and ${FIGMA_PROFILE.hardBytes / 1000}kb (Figma's hard cap), got '${raw as string}'` };
  }
  return bytes;
}

const thousands = (n: number): string => n.toLocaleString("en-US");

/** Per-file byte listing, largest first — shown whenever a cap is hit. */
export function bytesByFile(files: readonly BundleFileInfo[]): string {
  return [...files].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).map((f) => `${f.path} ${thousands(f.bytes)} B`).join("; ");
}

/** Every Figma limit, as findings: file count, extensions, byte caps and unanswered slots. */
export function validateBundle(files: readonly BundleFileInfo[]): Finding[] {
  const findings: Finding[] = [];
  const at = (code: Finding["code"], severity: Finding["severity"], file: string, line: number, message: string): void => {
    findings.push({ code, severity, file, line, message });
  };
  const { minFiles, maxFiles, hardBytes, softBytes, extensions } = FIGMA_PROFILE;
  if (files.length < minFiles || files.length > maxFiles) {
    at("BUNDLE_FILE_COUNT", "error", ".", 1, `bundle has ${files.length} file(s); Figma accepts ${minFiles} to ${maxFiles}`);
  }
  for (const f of files) {
    if (!(extensions as readonly string[]).includes(extensionOf(f.path))) {
      at("BUNDLE_EXTENSION", "error", f.path, 1, `extension '${extensionOf(f.path) || "(none)"}' is not accepted by Figma (${extensions.join(", ")} only)`);
    }
  }
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > hardBytes) {
    at("BUDGET_EXCEEDED", "error", ".", 1, `bundle is ${thousands(total)} bytes, over Figma's ${thousands(hardBytes)}-byte cap — ${bytesByFile(files)}`);
  } else if (total > softBytes) {
    at("OVER_SOFT_BUDGET", "warning", ".", 1, `bundle is ${thousands(total)} bytes; Figma recommends staying under ${thousands(softBytes)}`);
  }
  for (const f of files) {
    if (f.text === undefined || extensionOf(f.path) === ".json") continue;
    for (const s of parseSlots(f.text).filter((x) => x.status !== "filled")) {
      at("OPEN_QUESTION", "error", f.path, s.line, `slot '${s.id}' has no complete answer — Figma guidelines must not carry open questions`);
    }
  }
  return findings;
}
