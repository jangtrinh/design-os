/**
 * The declared name and section heuristics of the Figma ingest (the table of the registry invariant). Each one has a
 * stable id so the ledger can count it: `classifiedByHeuristic`. A heuristic never decides alone against a sensed fact:
 * see kind-classification-conflicts.ts.
 */

export const HEURISTICS = [
  "lucide-name", "icon-name", "icon-section", "digit-name", "width-1024",
  "status-emoji", "marker-stripped", "section-status-marker", "first-segment-category",
] as const;
export type Heuristic = (typeof HEURISTICS)[number];

/** How a scanned node is bucketed: a real DS component, an icon, or a full-screen frame. */
export type DsComponentKind = "icon" | "screen" | "component";

/** What the class heuristics read. */
export interface Classifiable {
  name: string;
  /** Optional: frame width in px, if the scan carries it. */
  width?: number;
  /** The enclosing page (the scan's `page`) or section name. */
  section?: string;
}

/** A very wide frame is a full screen design, not a component (only if width is known). */
export const SCREEN_MIN_WIDTH = 1024;
const LUCIDE_NAME = /lucide/i;
/** Name starts with "Icon" / "Icon /" / "Icon/" as a whole token. */
const ICON_NAME = /^icon(\s|\/|$)/i;
/** Section/page looks like the icon library (a "00"/Lucide/Icons section). */
const ICON_SECTION = /^(00\b|lucide|icons?\b)/i;
/** Name looks like a screen: leading section/screen number (e.g. "01 · Login", "10 - Bar"). */
const SCREEN_NAME = /^\d/;

/** The class a name or section heuristic gives a node, and which one fired. Icons are checked before screens. */
export function classifyHeuristic(c: Classifiable): { kind: DsComponentKind; heuristic?: Heuristic } {
  const name = c.name.trim();
  if (LUCIDE_NAME.test(name)) return { kind: "icon", heuristic: "lucide-name" };
  if (ICON_NAME.test(name)) return { kind: "icon", heuristic: "icon-name" };
  if (c.section !== undefined && ICON_SECTION.test(c.section.trim())) return { kind: "icon", heuristic: "icon-section" };
  if (SCREEN_NAME.test(name)) return { kind: "screen", heuristic: "digit-name" };
  if (typeof c.width === "number" && c.width >= SCREEN_MIN_WIDTH) return { kind: "screen", heuristic: "width-1024" };
  return { kind: "component" };
}

/** shadcn lifecycle markers: 🟢 = stable, 🔵/🟡 = beta. */
export function statusMarkerOf(text: string | undefined): "stable" | "beta" | undefined {
  if (text === undefined) return undefined;
  if (/🟢/u.test(text)) return "stable";
  if (/🔵|🟡/u.test(text)) return "beta";
  return undefined;
}

/** Drop lifecycle-marker emoji from a name so the stored name stays clean/aliasable. */
export function stripMarkers(s: string): string {
  return s.replace(/[🟢🔵🟡]/gu, "").replace(/\s+/g, " ").trim();
}

/** Archive markers: a leading cross mark, or a bracketed ARCHIVED / DEPRECATED token, any case. */
const ARCHIVE_MARKER = /^\s*❌|\[(archived|deprecated)\]/iu;
export const hasArchiveMarker = (name: string): boolean => ARCHIVE_MARKER.test(name);
export function stripArchiveMarkers(name: string): string {
  return name.replace(/^\s*❌\s*/u, "").replace(/\[(archived|deprecated)\]/giu, "").replace(/\s+/g, " ").trim();
}

/** The record-level heuristics that apply to one node that becomes a registry record. */
export function recordHeuristics(c: Classifiable): Heuristic[] {
  const out: Heuristic[] = [];
  const fromName = statusMarkerOf(c.name);
  if (fromName !== undefined) out.push("status-emoji");
  if (stripMarkers(c.name) !== c.name.trim().replace(/\s+/g, " ")) out.push("marker-stripped");
  if (fromName === undefined && statusMarkerOf(c.section) !== undefined) out.push("section-status-marker");
  if (c.name.indexOf("/") > 0) out.push("first-segment-category");
  return out;
}
