// scripts/lib/schema.mjs
//
// Zero-dependency JSON-Schema-SUBSET validator (D12 / Article I / BUILD-CONTRACT).
// Supports exactly the keywords the frozen draft subset permits: type, properties,
// required, enum, pattern, minimum, maximum, minLength, items, minItems, maxItems,
// const, additionalProperties:false. No $ref, no oneOf/allOf, no format keywords —
// every schema under schemas/ restricts itself to this subset by design, so nothing
// else is needed here.

function actualType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value; // "string" | "boolean" | "object"
}

function typeMatches(value, t) {
  const actual = actualType(value);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Validate `value` against `schema`. Returns an array of {path, message}; empty
 * array means valid. Never throws on malformed input data (only on a malformed
 * schema, which is a builder bug, not a data problem).
 */
export function validate(value, schema, pathStr = "$") {
  const errors = [];

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push({ path: pathStr, message: `expected type ${types.join("|")}, got ${actualType(value)}` });
      return errors; // further checks are meaningless under a type mismatch
    }
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push({ path: pathStr, message: `expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}` });
  }

  if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(e, value))) {
    errors.push({ path: pathStr, message: `value ${JSON.stringify(value)} not in enum` });
  }

  const actual = actualType(value);

  if (actual === "string") {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path: pathStr, message: `does not match pattern ${schema.pattern}` });
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: pathStr, message: `length ${value.length} < minLength ${schema.minLength}` });
    }
  }

  if (actual === "number" || actual === "integer") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: pathStr, message: `${value} < minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path: pathStr, message: `${value} > maximum ${schema.maximum}` });
    }
  }

  if (actual === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: pathStr, message: `length ${value.length} < minItems ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path: pathStr, message: `length ${value.length} > maxItems ${schema.maxItems}` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => {
        errors.push(...validate(item, schema.items, `${pathStr}[${i}]`));
      });
    }
  }

  if (actual === "object") {
    const props = schema.properties || {};
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({ path: `${pathStr}.${key}`, message: "required property missing" });
        }
      }
    }
    for (const key of Object.keys(props)) {
      if (key in value) {
        errors.push(...validate(value[key], props[key], `${pathStr}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          errors.push({ path: `${pathStr}.${key}`, message: "additional property not permitted" });
        }
      }
    }
  }

  return errors;
}
