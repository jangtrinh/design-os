// scripts/lib/findings.mjs
//
// One helper so every check produces the same Article-II envelope shape.
export function finding(checkId, severity, message, path) {
  const f = { checkId, severity, message };
  if (path !== undefined) f.path = path;
  return f;
}
