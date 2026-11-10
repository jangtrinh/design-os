/**
 * Reads a parsed scan file (the shape of schemas/figma-ds-scan.schema.json) into the typed form the ingest uses.
 * The kernel judges what the hosts sense: a field a scan does not carry stays absent here ("not sensed"), and is never
 * filled by a guess. The scan's `page` ({ id, name }, or a bare name in a hand-written scan) is mapped to the
 * kernel's `DsComponent.section`, which switches on the two section heuristics.
 */
import type { DsComponent } from "./figma-ds-registry.js";
import type { DsStyle } from "./figma-ds-designdoc.js";
import type { DsVariable } from "./figma-ds-tokens.js";

/** Typed failure for a malformed ds.json (shape, not JSON syntax). */
export class DsIngestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DsIngestError";
    this.code = code;
  }
}

export interface InstanceRef { component: string; count: number }

export interface ScanComponent extends DsComponent {
  /** The page the node sits on: its id (the name when the scan carries nothing else) and its name. */
  pageId?: string;
  pageName?: string;
  unresolvedInstances?: number;
}

export interface DsFrame {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  section?: string;
  instances: InstanceRef[];
  unresolvedInstances?: number;
}

export interface DsFile {
  components: ScanComponent[];
  tokens: DsVariable[];
  styles: DsStyle[];
  /** Present only when the scan carries `frames`; absent means "not sensed", an empty list means "none". */
  frames?: DsFrame[];
  sensing?: { status: string; reason?: string };
  /** `absent` when no component carries a `page`: the page question is skipped and the envelope says so. */
  pageSignal: "present" | "absent";
}

function requireArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) {
    throw new DsIngestError("BAD_DS", `ds.json is missing the '${key}' array (is this a scan-design-system output?)`);
  }
  return v;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** `{ id, name }` or a bare name; anything else (or nothing) is "no page". */
function readPage(raw: unknown): { id: string; name: string } | undefined {
  if (typeof raw === "string" && raw.length > 0) return { id: raw, name: raw };
  if (isObject(raw) && typeof raw["id"] === "string" && typeof raw["name"] === "string") return { id: raw["id"], name: raw["name"] };
  return undefined;
}

function readInstances(raw: unknown): InstanceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is Record<string, unknown> => isObject(i) && typeof i["component"] === "string")
    .map((i) => ({ component: i["component"] as string, count: typeof i["count"] === "number" ? i["count"] : 1 }));
}

function readFrame(raw: unknown, index: number): DsFrame {
  if (!isObject(raw) || typeof raw["id"] !== "string" || typeof raw["name"] !== "string") {
    throw new DsIngestError("BAD_DS", `ds.json frames[${index}] needs a string id and name`);
  }
  const page = readPage(raw["page"]);
  if (page === undefined) throw new DsIngestError("BAD_DS", `ds.json frames[${index}] needs a page { id, name }`);
  return {
    id: raw["id"], name: raw["name"], pageId: page.id, pageName: page.name,
    ...(typeof raw["section"] === "string" ? { section: raw["section"] } : {}),
    instances: readInstances(raw["instances"]),
    ...(typeof raw["unresolvedInstances"] === "number" ? { unresolvedInstances: raw["unresolvedInstances"] } : {}),
  };
}

/** Validate the parsed ds.json into a typed DsFile, or throw DsIngestError("BAD_DS"). */
export function parseDsFile(json: unknown): DsFile {
  if (!isObject(json)) throw new DsIngestError("BAD_DS", "ds.json must be a JSON object with components/tokens/styles arrays");
  const rawComponents = requireArray(json, "components") as DsComponent[] & { page?: unknown }[];
  const tokens = requireArray(json, "tokens") as DsVariable[];
  const styles = requireArray(json, "styles") as DsStyle[];
  const components: ScanComponent[] = rawComponents.map((c) => {
    const { page: rawPage, ...rest } = c as unknown as Record<string, unknown> & { page?: unknown };
    const page = readPage(rawPage);
    const base = rest as unknown as ScanComponent;
    return { ...base, ...(page === undefined ? {} : { pageId: page.id, pageName: page.name, section: page.name }) };
  });
  const frames = json["frames"] === undefined ? undefined : requireArray(json, "frames").map(readFrame);
  const sensing = isObject(json["sensing"]) && typeof json["sensing"]["status"] === "string"
    ? { status: json["sensing"]["status"], ...(typeof json["sensing"]["reason"] === "string" ? { reason: json["sensing"]["reason"] } : {}) }
    : undefined;
  return {
    components, tokens, styles,
    ...(frames === undefined ? {} : { frames }),
    ...(sensing === undefined ? {} : { sensing }),
    pageSignal: components.some((c) => c.pageId !== undefined) ? "present" : "absent",
  };
}
