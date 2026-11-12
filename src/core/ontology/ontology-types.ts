/**
 * The shapes of the design ontology (`design-os-ontology/1`): the node kinds, the link kinds, and the report that
 * says, for every source, whether it was read, missing or never sensed. The file carries no time, no absolute path
 * and no position in a source: an id is `<kind>:<key>` and the key survives a reordering of its source.
 */

export const ONTOLOGY_SCHEMA = "design-os-ontology/1";
export const ONTOLOGY_REL = "design/knowledge/ontology.json";

export const NODE_KINDS = ["project", "token", "component", "screen", "rule", "gate", "ruling", "principle", "term", "pattern", "app", "feature"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
/** The kinds the kernel itself owns: always reachable from the kind table, so never an orphan. */
export const STRUCTURAL_KINDS: readonly NodeKind[] = ["project", "gate"];

export const LINK_KINDS = ["uses-component", "consumes-token", "constrains", "checked-by", "belongs-to", "governs", "superseded-by", "defines"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export interface OntNode {
  id: string;
  kind: NodeKind;
  name: string;
  /** Set only by an owner ruling (a term ruled standalone). */
  standalone?: true;
  /** Kind-specific facts, sorted by key when written. Never a line number, an absolute path or a time. */
  [field: string]: unknown;
}
export interface OntLink { kind: LinkKind; from: string; to: string }

/** One source of nodes: what the build found, so "0 nodes" is never silent. */
export interface SourceReport {
  kind: NodeKind;
  status: "read" | "missing" | "not-sensed";
  nodes: number;
  /** One plain line: what was read, or why it was not and which command produces it. */
  note: string;
  /** A source with two doors (`screen`: Figma and code) keeps one status per door, so a door never sensed stays visible next to one that was read. */
  doors?: SourceDoor[];
  /** Entries the reader met in the source (rulings, principles, screens-meta entries). */
  seen?: number;
  /** Reason -> how many entries or values were left out, present only when something was. */
  leftOut?: Record<string, number>;
  /** Component sources only: reason -> how many components carry no area, present only when some do. */
  withoutArea?: Record<string, number>;
}
export interface SourceDoor { door: "figma" | "code"; status: SourceReport["status"]; nodes: number; note: string }

/** A reference that matches nothing, or a link whose source was never sensed, counted per link kind. */
export interface LinkReport {
  link: LinkKind;
  written: number;
  /** References that matched no node: never matched to the nearest name. */
  unresolved: number;
  /** Links whose source field the host never sensed. */
  notSensed: number;
  /** Why, and which command would sense it (present when `notSensed` is above 0). */
  notSensedReason?: string;
  /** Rules no gate evaluates (checked-by only). */
  notChecked?: number;
  /** Plain-language detail lines, sorted. */
  details: string[];
}

export interface Ontology {
  schema: typeof ONTOLOGY_SCHEMA;
  nodes: OntNode[];
  links: OntLink[];
  sources: SourceReport[];
  linkReports: LinkReport[];
  /** Proposals waiting for a ruling: not nodes. */
  proposals: { rules: number; soul: number };
  /** Orphans no question covers, per kind (a node with no candidate raises nothing); `withCountedReference`: how many of them had a reference counted as unresolved or not understood (absent when 0). */
  uncovered: { kind: NodeKind; count: number; withCountedReference?: number }[];
}

export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
