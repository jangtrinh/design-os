/**
 * Confidentiality scrub for text that leaves a project (promotion candidates).
 * Pure: string in, string + counts out.
 */

export type ScrubKind = "email" | "url" | "figma-key" | "abs-path" | "ip" | "hostname" | "project" | "person";

export interface ScrubNames {
  /** Project / product names to replace with `<project>`. */
  projects?: readonly string[];
  /** People to replace with `<person>`. */
  people?: readonly string[];
}

export interface ScrubResult {
  text: string;
  counts: Partial<Record<ScrubKind, number>>;
}

const NON_URL_END = "[^\\s<>\"'`)\\]]*[^\\s<>\"'`)\\].,;:!?]";
const PATH_END = "[^\\s\"'`<>()\\[\\],;]*[^\\s\"'`<>()\\[\\],;.:!?]";
/** Top-level domains for bare hostnames. Deliberately short: `.sh`, `.test`, `.json`, `.md` are file names, not hosts. */
const TLDS = "com|net|org|io|dev|app|ai|co|vn|edu|gov|info|biz|cloud|tech|xyz|local|internal|localhost";

const RULES: readonly { kind: ScrubKind; re: RegExp; to: string }[] = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, to: "<email>" },
  { kind: "url", re: new RegExp(`\\b(?:https?|ftp|wss?|file)://${NON_URL_END}`, "g"), to: "<url>" },
  { kind: "figma-key", re: /figma:[A-Za-z0-9]{10,}/g, to: "figma:<figma-file-key>" },
  {
    kind: "abs-path",
    re: new RegExp(`(?<![\\w.:/-])(?:/(?:Users|home|private|var|tmp|opt|etc|mnt|Volumes|root|srv|usr|Library|Applications|workspaces?)/${PATH_END}|~/${PATH_END})|\\b[A-Za-z]:\\\\[^\\s"'\`<>]*[^\\s"'\`<>.,;:]`, "g"),
    to: "<abs-path>",
  },
  { kind: "ip", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, to: "<ip>" },
  // `(?!\.\w)`: `settings.local.json` and `x.io.json` are file names, not hosts.
  { kind: "hostname", re: new RegExp(`\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+(?:${TLDS})\\b(?![\\w-])(?!\\.\\w)(?::\\d+)?|\\blocalhost(?::\\d+)?\\b`, "gi"), to: "<hostname>" },
];

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `acme-portal` is also written "Acme Portal"; match both spellings. */
function nameVariants(names: readonly string[]): string[] {
  const all = new Set<string>();
  for (const n of names.map((x) => x.trim()).filter((x) => x.length >= 2)) {
    all.add(n);
    all.add(n.replace(/[-_]+/g, " "));
  }
  return [...all].sort((a, b) => b.length - a.length);
}

function nameRe(names: readonly string[]): RegExp | null {
  const variants = nameVariants(names);
  if (variants.length === 0) return null;
  return new RegExp(`(?<![A-Za-z0-9])(?:${variants.map(escapeRe).join("|")})(?![A-Za-z0-9])`, "gi");
}

export function scrubText(text: string, names: ScrubNames = {}): ScrubResult {
  const counts: Partial<Record<ScrubKind, number>> = {};
  let out = text;
  const apply = (kind: ScrubKind, re: RegExp, to: string): void => {
    out = out.replace(re, () => { counts[kind] = (counts[kind] ?? 0) + 1; return to; });
  };
  for (const rule of RULES) apply(rule.kind, rule.re, rule.to);
  const people = nameRe(names.people ?? []);
  if (people !== null) apply("person", people, "<person>");
  const projects = nameRe(names.projects ?? []);
  if (projects !== null) apply("project", projects, "<project>");
  return { text: out, counts };
}

/** Scrub every string inside a JSON-like value (keys are kept), merging replacement counts. */
export function scrubValue<T>(value: T, names: ScrubNames, into: Partial<Record<ScrubKind, number>>): T {
  if (typeof value === "string") {
    const r = scrubText(value, names);
    for (const [k, n] of Object.entries(r.counts)) into[k as ScrubKind] = (into[k as ScrubKind] ?? 0) + (n ?? 0);
    return r.text as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, names, into)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubValue(v, names, into);
    return out as T;
  }
  return value;
}
