interface SourceFileRecord {
  path: string;
  byteCount: number;
  sha256: string;
}

interface SourceTreeRecord {
  algorithm: string;
  files: SourceFileRecord[];
  sha256: string;
}

export function verifyPromotionCandidate(root: string): {
  findings: string[];
  sourceTree: SourceTreeRecord;
};
