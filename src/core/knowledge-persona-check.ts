/**
 * persona-drift — the persona library has THREE representations that must agree
 * on which personas exist and what family each belongs to:
 *
 *   persona-index.md   §1 lookup table   (`| `slug` | family | … |`)
 *   personas/<f>.md    per-family blocks  (`- **Slug:** `slug`` + `- **Family:** family`)
 *   personas.json      compiled array     ({ slug, family, … })
 *
 * Any slug present in one source but absent from another, or a family that
 * disagrees across sources, is drift — an error. Pure transform; mirrors the
 * identity fields of scripts/derive-personas-json.mjs (slug + family only —
 * the numeric DNA lives solely in the JSON and is out of scope here).
 */
import type { KnowledgeFinding } from "./knowledge-lint.js";

type SlugFamily = Map<string, string>;

/** Slug→family from the persona-index.md §1 table rows (`| `slug` | family | …`). */
function parseIndex(indexMd: string): SlugFamily {
  const out: SlugFamily = new Map();
  for (const line of indexMd.split("\n")) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|\s*([a-z0-9-]+)\s*\|/);
    if (m !== null && m[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2]);
  }
  return out;
}

/** Slug→family from every persona block across the family markdown files. */
function parseMarkdown(personaFiles: Record<string, string>): SlugFamily {
  const out: SlugFamily = new Map();
  for (const content of Object.values(personaFiles)) {
    for (const block of content.split(/^## /m).slice(1)) {
      const slug = block.match(/^-\s+\*\*Slug:\*\*\s+`([^`]+)`/m);
      const family = block.match(/^-\s+\*\*Family:\*\*\s+(\S+)/m);
      if (slug !== null && slug[1] !== undefined) {
        out.set(slug[1], family !== null && family[1] !== undefined ? family[1].trim() : "");
      }
    }
  }
  return out;
}

/** Slug→family from personas.json, or null when it is missing / invalid JSON. */
function parseJson(raw: string | null): SlugFamily | null {
  if (raw === null) return null;
  let arr: unknown;
  try { arr = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const out: SlugFamily = new Map();
  for (const p of arr) {
    if (typeof p === "object" && p !== null) {
      const { slug, family } = p as { slug?: unknown; family?: unknown };
      if (typeof slug === "string") out.set(slug, typeof family === "string" ? family : "");
    }
  }
  return out;
}

function isEscapedBacktick(content: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function stripInlineCodeBlock(content: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < content.length) {
    if (content[cursor] !== "`" || isEscapedBacktick(content, cursor)) {
      output += content[cursor];
      cursor += 1;
      continue;
    }

    const openerStart = cursor;
    while (cursor < content.length && content[cursor] === "`") cursor += 1;
    const width = cursor - openerStart;
    let search = cursor;
    let closerEnd: number | undefined;
    while (search < content.length) {
      if (content[search] !== "`" || isEscapedBacktick(content, search)) { search += 1; continue; }
      const runStart = search;
      while (search < content.length && content[search] === "`") search += 1;
      if (search - runStart === width) { closerEnd = search; break; }
    }

    if (closerEnd === undefined) {
      output += "`".repeat(width);
    } else {
      cursor = closerEnd;
    }
  }
  return output;
}

function stripInlineCode(content: string): string {
  // Inline spans may cross soft line breaks inside a paragraph, but never a
  // blank-line Markdown block boundary.
  return content
    .split(/(\n[ \t]*\n)/)
    .map((block, index) => index % 2 === 0 ? stripInlineCodeBlock(block) : block)
    .join("");
}

function stripMarkdownCode(content: string): string {
  const out: string[] = [];
  const normalized = content.replace(/\r\n?/g, "\n");
  const withoutComments = normalized.replace(/<!--[\s\S]*?-->/g, "");
  let fence: { marker: "`" | "~"; width: number } | undefined;
  for (const line of withoutComments.split("\n")) {
    if (fence === undefined && /^(?: {4}|\t)/.test(line)) { out.push(""); continue; }

    if (fence !== undefined) {
      const closer = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)?.[1];
      if (closer !== undefined && closer[0] === fence.marker && closer.length >= fence.width) fence = undefined;
      out.push("");
      continue;
    }

    const opener = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opener?.[1] !== undefined) {
      const marker = opener[1];
      const info = opener[2] ?? "";
      // CommonMark backtick-fence info strings cannot themselves contain a
      // backtick; such a line is prose, not a fence opener.
      if (marker[0] === "`" && info.includes("`")) { out.push(line); continue; }
      fence = { marker: marker[0] as "`" | "~", width: marker.length };
      out.push("");
      continue;
    }
    out.push(line);
  }
  return stripInlineCode(out.join("\n"));
}

export function personaChecks(
  indexMd: string | undefined,
  personaFiles: Record<string, string>,
  personasJson: string | null,
): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  const err = (message: string): void => { findings.push({ checkId: "persona-drift", severity: "error", message }); };

  if (indexMd === undefined) { err("persona-index.md is missing — cannot cross-check the persona library"); return findings; }
  const json = parseJson(personasJson);
  if (json === null) { err("personas/personas.json is missing or not valid JSON — cannot cross-check the persona library"); return findings; }

  const index = parseIndex(indexMd);
  const md = parseMarkdown(personaFiles);

  const claimedCounts = new Set<number>();
  const scannableIndex = stripMarkdownCode(indexMd);
  const number = String.raw`\*{0,2}(\d+)\*{0,2}`;
  const claimEnd = String.raw`\*{0,2}(?=\s*(?:grouped\s+into\s+\d+\s+families\b|\/|[.!:;—]|$))`;
  const countClaimPatterns = [
    new RegExp(String.raw`\bpersona\s+library\s+is\b[^\n\d]{0,120}?[—:]\s+${number}\s+personas?${claimEnd}`, "gi"),
    new RegExp(String.raw`\bacross\s+all\s+${number}\s+personas?${claimEnd}`, "gi"),
    new RegExp(String.raw`^\s*(?:#{1,6}\s*)?(?:\*{0,2})?all\s+${number}\s+personas?${claimEnd}`, "gim"),
    new RegExp(String.raw`^\s*(?:\*{0,2})?total(?:\s+of)?\s+${number}\s+personas?${claimEnd}`, "gim"),
    new RegExp(String.raw`\bfull\s+set\s+of\s+${number}(?:\s+personas?)?${claimEnd}`, "gi"),
    new RegExp(String.raw`\b(?:the\s+)?(?:persona\s+)?library\s+(?:has|contains|includes|comprises|totals)\s+(?:a\s+total\s+of\s+)?${number}\s+personas?${claimEnd}`, "gi"),
  ];
  for (const pattern of countClaimPatterns) {
    for (const match of scannableIndex.matchAll(pattern)) {
      const count = Number(match[1]);
      if (Number.isSafeInteger(count)) claimedCounts.add(count);
    }
  }
  for (const count of [...claimedCounts].sort((a, b) => a - b)) {
    if (count !== index.size) {
      err(`persona-index.md claims ${count} personas but its lookup table has ${index.size}`);
    }
  }

  const sources: { name: string; map: SlugFamily }[] = [
    { name: "persona-index.md", map: index },
    { name: "personas/*.md", map: md },
    { name: "personas.json", map: json },
  ];

  const allSlugs = new Set<string>([...index.keys(), ...md.keys(), ...json.keys()]);
  for (const slug of [...allSlugs].sort()) {
    const missing = sources.filter((s) => !s.map.has(slug)).map((s) => s.name);
    if (missing.length > 0) {
      const present = sources.filter((s) => s.map.has(slug)).map((s) => s.name);
      err(`persona '${slug}' is in ${present.join(", ")} but missing from ${missing.join(", ")}`);
      continue;
    }
    const families = new Set(sources.map((s) => s.map.get(slug)));
    if (families.size > 1) {
      const detail = sources.map((s) => `${s.name}='${s.map.get(slug)}'`).join(", ");
      err(`persona '${slug}' has a disagreeing family across sources: ${detail}`);
    }
  }
  return findings;
}
