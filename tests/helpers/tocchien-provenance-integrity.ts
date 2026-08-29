import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export type SourceRecord = { path: string; blobOid: string; byteCount: number; sha256: string };
export type TocChienProvenance = {
  legacy: { commit: string; committedAt: string; extraction: string };
  ownerAuthorization: string;
  sourceTextFiles: SourceRecord[];
  importedFiles: Array<SourceRecord & { sourcePath: string; destinationPath: string }>;
  fixtureFiles: Array<{ path: string; sha256: string }>;
};

export const expectedSourcePaths = [
  "Shared/Model/Champion.swift",
  "Shared/Model/ChampionHomeModel.swift",
  "Shared/Model/GameDictionary.swift",
];
export const legacyArchive = "showcase/native-mobile-proof-pilot/evidence/tocchien-legacy-source/tocchien-source-at-8d095f5.tar";

export const gitBlobOid = (body: Buffer) => createHash("sha1")
  .update(`blob ${body.length}\0`)
  .update(body)
  .digest("hex");

export function allFiles(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? allFiles(root, path) : [path];
  });
}

export function provenanceProblems(provenance: TocChienProvenance) {
  const problems: string[] = [];
  const validGitOid = (value: string) => /^(?!0{40}$)[0-9a-f]{40}$/.test(value);
  const validSha256 = (value: string) => /^(?!0{64}$)[0-9a-f]{64}$/.test(value);
  if (provenance.sourceTextFiles.map(({ path }) => path).join("|") !== expectedSourcePaths.join("|")) {
    problems.push("source text exact set");
  }
  if (provenance.sourceTextFiles.some((file) => !validGitOid(file.blobOid))) problems.push("source text object identity");
  if (provenance.importedFiles.some((file) => !validGitOid(file.blobOid))) problems.push("imported object identity");
  if (provenance.importedFiles.some((file) => {
    const suffix = file.destinationPath.replace(/^Resources\/Assets\.xcassets\//, "");
    const sourceGroup = suffix.includes("_champthumb.imageset/") ? "Champion Thumb" : "champion preview";
    return file.sourcePath !== `Shared/Assets.xcassets/${sourceGroup}/${suffix}`;
  })) problems.push("imported source path identity");
  if ([...provenance.sourceTextFiles, ...provenance.importedFiles].some(
    (file) => !Number.isInteger(file.byteCount) || file.byteCount <= 0 || !validSha256(file.sha256),
  )) problems.push("content digest metadata");
  return problems;
}
