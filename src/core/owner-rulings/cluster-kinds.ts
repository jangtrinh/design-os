/**
 * The closed table of cluster kinds (FR-003) — the one registry that the emitters, the question formatter,
 * the answer validator and the coverage test all read (CD-7). A kind that is not here cannot be raised;
 * adding one is a spec amendment.
 */

export const CLUSTER_KINDS = [
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
] as const;

export type ClusterKind = (typeof CLUSTER_KINDS)[number];

export interface ClusterKindSpec {
  /** Commands that may raise the kind (FR-003). */
  raisedBy: readonly string[];
  /** Set-valued kinds take a multi-select answer: `choice: [ids]` (FR-001, FR-005). */
  setValued: boolean;
  /** AskUserQuestion header; at most 12 characters. */
  header: string;
  /** Ask order, ascending: the kinds whose answer can dissolve other clusters come first (FR-001). */
  rank: number;
}

export const CLUSTER_KIND_TABLE: Readonly<Record<ClusterKind, ClusterKindSpec>> = {
  "scan-budget": { raisedBy: ["ui onboard questions"], setValued: false, header: "Scan budget", rank: 10 },
  "app-roots": { raisedBy: ["ui onboard questions"], setValued: true, header: "App roots", rank: 20 },
  "source-authority": { raisedBy: ["ui onboard questions"], setValued: false, header: "Token source", rank: 30 },
  "figma-collections": { raisedBy: ["ui ingest-figma-ds"], setValued: true, header: "Collections", rank: 40 },
  "token-path-collision": { raisedBy: ["ui ingest-figma-ds"], setValued: false, header: "Collisions", rank: 50 },
  "figma-library-pages": { raisedBy: ["ui ingest-figma-ds"], setValued: true, header: "Library page", rank: 60 },
  "screen-pages": { raisedBy: ["ui ingest-figma-ds"], setValued: true, header: "Screen pages", rank: 70 },
  "classification-conflicts": { raisedBy: ["ui ingest-figma-ds"], setValued: false, header: "Class clash", rank: 80 },
  "archived-marked-nodes": { raisedBy: ["ui ingest-figma-ds"], setValued: false, header: "Archived", rank: 90 },
  "duplicate-component-names": { raisedBy: ["ui ingest-figma-ds"], setValued: false, header: "Duplicates", rank: 100 },
  "untypeable-tokens": { raisedBy: ["ui ingest-figma-ds", "ui ds import"], setValued: false, header: "Skipped", rank: 110 },
  "ambiguous-roles": { raisedBy: ["ui ds import"], setValued: false, header: "Roles", rank: 120 },
  "component-name-collision": { raisedBy: ["ui ds surface"], setValued: false, header: "Name clash", rank: 130 },
  "inferred-links": { raisedBy: ["ui ontology build"], setValued: false, header: "Links", rank: 140 },
};

/** The kinds detected from the project itself and raised by `ui onboard questions`. */
export const PROJECT_LEVEL_KINDS: readonly ClusterKind[] = CLUSTER_KINDS.filter((k) => CLUSTER_KIND_TABLE[k].raisedBy.includes("ui onboard questions"));

export function isClusterKind(value: unknown): value is ClusterKind {
  return typeof value === "string" && (CLUSTER_KINDS as readonly string[]).includes(value);
}

/** The option id that expands a cluster into a per-member sheet (FR-001). Always the last option. */
export const REVIEW_INDIVIDUALLY = "review-individually";
