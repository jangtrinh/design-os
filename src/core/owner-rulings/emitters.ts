/**
 * The one emitter registry: static imports only, so an emitter nothing imports cannot be silently absent and the
 * production binary cannot load one from outside itself. A kind is either in EMITTERS or in KINDS_WITHOUT_EMITTER;
 * a test asserts the two are disjoint and together equal the kinds table, and runs every emitter on its fixtures.
 * Adding an emitter means importing it here and moving its kind out of KINDS_WITHOUT_EMITTER.
 */
import type { ClusterKind } from "./cluster-kinds.js";
import type { KindEmitter } from "./kind-emitter.js";

export const EMITTERS: readonly KindEmitter[] = [];

export const KINDS_WITHOUT_EMITTER: readonly ClusterKind[] = [
  "figma-collections",
  "token-path-collision",
  "figma-library-pages",
  "screen-pages",
  "archived-marked-nodes",
  "duplicate-component-names",
  "classification-conflicts",
  "untypeable-tokens",
  "ambiguous-roles",
  "scan-budget",
  "app-roots",
  "source-authority",
  "component-name-collision",
  "inferred-links",
];
