// scripts/lib/checks-render.mjs
//
// Barrel re-export for the pre-render / post-render check set (PR-016..PR-024,
// PR-030, architecture §H). The checks themselves live in the cohesive modules
// below — split out per Article IX / BUILD-CONTRACT follow-up (this file had grown
// to ~320 lines). Pure move, no behaviour change: same checkIds, severities,
// messages, mode assignments, and finding order as before the split. This file
// exists only so validate-prereg.mjs's
// `import * as render from "./lib/checks-render.mjs"` keeps working unchanged.
export { prCommitmentValid, prCommitmentPrecedesRender, prCleanTree } from "./checks-commitment.mjs";
export { prPreregCommitRecorded, prManifestComplete, prRepairLegality, prNoRegeneration } from "./checks-run-evidence.mjs";
export { prBlindingLeakScan, prVoteCoverage, prCuratorBlindnessShape } from "./checks-judging.mjs";
