// The ONE file-name comparison: routing (broker) and the guard (plugin) must never disagree.
// Lives in shared/ (not cli/) because the plugin main thread needs it too, and the plugin
// bundle must never pull cli/ code — esbuild would follow the import even though
// plugin/tsconfig.json's `include` does not list cli/ (`include` is not an import allowlist).
export function fileMatches(actual: string | null | undefined, filter: string, exact: boolean): boolean {
  const a = (actual ?? '').trim().toLowerCase();
  const f = filter.trim().toLowerCase();
  return exact ? a === f : a.includes(f);
}
