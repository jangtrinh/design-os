// scripts/lib/checks-freeze.mjs
//
// Barrel re-export for the pre-freeze check set (PR-001..PR-015, architecture §H).
// The checks themselves live in the cohesive modules below — split out per
// Article IX / BUILD-CONTRACT follow-up (this file had grown to ~530 lines). Pure
// move, no behaviour change: same checkIds, severities, messages, mode
// assignments, and finding order as before the split. This file exists only so
// validate-prereg.mjs's `import * as freeze from "./lib/checks-freeze.mjs"` keeps
// working unchanged.
export { prFilesPresent, prSchemaValid } from "./checks-files.mjs";
export { prSelectionCount, prSelectionEnumeration, prHashesWellformed, prFailuresNoSubstitution } from "./checks-selection.mjs";
export { prCandidatesFrozen, prPatchIntegrity, prPatchClean, prFamilyBSeparation } from "./checks-candidates.mjs";
export { prPhaseAShape, prPhaseBShape, prArithmetic, prAssetsManifest, prReconciliationHashes } from "./checks-briefs.mjs";
