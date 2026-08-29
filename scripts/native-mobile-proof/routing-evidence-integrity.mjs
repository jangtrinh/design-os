import { PILOT_POLICY, ROUTING_BASE_GIT_SHA } from "./native-mobile-proof-policy.mjs";

const INSTALLED_PATHS = [
  ".claude/commands/ui/native-ios.md",
  ".claude/commands/ui/native-ipados.md",
  ".claude/skills/design-os-native-ios-craft/SKILL.md",
  ".claude/skills/design-os-native-ipados-craft/SKILL.md",
  ".agent/workflows/ui-native-ios.md",
  ".agent/workflows/ui-native-ipados.md",
  ".agent/skills/design-os-native-ios-craft/SKILL.md",
  ".agent/skills/design-os-native-ipados-craft/SKILL.md",
  "AGENTS.ease-design.json",
  "AGENTS.md",
].sort();
const FOCUSED_FILES = [
  "tests/capability-pilot-receipt.test.ts",
  "tests/capability-profile-resolution.test.ts",
  "tests/cmd-init-built-binary.test.ts",
  "tests/native-mobile-arms.test.ts",
].sort();

const exactIds = (values) => Array.isArray(values)
  && values.length === 2
  && values.map((item) => item?.request?.requestedSurface).sort().join(",") === "native-ios,native-ipados";
const exactPaths = (values, expected) => Array.isArray(values)
  && values.length === expected.length
  && values.map((item) => item?.path ?? item).sort().join("\n") === expected.join("\n");

export function verifyRoutingEvidence(report) {
  if (report?.kind !== "design-os.native-mobile-routing-evidence"
    || report?.version !== 1
    || report?.routingBaseGitSha !== ROUTING_BASE_GIT_SHA
    || !exactIds(report?.activations)
    || !exactPaths(report?.cleanConsumer?.installedArtifacts, INSTALLED_PATHS)) return false;

  for (const activation of report.activations) {
    const capabilityId = activation.request.requestedSurface;
    const policy = PILOT_POLICY[capabilityId];
    const receipt = activation.receipt;
    if (!policy
      || activation.request?.kind !== "capability-activation-request"
      || activation.request?.version !== 1
      || receipt?.kind !== "capability-activation"
      || receipt?.version !== 2
      || receipt?.requestedSurface !== capabilityId
      || receipt?.route !== capabilityId
      || receipt?.artifact !== policy.artifact
      || receipt?.routingDisposition !== "ROUTED"
      || receipt?.assurance !== "PROVISIONAL"
      || receipt?.claimPolicy !== "QUALIFIED_DELIVERY_FORBIDDEN") return false;
  }

  const hostile = report?.hostileCases;
  const gate = report?.focusedGate;
  return Array.isArray(hostile)
    && hostile.length === 1
    && hostile[0]?.request?.requestedSurface === "native-mobile"
    && hostile[0]?.result?.ok === false
    && hostile[0]?.result?.error?.code === "UNKNOWN_CAPABILITY"
    && exactPaths(gate?.files, FOCUSED_FILES)
    && gate?.totalTests === 43
    && gate?.passedTests === 43
    && gate?.failedTests === 0
    && gate?.success === true;
}
