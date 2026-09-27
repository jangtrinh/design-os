/**
 * Route rules and the D4 receipt for a design brief. Pure and fs-free: takes a
 * schema-valid brief, returns the fields that still block its route plus the
 * B / R / L numbers and the CONTINUE | BLOCKED decision.
 *
 * Landing surfaces keep today's rules (nothing extra blocks). Every other surface
 * is checked for what its route needs; `unknown`-provenance assumptions are open
 * questions and block there too.
 */

export type BriefRecord = Record<string, unknown>;

export interface BlockingField {
  /** Stable field path: screens | screens[<id>].states | roles | status | copyLanguage | assumption:<facet>. */
  field: string;
  reason: string;
  /** True when a wrong guess changes the route or cannot be undone. */
  routeChanging: boolean;
}

export interface D4Receipt {
  B: number;
  R: boolean;
  L: number;
  decision: "CONTINUE" | "BLOCKED";
  thresholds: { maxB: number; maxL: number };
  blocking: string[];
  routeChanging: string[];
}

/** Surfaces whose routes need screens, roles and a status vocabulary. */
export const APP_SURFACES = ["web-app", "dashboard", "mobile-app"] as const;
const LANDING_SURFACES = ["landing", "marketing-landing"];
/** Fields whose wrong value changes the route or is one-way (D4's R input). `screens` joins the four named in the plan: no screen list means no route. */
export const ROUTE_CHANGING_FIELDS = ["surface", "screens", "roles", "status", "prohibitedClaims"] as const;
export const D4_MAX_B = 2;
export const D4_MAX_L = 3;

const isRecord = (v: unknown): v is BriefRecord => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): BriefRecord[] => (Array.isArray(v) ? v.filter(isRecord) : []);

/** `base` is the route-relevant field name when `field` is a path into it (e.g. an assumption facet). */
const block = (field: string, reason: string, base: string = field): BlockingField => ({
  field, reason, routeChanging: (ROUTE_CHANGING_FIELDS as readonly string[]).includes(base),
});

export function findBlockingFields(brief: BriefRecord): BlockingField[] {
  const surface = String(brief["surface"]);
  if (LANDING_SURFACES.includes(surface)) return [];
  const out: BlockingField[] = [];
  if ((APP_SURFACES as readonly string[]).includes(surface)) out.push(...appRouteFields(brief));
  const structural = new Set(out.map((b) => b.field));
  for (const a of list(brief["assumptions"])) {
    if (a["provenance"] !== "unknown") continue;
    const facet = String(a["facet"]);
    if (structural.has(facet)) continue; // one field, one blocker: the structural gap already names it
    out.push(block(`assumption:${facet}`, `open question: '${facet}' has provenance 'unknown'`, facet));
  }
  return out;
}

function appRouteFields(brief: BriefRecord): BlockingField[] {
  const out: BlockingField[] = [];
  const screens = list(brief["screens"]);
  if (screens.length === 0) {
    out.push(block("screens", "a screen-based route needs screens[]"));
  }
  for (const s of screens) {
    if (Array.isArray(s["states"]) && s["states"].length > 0) continue;
    out.push(block(`screens[${String(s["id"])}].states`, `screen '${String(s["id"])}' lists no states`, "states"));
  }
  if (list(brief["roles"]).length === 0) out.push(block("roles", "a screen-based route needs roles[] with a scope"));
  if (!isRecord(brief["status"])) out.push(block("status", "a screen-based route needs the status vocabulary"));
  if (brief["copyLanguage"] === undefined) out.push(block("copyLanguage", "UI copy language is not stated"));
  return out;
}

export function d4Receipt(brief: BriefRecord, blocking: BlockingField[]): D4Receipt {
  const routeChanging = blocking.filter((b) => b.routeChanging).map((b) => b.field);
  const B = blocking.length;
  const R = routeChanging.length > 0;
  const L = list(brief["assumptions"]).filter((a) => a["confidence"] === "low").length;
  const decision = B <= D4_MAX_B && !R && L <= D4_MAX_L ? "CONTINUE" : "BLOCKED";
  return { B, R, L, decision, thresholds: { maxB: D4_MAX_B, maxL: D4_MAX_L }, blocking: blocking.map((b) => b.field), routeChanging };
}
