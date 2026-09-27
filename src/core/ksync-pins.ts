/**
 * ksync pins — the record of which Figma frame each built route was built against.
 * Pure: parse / validate / upsert / serialize. Git and the clock are injected by the
 * command, so the same inputs always produce byte-identical output.
 */
export const PINS_SCHEMA = "ksync-pins/1";

export interface KsyncPin {
  route: string;
  file: string;
  node: string;
  pinnedAt: string;
  builtFrom: string;
  specHash?: string;
}

export interface KsyncPinsDoc {
  schema: typeof PINS_SCHEMA;
  pins: KsyncPin[];
}

const REQUIRED = ["route", "file", "node", "pinnedAt", "builtFrom"] as const;
const ALLOWED = new Set<string>([...REQUIRED, "specHash"]);

export class PinsError extends Error {}

export const emptyPins = (): KsyncPinsDoc => ({ schema: PINS_SCHEMA, pins: [] });

/** A pin is identified by the frame it points at, not by the route: a route with several states owns several pins. */
export const pinKey = (p: Pick<KsyncPin, "file" | "node">): string => `${p.file}\u0000${p.node}`;

export function sortPins(pins: readonly KsyncPin[]): KsyncPin[] {
  return [...pins].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
}

/** Validate an already-parsed pins document; throws PinsError naming the first offending pin. */
export function parsePins(doc: unknown): KsyncPinsDoc {
  if (typeof doc !== "object" || doc === null) throw new PinsError("pins file is not a JSON object");
  const d = doc as Record<string, unknown>;
  if (d["schema"] !== PINS_SCHEMA) throw new PinsError(`pins file schema must be '${PINS_SCHEMA}'`);
  if (!Array.isArray(d["pins"])) throw new PinsError("pins file needs a 'pins' array");
  const seen = new Set<string>();
  const pins = d["pins"].map((raw: unknown, i: number): KsyncPin => {
    if (typeof raw !== "object" || raw === null) throw new PinsError(`pins[${i}] is not an object`);
    const p = raw as Record<string, unknown>;
    for (const k of REQUIRED) if (typeof p[k] !== "string" || p[k] === "") throw new PinsError(`pins[${i}].${k} must be a non-empty string`);
    for (const k of Object.keys(p)) if (!ALLOWED.has(k)) throw new PinsError(`pins[${i}] has unknown field '${k}'`);
    if (p["specHash"] !== undefined && (typeof p["specHash"] !== "string" || p["specHash"] === "")) throw new PinsError(`pins[${i}].specHash must be a non-empty string`);
    if (Number.isNaN(Date.parse(p["pinnedAt"] as string))) throw new PinsError(`pins[${i}].pinnedAt is not an ISO instant`);
    const pin = p as unknown as KsyncPin;
    if (seen.has(pinKey(pin))) throw new PinsError(`pins[${i}] duplicates node ${pin.node} of file ${pin.file}`);
    seen.add(pinKey(pin));
    return pin;
  });
  return { schema: PINS_SCHEMA, pins: sortPins(pins) };
}

/** Insert or replace the pin for (file, node); everything else is untouched. Returns whether it inserted. */
export function upsertPin(doc: KsyncPinsDoc, pin: KsyncPin): { doc: KsyncPinsDoc; created: boolean } {
  const key = pinKey(pin);
  const created = !doc.pins.some((p) => pinKey(p) === key);
  const rest = doc.pins.filter((p) => pinKey(p) !== key);
  return { doc: { schema: PINS_SCHEMA, pins: sortPins([...rest, pin]) }, created };
}

/** Key order is fixed so serialization is deterministic whatever order the fields were built in. */
export function serializePins(doc: KsyncPinsDoc): string {
  const pins = doc.pins.map((p) => ({
    route: p.route, file: p.file, node: p.node, pinnedAt: p.pinnedAt, builtFrom: p.builtFrom,
    ...(p.specHash !== undefined ? { specHash: p.specHash } : {}),
  }));
  return `${JSON.stringify({ schema: doc.schema, pins }, null, 2)}\n`;
}
