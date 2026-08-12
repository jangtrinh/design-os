import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validPromptPlan } from "../../../tests/fixtures/prompt-plan/prompt-plan-fixture.js";

const cases = [
  {
    id: "d01-architecture",
    surface: "marketing-landing",
    request: "Build a premium architecture landing page from the supplied reference",
    audience: "homeowners evaluating a site-specific residential architect",
    change: "understand how the studio turns land and rituals into a buildable home",
    action: "start a project",
    regions: ["hero", "site-reading", "material-proof", "process", "conclusion"],
  },
  {
    id: "d02-nutrition",
    surface: "product-app",
    request: "Build a responsive AI nutrition product experience from the supplied reference",
    audience: "people choosing what to eat next without wanting another dense dashboard",
    change: "turn one meal scan into an understandable next choice",
    action: "scan a meal",
    regions: ["capture", "decode", "day-context", "recommendation", "next-action"],
  },
  {
    id: "d03-planning",
    surface: "marketing-landing",
    request: "Build a planning SaaS landing page from the supplied reference",
    audience: "teams evaluating whether planning context can survive execution",
    change: "see how outcomes, ownership, signals, and decisions remain connected",
    action: "get a demo",
    regions: ["hero", "outcome-frame", "decision-path", "integration-proof", "conclusion"],
  },
];

function productionRegion(id: string, index: number): Record<string, unknown> {
  const models = [
    "asymmetric outcome stage",
    "pinned evidence sequence",
    "horizontal proof field",
    "interactive process rail",
    "focused action conclusion",
  ];
  const visualType = index === 0 || index === 2
    ? "generated-image"
    : index === 3 ? "interaction" : "typography";
  return {
    id, purpose: `Resolve ${id.replaceAll("-", " ")}`,
    role: index === 0 ? "establish product outcome" :
      index === 4 ? "convert accumulated proof into one action" : "advance evidence",
    entryState: index === 0 ? "cold arrival" : "prior claim established",
    exitState: index === 4 ? "primary action understood" : "next question prepared",
    contentDependency: `approved ${id} content and evidence`,
    layoutModel: models[index],
    compositionAnchor: index % 2 === 0 ? "content edge" : "evidence focal line",
    hierarchyEvent: "one dominant transition tied to the region job",
    alignmentKeylines: "page grid, readable copy line, media focal line",
    contentMeasure: "45-68 characters",
    groupingModel: "proximity and one meaningful boundary",
    interaction: "visible focus, feedback, loading, empty, error, and success",
    responsiveTransformation: "release split and preserve semantic source order at content failure",
    memorableDetail: `topic-coupled ${id} transition`,
    antiPattern: "interchangeable cards or decorative timeline",
    craftInvestment: index === 0 || index === 4 ? "signature" : "production",
    visualType,
    visualRationale: visualType === "generated-image"
      ? "section-specific imagery supplies product or material evidence"
      : "live content and behavior communicate this region more clearly than decorative imagery",
    ...(visualType === "generated-image" ? { assetId: `asset-${id}` } : {}),
  };
}

function visualAsset(id: string, index: number): Record<string, unknown> {
  return {
    id: `asset-${id}`,
    source: "imagegen",
    provenance: "generated",
    subject: `section-specific ${id.replaceAll("-", " ")} visual`,
    narrativeJob: index === 0 ? "establish context and outcome" : "supply concrete proof",
    aspectRatio: index === 0 ? "4:5" : "3:4",
    focalSafeArea: "subject remains clear of live copy and controls",
    cropBehavior: "preserve semantic focal point from 390-1440 pixels",
    altText: `Visual evidence for ${id.replaceAll("-", " ")}`,
    loadingPriority: index === 0 ? "eager above the fold" : "lazy below the fold",
    mobileTransformation: "stack in source order with protected focal crop",
    usedIn: [id],
  };
}

const output = join(process.cwd(), "experiments/world-class-benchmark/evidence/prompt-plans");
mkdirSync(output, { recursive: true });

for (const benchmark of cases) {
  const plan = validPromptPlan(benchmark.surface);
  plan["id"] = `prompt-plan-${benchmark.id}`;
  plan["rawRequest"] = benchmark.request;
  plan["productTruth"] = {
    audienceSituation: benchmark.audience,
    desiredChange: benchmark.change,
    primaryOutcome: "qualified understanding before commitment",
    primaryAction: benchmark.action,
    availableProof: ["supplied reference", "approved case content", "local production assets"],
    prohibitedClaims: ["invented metrics", "unsupported customer claims"],
    decisionChangingUnknowns: [],
    contentInventory: benchmark.regions,
  };
  plan["pageNarrative"] = {
    thesis: `${benchmark.change}, then make ${benchmark.action} feel earned`,
  };
  plan["regions"] = benchmark.regions.map(productionRegion);
  (plan["deliveryPlan"] as Record<string, unknown>)["assets"] = benchmark.regions
    .map(productionRegion)
    .filter((region) => region["visualType"] === "generated-image")
    .map((region, index) => visualAsset(String(region["id"]), index));
  const proportions = plan["proportionCandidates"] as Array<Record<string, unknown>>;
  proportions[0]!["regionGeometry"] = benchmark.regions.map(
    (id) => `${id}: content minimums determine measure and span`,
  );
  proportions[1]!["regionGeometry"] = benchmark.regions.map(
    (id, index) => `${id}: ${index < 2 ? "phi candidate" : "content-led release"}`,
  );
  proportions[1]!["ratioApplications"] = [{
    regionId: benchmark.regions[0],
    target: "primary copy and media span",
    ratio: 1.618,
    contentRationale: "headline measure and focal-safe media both remain within minimums",
    fallback: "release to content-led split, then semantic stack",
    nestingDepth: 1,
    applicationsInRegion: 1,
  }];
  plan["builderPacket"] = {
    ref: `builder-packets/${benchmark.id}.md`,
    tokenCount: 5200,
  };
  writeFileSync(
    join(output, `${benchmark.id}.prompt-plan.json`),
    `${JSON.stringify(plan, null, 2)}\n`,
  );
}
