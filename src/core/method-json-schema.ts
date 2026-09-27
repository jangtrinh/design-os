/** Small deterministic Draft-07 subset used by the method and brief contracts. */
export type Schema = Record<string, unknown>;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const schemaOf = (v: unknown): Schema => record(v) ? v : {};

export function validateMethodSchema(value: unknown, schema: Schema): string[] {
  return visit(value, schema, schema, "$", 0);
}

function visit(value: unknown, rule: Schema, root: Schema, path: string, depth: number): string[] {
  if (depth > 64) return [`${path}: schema nesting exceeds 64 levels`];
  const ref = rule["$ref"];
  if (typeof ref === "string") {
    const target = ref.startsWith("#/")
      ? ref.slice(2).split("/").reduce<unknown>((at, key) => record(at) ? at[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined, root)
      : undefined;
    return record(target) ? visit(value, target, root, path, depth + 1) : [`${path}: unresolved schema reference ${ref}`];
  }
  const issues: string[] = [];
  const type = rule["type"];
  if (typeof type === "string" && !matchesType(value, type)) {
    return [`${path}: expected ${type}`];
  }
  if ("const" in rule && value !== rule["const"]) issues.push(`${path}: expected ${JSON.stringify(rule["const"])}`);
  if (Array.isArray(rule["enum"]) && !rule["enum"].includes(value)) issues.push(`${path}: value is outside the allowed set`);
  if (typeof value === "string") {
    if (typeof rule["minLength"] === "number" && value.length < rule["minLength"]) issues.push(`${path}: string is too short`);
    if (typeof rule["pattern"] === "string" && !new RegExp(rule["pattern"]).test(value)) issues.push(`${path}: string does not match required pattern`);
  }
  if (Array.isArray(value)) {
    if (typeof rule["minItems"] === "number" && value.length < rule["minItems"]) issues.push(`${path}: array is too short`);
    if (record(rule["items"])) value.forEach((item, i) => issues.push(...visit(item, rule["items"] as Schema, root, `${path}[${i}]`, depth + 1)));
  }
  if (record(value)) {
    const props = schemaOf(rule["properties"]);
    if (Array.isArray(rule["required"])) for (const key of rule["required"]) {
      if (typeof key === "string" && !Object.hasOwn(value, key)) issues.push(`${path}.${key}: required`);
    }
    if (rule["additionalProperties"] === false) for (const key of Object.keys(value)) {
      if (!Object.hasOwn(props, key)) issues.push(`${path}.${key}: unknown property`);
    }
    for (const [key, child] of Object.entries(props)) {
      if (Object.hasOwn(value, key) && record(child)) issues.push(...visit(value[key], child, root, `${path}.${key}`, depth + 1));
    }
  }
  if (Array.isArray(rule["allOf"])) for (const child of rule["allOf"]) {
    if (record(child)) issues.push(...visit(value, child, root, path, depth + 1));
  }
  if (record(rule["if"]) && visit(value, rule["if"], root, path, depth + 1).length === 0 && record(rule["then"])) {
    issues.push(...visit(value, rule["then"], root, path, depth + 1));
  }
  for (const keyword of ["oneOf", "anyOf"] as const) {
    const choices = rule[keyword];
    if (Array.isArray(choices)) {
      const passing = choices.filter((child) => record(child) && visit(value, child, root, path, depth + 1).length === 0).length;
      if (keyword === "oneOf" && passing !== 1 || keyword === "anyOf" && passing === 0) issues.push(`${path}: ${keyword} failed`);
    }
  }
  return issues;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "object": return record(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return false;
  }
}
