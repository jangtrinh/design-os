import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export interface MutableTier {
  id: number;
  status: string;
  authorizedClaim: string;
  environment: string;
  evidence: Array<{ path: string; sha256: string }>;
  witnesses?: {
    controllerSourceEdits?: number;
    generatorId?: string;
    sourceTreeSha256?: string;
    independentReviewerId?: string;
    blockers?: string[];
    physicalDevice?: string;
    ownerDisposition?: string;
    behaviorDisposition?: string;
    visualDisposition?: string;
    behavior?: {
      subject?: {
        capabilityId?: string;
        artifact?: string;
        briefId?: string;
        briefSha256?: string;
        sourceTreeSha256?: string;
      };
      controllerVerification?: {
        unitTests?: number;
        uiTests?: number;
        failures?: number;
        exitCode?: number;
      };
      environment?: string;
      evidence?: Array<{ path: string; sha256: string }>;
    };
    visual?: {
      reason?: string;
      currentCuration?: { path: string; sha256: string };
      reviewReceipt?: { path: string; sha256: string };
      captureLedger?: { path: string; sha256: string };
    };
  };
}

export interface MutableArm {
  capabilityId: string;
  artifact: string;
  brief: { path: string; sha256: string };
  tiers: MutableTier[];
}

export interface MutableManifest {
  kind: string;
  version: number;
  routingBaseGitSha: string;
  assurance: string;
  claimPolicy: string;
  generatedAt: string;
  knownFailures: string[];
  arms: MutableArm[];
}

function evidence(path: string, body: string) {
  return { path, sha256: sha256(body) };
}

export function validManifest(): MutableManifest {
  const makeArm = (capabilityId: "native-ios" | "native-ipados", artifact: string): MutableArm => {
    const brief = evidence(`briefs/${capabilityId}.json`, `${capabilityId}-brief`);
    const sourceTreeSha256 = sha256(`${capabilityId}-source`);
    const behaviorEvidence = evidence(`evidence/${capabilityId}/tier-3.json`, `${capabilityId}-tier-3`);
    return {
      capabilityId,
      artifact,
      brief,
      tiers: [
      {
        id: 1,
        status: "PASS",
        authorizedClaim: "Exact deterministic routing and fail-closed admission passed for this arm at the recorded repository SHA.",
        environment: "Node 22 on macOS 26.5.2",
        evidence: [evidence(`evidence/${capabilityId}/tier-1.json`, `${capabilityId}-tier-1`)],
      },
      {
        id: 2,
        status: "PENDING",
        authorizedClaim: "No generated-app claim is authorized until this tier passes.",
        environment: "Xcode 26.5",
        evidence: [],
      },
      {
        id: 3,
        status: "PENDING",
        authorizedClaim: "No visual craft claim is authorized until an independent v2 review passes.",
        environment: "iOS 26.5 simulator matrix",
        evidence: [behaviorEvidence],
        witnesses: {
          generatorId: `${capabilityId}-generator`,
          behaviorDisposition: "PASS",
          visualDisposition: "UNASSESSED",
          behavior: {
            subject: {
              capabilityId,
              artifact,
              briefId: `${capabilityId}-brief`,
              briefSha256: brief.sha256,
              sourceTreeSha256,
            },
            controllerVerification: { unitTests: 1, uiTests: 1, failures: 0, exitCode: 0 },
            environment: "iOS 26.5 simulator matrix",
            evidence: [behaviorEvidence],
          },
          visual: { reason: "No v2 visual curation exists." },
        },
      },
      {
        id: 4,
        status: "NOT RUN",
        authorizedClaim: "No physical iPhone or live VoiceOver claim is authorized.",
        environment: "No physical device connected",
        evidence: [],
      },
      {
        id: 5,
        status: "NOT RUN",
        authorizedClaim: "No physical iPad, hardware-input, windowing, or live accessibility claim is authorized.",
        environment: "No physical device connected",
        evidence: [],
      },
      {
        id: 6,
        status: "PENDING",
        authorizedClaim: "No owner-acceptance claim is authorized.",
        environment: "Owner review not performed",
        evidence: [],
      },
    ],
    };
  };

  return {
    kind: "design-os.native-mobile-proof",
    version: 2,
    routingBaseGitSha: "a".repeat(40),
    assurance: "PROVISIONAL",
    claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN",
    generatedAt: "2026-08-29T04:00:00.000Z",
    knownFailures: ["unfiltered Xcode 26.5 accessibility audit"],
    arms: [
      makeArm("native-ios", "native-ios-application"),
      makeArm("native-ipados", "native-ipados-application"),
    ],
  };
}

export function copyCheckedProofTree(): { manifest: MutableManifest; root: string } {
  const parent = mkdtempSync(join(tmpdir(), "native-mobile-proof-checked-"));
  const root = join(parent, "proof");
  cpSync("showcase/native-mobile-proof-pilot", root, { recursive: true });
  return {
    manifest: JSON.parse(readFileSync(join(root, "proof-manifest.json"), "utf8")) as MutableManifest,
    root,
  };
}

export function writeJson(path: string, value: unknown): string {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, body);
  return sha256(body);
}

export function replaceEvidenceDigest(manifest: MutableManifest, path: string, digest: string): void {
  for (const arm of manifest.arms) {
    for (const tier of arm.tiers) {
      for (const ref of tier.evidence) {
        if (ref.path === path) ref.sha256 = digest;
      }
    }
  }
}
