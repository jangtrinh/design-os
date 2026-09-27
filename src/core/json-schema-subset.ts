/**
 * Schema-driven validator for the JSON Schema draft-07 subset our shipped schemas use.
 * Pure and fs-free; the kernel takes no ajv dependency. A keyword outside the subset
 * throws instead of being skipped, so a schema edit can never silently stop being enforced.
 */

export interface SchemaFinding {
  /** Path of the offending value: `screens[0].states`, or the key itself for a missing/unknown property. */
  field: string;
  message: string;
}

type Schema = Record<string, unknown>;

const ANNOTATIONS = new Set(["$schema", "$id", "title", "description"]);
const ASSERTIONS = new Set([
  "type", "const", "enum", "required", "properties", "additionalProperties", "items",
  "minItems", "minLength", "pattern", "allOf", "if", "then",
]);

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const join = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);
const show = (v: unknown): string => JSON.stringify(v);

function typeOf(v: unknown): string {
  if (Array.isArray(v)) return "array";
  return v === null ? "null" : typeof v;
}

export function validateAgainstSchema(doc: unknown, schema: Schema): SchemaFinding[] {
  const out: SchemaFinding[] = [];
  walk(doc, schema, "", out);
  return out;
}

function walk(value: unknown, schema: Schema, path: string, out: SchemaFinding[]): void {
  const at = path === "" ? "(root)" : path;
  const bad = (message: string, field = at): void => { out.push({ field, message }); };
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.has(key) && !ASSERTIONS.has(key)) throw new Error(`json-schema-subset: unsupported keyword '${key}'`);
  }
  if (schema["const"] !== undefined && value !== schema["const"]) bad(`must be ${show(schema["const"])}`);
  const allowed = schema["enum"];
  if (Array.isArray(allowed) && !allowed.includes(value)) bad(`must be one of ${allowed.map((a) => String(a)).join("|")}`);
  const type = schema["type"];
  if (typeof type === "string" && typeOf(value) !== type) { bad(`must be ${type === "object" ? "an object" : type === "array" ? "an array" : `a ${type}`}`); return; }

  if (typeof value === "string") {
    if (typeof schema["minLength"] === "number" && value.length < schema["minLength"]) bad("must be a non-empty string");
    if (typeof schema["pattern"] === "string" && !new RegExp(schema["pattern"]).test(value)) bad(`must match ${schema["pattern"]}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema["minItems"] === "number" && value.length < schema["minItems"]) bad(`must have at least ${schema["minItems"]} item(s)`);
    const items = schema["items"];
    if (isRecord(items)) value.forEach((item, i) => walk(item, items, `${path}[${i}]`, out));
  }
  if (isRecord(value)) walkObject(value, schema, path, out);
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) for (const sub of allOf) if (isRecord(sub)) walk(value, sub, path, out);
  const cond = schema["if"];
  if (isRecord(cond) && isRecord(schema["then"]) && validateAgainstSchema(value, cond).length === 0) walk(value, schema["then"], path, out);
}

function walkObject(value: Record<string, unknown>, schema: Schema, path: string, out: SchemaFinding[]): void {
  const props = isRecord(schema["properties"]) ? schema["properties"] : {};
  const required = Array.isArray(schema["required"]) ? schema["required"] : [];
  for (const name of required) {
    if (typeof name === "string" && value[name] === undefined) out.push({ field: join(path, name), message: "is required" });
  }
  if (schema["additionalProperties"] === false) {
    for (const key of Object.keys(value)) {
      if (!(key in props)) out.push({ field: join(path, key), message: "is not a known field" });
    }
  }
  for (const [key, sub] of Object.entries(props)) {
    if (value[key] !== undefined && isRecord(sub)) walk(value[key], sub, join(path, key), out);
  }
}
