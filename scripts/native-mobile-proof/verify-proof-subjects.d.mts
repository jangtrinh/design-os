export declare const PILOT_POLICY: Readonly<Record<string, Readonly<Record<string, string | number>>>>;
export declare function computeSourceTree(root: string, capabilityId: string): {
  algorithm: string;
  files: Array<{ path: string; byteCount: number; sha256: string }>;
  sha256: string;
};
export declare function verifyProofSubjects(manifest: Record<string, unknown>, root: string): string[];
