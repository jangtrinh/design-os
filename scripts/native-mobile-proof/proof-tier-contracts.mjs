const tier = (status, authorizedClaim, evidencePaths, witnessKeys) => Object.freeze({
  status,
  authorizedClaim,
  evidencePaths: Object.freeze(evidencePaths),
  witnessKeys: Object.freeze(witnessKeys),
});

export const PILOT_TIER_CONTRACTS = Object.freeze({
  "native-ios": Object.freeze({
    1: tier(
      "PASS",
      "Exact deterministic routing and fail-closed admission passed for this arm at the recorded repository SHA.",
      ["evidence/tier-01-routing.json"],
      [],
    ),
    2: tier(
      "FAIL",
      "No pure-generator Tier 2 claim is authorized. The retained origin checkpoint is valid, but final production paths have mixed Terra/Sol authorship without an immutable intermediate checkpoint.",
      [
        "evidence/tier-02-generated-apps.json",
        "apps/native-ios-tocchien-modernization/activation-receipt.json",
        "apps/native-ios-tocchien-modernization/generation-report.md",
        "evidence/tier-02-source-lineage-tocchien-v1.json",
      ],
      [
        "controllerSourceEdits",
        "controllerVerificationHarnessEdits",
        "finalSourceTreeSha256",
        "generatorId",
        "lineageDisposition",
        "originSourceTreeSha256",
      ],
    ),
    3: tier(
      "PASS",
      "Controller-replayed simulator behavior and independent visual review pass for the three TocChien screens at the exact recorded source and capture digests.",
      [
        "evidence/tier-03-simulator-captures.json",
        "evidence/tier-03-review-receipt-tocchien-v2.json",
        "evidence/tier-03-curation-tocchien-v2.json",
      ],
      ["behavior", "behaviorDisposition", "generatorId", "visual", "visualDisposition"],
    ),
    4: tier(
      "NOT RUN",
      "No physical iPhone or live VoiceOver claim is authorized.",
      ["evidence/hardware-availability.json"],
      [],
    ),
    5: tier(
      "NOT RUN",
      "No physical iPad, hardware-input, windowing, or live accessibility claim is authorized.",
      ["evidence/hardware-availability.json"],
      [],
    ),
    6: tier(
      "PASS",
      "Owner accepted the three recorded TocChien iOS screen groups at the exact source and capture hashes. Scope is simulator-rendered screen design only; physical-device, live assistive-technology, iPad visual, and assurance claims remain unavailable.",
      ["evidence/tier-06-owner-verdict-tocchien-v1.json"],
      ["ownerDisposition", "ownerScreenVerdicts", "ownerVerdict", "sourceTreeSha256"],
    ),
  }),
  "native-ipados": Object.freeze({
    1: tier(
      "PASS",
      "Exact deterministic routing and fail-closed admission passed for this arm at the recorded repository SHA.",
      ["evidence/tier-01-routing.json"],
      [],
    ),
    2: tier(
      "PASS",
      "The generated native iPadOS SwiftUI application builds and its seven unit plus five UI simulator tests pass at the recorded source digest.",
      [
        "evidence/tier-02-generated-apps.json",
        "apps/native-ipados-project-workspace/capability-activation.json",
        "apps/native-ipados-project-workspace/generation-report.md",
      ],
      ["controllerSourceEdits", "generatorId", "sourceTreeSha256"],
    ),
    3: tier(
      "PENDING",
      "Controller-replayed simulator behavior evidence supports independent scene-state and orientation-preservation claims at the exact source digest; visual craft remains unassessed.",
      ["evidence/tier-03-simulator-captures.json"],
      ["behavior", "behaviorDisposition", "generatorId", "visual", "visualDisposition"],
    ),
    4: tier(
      "NOT RUN",
      "No physical iPhone or live VoiceOver claim is authorized.",
      ["evidence/hardware-availability.json"],
      [],
    ),
    5: tier(
      "NOT RUN",
      "No physical iPad, hardware-input, windowing, or live accessibility claim is authorized.",
      ["evidence/hardware-availability.json"],
      [],
    ),
    6: tier("PENDING", "No owner-acceptance claim is authorized.", [], []),
  }),
});
