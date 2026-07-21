import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(
  process.cwd(),
  "experiments/world-class-benchmark/evidence/repeatability-study/run-packets",
);
const cases = {
  d01: {
    request: "Build a premium site-specific residential architecture landing page.",
    audience: "homeowners evaluating an architect for a mountain site",
    outcome: "understand how land and daily rituals become a buildable home",
    action: "start a project",
  },
  d02: {
    request: "Build an AI nutrition experience that helps someone understand a meal.",
    audience: "people choosing what to eat next without wanting a dense dashboard",
    outcome: "scan a meal, understand it, and choose a realistic next action",
    action: "scan a meal",
  },
  d03: {
    request: "Build a planning SaaS landing page for connected decision context.",
    audience: "teams evaluating whether reasoning can survive execution",
    outcome: "understand how outcome, owner, signals, and reasoning remain connected",
    action: "get a demo",
  },
} as const;
const workflow = "orchestrated" as const;
const floors = [
  "responsive at 390 and 1440",
  "Phosphor icons, no text glyph arrows",
  "live product UI instead of generated fake screenshots",
  "reduced motion support",
  "no unsupported claims or metrics",
];

function generationBrief(
  brief: typeof cases[keyof typeof cases],
): Record<string, unknown> {
  return {
    prompt: brief.request,
    audience: brief.audience,
    outcome: brief.outcome,
    action: brief.action,
    orchestration: {
      directions: 3,
      selectBy: "topic fit, evidence strength, execution and convergence risk",
      regions: ["hero", "proof", "context", "process or connection", "conclusion"],
      regionContract: [
        "purpose and narrative role",
        "distinct layout family",
        "composition anchor and hierarchy event",
        "visual type and rationale",
        "responsive transformation",
        "craft investment",
      ],
      imagery: [
        "plan section-specific image prompts before implementation",
        "generate or source purposeful evidence where CSS would become a placeholder",
        "keep labels, controls, data, and product state as live HTML",
        "record focal-safe crop and mobile behavior",
      ],
      hero: [
        "fit headline, copy, action, and primary demonstration in initial desktop viewport",
        "make product demonstrations show hierarchy, state, and consequence",
      ],
      depth: "preserve design investment and topic specificity through the conclusion",
      composition: "test content-led and golden candidates, release ratios when content fails",
      preflight: [
        "no placeholder primary visual",
        "no generated fake product screenshot",
        "no section-shell repetition without rationale",
        "no quality decline toward footer",
      ],
    },
  };
}

mkdirSync(root, { recursive: true });
for (const [caseId, brief] of Object.entries(cases)) {
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    const runId = `${caseId}-${workflow}-r${repeat}`;
    const packet = {
      kind: "repeatability-run",
      version: 1,
      runId,
      caseId,
      workflow,
      repeat,
      brief,
      floors,
      generationBrief: generationBrief(brief),
      isolation: {
        inspectOtherRuns: false,
        manualRepairBeforeCapture: false,
        outputDirectory: `runs/${runId}`,
      },
      capture: { viewports: [390, 1440], reducedMotion: true },
    };
    writeFileSync(join(root, `${runId}.json`), `${JSON.stringify(packet, null, 2)}\n`);
  }
}
