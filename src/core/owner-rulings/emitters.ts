/**
 * The one emitter registry: static imports only, so an emitter nothing imports cannot be silently absent and the
 * production binary cannot load one from outside itself. A kind is either in EMITTERS or in KINDS_WITHOUT_EMITTER;
 * a test asserts the two are disjoint and together equal the kinds table, and runs every emitter on its fixtures.
 * Adding an emitter means importing it here and moving its kind out of KINDS_WITHOUT_EMITTER.
 */
import type { ClusterKind } from "./cluster-kinds.js";
import type { KindEmitter } from "./kind-emitter.js";
import { ambiguousRolesEmitter } from "./kind-ambiguous-roles.js";
import { appRootsEmitter } from "./kind-app-roots.js";
import { archivedMarkedNodesEmitter } from "./kind-archived-marked-nodes.js";
import { classificationConflictsEmitter } from "./kind-classification-conflicts.js";
import { componentNameCollisionEmitter } from "./kind-component-name-collision.js";
import { componentSourceMatchEmitter } from "./kind-component-source-match.js";
import { duplicateComponentNamesEmitter } from "./kind-duplicate-component-names.js";
import { figmaCollectionsEmitter } from "./kind-figma-collections.js";
import { figmaLibraryPagesEmitter } from "./kind-figma-library-pages.js";
import { scanBudgetEmitter } from "./kind-scan-budget.js";
import { screenPagesEmitter } from "./kind-screen-pages.js";
import { sourceAuthorityEmitter } from "./kind-source-authority.js";
import { tokenPathCollisionEmitter } from "./kind-token-path-collision.js";
import { untypeableTokensEmitter } from "./kind-untypeable-tokens.js";

export const EMITTERS: readonly KindEmitter[] = [
  figmaCollectionsEmitter,
  tokenPathCollisionEmitter,
  figmaLibraryPagesEmitter,
  screenPagesEmitter,
  archivedMarkedNodesEmitter,
  duplicateComponentNamesEmitter,
  classificationConflictsEmitter,
  untypeableTokensEmitter,
  ambiguousRolesEmitter,
  scanBudgetEmitter,
  appRootsEmitter,
  sourceAuthorityEmitter,
  componentNameCollisionEmitter,
  componentSourceMatchEmitter,
];

export const KINDS_WITHOUT_EMITTER: readonly ClusterKind[] = [
  "inferred-links",
];
