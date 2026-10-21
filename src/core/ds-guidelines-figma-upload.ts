/**
 * DS Guidelines Pack — `UPLOAD.md` for a Figma bundle (pure, no fs).
 *
 * It sits BESIDE the bundle folder, never inside it, so it is not uploaded by mistake.
 * Upload is manual: Figma exposes no API for guidelines files during its beta.
 */
import { FIGMA_PROFILE } from "./ds-guidelines-figma-profile.js";
import type { TrimEntry } from "./ds-guidelines-budget.js";

export interface UploadInput {
  designSystem: string;
  /** Date part of the pack's `generatedAt`, so the same pack always gives the same UPLOAD.md. */
  generatedOn: string;
  folder: string;
  files: { path: string; bytes: number }[];
  warnings: string[];
  trimmed: TrimEntry[];
  /** Store files that no longer matched their sealed hash when the pack was built. */
  unverifiedSources: string[];
}

const thousands = (n: number): string => n.toLocaleString("en-US");

export function renderUpload(i: UploadInput): string {
  const total = i.files.reduce((n, f) => n + f.bytes, 0);
  const lines = [
    `# Upload the ${i.designSystem} guidelines to Figma`,
    "",
    `Pack built ${i.generatedOn}. Upload is manual: Figma exposes no API for guidelines files during its beta.`,
    "",
    "## Steps",
    "",
    "1. Open the library file in Figma.",
    "2. Choose Library → Manage guidelines…",
    "3. Choose Upload and select every file in the folder below.",
    "4. Apply changes.",
    "",
    `Folder to upload: \`${i.folder}\``,
    "",
    "## Files",
    "",
    "| File | Bytes |",
    "|---|---|",
    ...i.files.map((f) => `| ${f.path} | ${thousands(f.bytes)} |`),
    `| **Total** | **${thousands(total)}** |`,
    "",
    `Figma accepts ${FIGMA_PROFILE.minFiles} to ${FIGMA_PROFILE.maxFiles} files (${FIGMA_PROFILE.extensions.join(", ")}) up to ${thousands(FIGMA_PROFILE.hardBytes)} bytes in total and recommends staying under ${thousands(FIGMA_PROFILE.softBytes)}.`,
    `Limits checked ${FIGMA_PROFILE.checkedOn} against ${FIGMA_PROFILE.articleUrl}`,
  ];
  if (i.warnings.length > 0) lines.push("", "## Warnings", "", ...i.warnings.map((w) => `- ${w}`));
  if (i.trimmed.length > 0) {
    lines.push("", "## Trimmed to fit the budget", "");
    for (const t of i.trimmed) lines.push(`- ${t.file}: dropped ${t.rulesDropped} rule(s), saved ${thousands(t.bytesSaved)} bytes — ${t.ids.join(", ")}`);
  }
  if (i.unverifiedSources.length > 0) {
    lines.push(
      "", "## Sources unverified", "",
      `Sources unverified: ${i.unverifiedSources.join(", ")} no longer matched the sealed hash when this pack was built, so the guidelines were written from a store nobody has verified. Re-seal the design system, or accept that risk, before uploading.`,
    );
  }
  return lines.join("\n") + "\n";
}
