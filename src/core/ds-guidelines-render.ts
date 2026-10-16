/**
 * DS Guidelines Pack — markdown rendering + generated-block seal (pure, no fs).
 *
 * Decisions (locked in the plan):
 *   T4  names are written as explicit spans — `token:<path>`, `component:<name>`,
 *       `term:<term>` — and the linter checks only those spans.
 *   T5  a generated block is wrapped in
 *         <!-- ds-guidelines:generated id=<id> sha=<sha256-12> -->
 *         …body…
 *         <!-- /ds-guidelines:generated -->
 *       where sha is the first 12 hex chars of sha256(body). Editing the body breaks the sha.
 */
import { createHash } from "node:crypto";

import type { GuidelineFile } from "./ds-guidelines-model.js";

export const BLOCK_CLOSE = "<!-- /ds-guidelines:generated -->";
export const BLOCK_OPEN_PREFIX = "<!-- ds-guidelines:generated";
const BLOCK_OPEN_RE = /^<!-- ds-guidelines:generated id=([A-Za-z0-9._-]+) sha=([0-9a-f]{12}) -->$/;

export const tokenSpan = (path: string): string => `\`token:${path}\``;
export const componentSpan = (name: string): string => `\`component:${name}\``;

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** T5 seal: first 12 hex chars of sha256 over the block body. */
export function blockSha(body: string): string {
  return sha256Hex(body).slice(0, 12);
}

/** Render one file: parts separated by a blank line, generated blocks sealed, trailing newline. */
export function renderFile(file: GuidelineFile): string {
  const chunks = file.parts.map((part) => {
    if (part.kind === "text") return part.lines.join("\n");
    const body = part.lines.join("\n");
    return [`${BLOCK_OPEN_PREFIX} id=${part.id} sha=${blockSha(body)} -->`, body, BLOCK_CLOSE].join("\n");
  });
  return chunks.join("\n\n") + "\n";
}

export interface ParsedBlock {
  id: string;
  /** The sha the opening marker claims. */
  sha: string;
  /** The sha the body actually hashes to now. */
  actualSha: string;
  /** 1-based line of the opening marker. */
  line: number;
  /** 1-based line of the closing marker. */
  endLine: number;
}

export interface BlockProblem {
  line: number;
  message: string;
}

/** Find every generated block in a rendered file; structural damage is returned as problems. */
export function parseGeneratedBlocks(text: string): { blocks: ParsedBlock[]; problems: BlockProblem[] } {
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  const problems: BlockProblem[] = [];
  const seen = new Set<string>();
  let open: { id: string; sha: string; line: number; body: string[] } | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = idx + 1;
    const l = (lines[idx] ?? "").replace(/\r$/, "");
    if (l.startsWith(BLOCK_OPEN_PREFIX)) {
      if (open !== null) {
        problems.push({ line: open.line, message: `block '${open.id}' is not closed before the next block opens` });
        open = null;
      }
      const m = BLOCK_OPEN_RE.exec(l);
      if (m === null) { problems.push({ line, message: "malformed generated-block marker" }); continue; }
      open = { id: m[1] ?? "", sha: m[2] ?? "", line, body: [] };
      if (seen.has(open.id)) problems.push({ line, message: `block id '${open.id}' appears twice in this file` });
      seen.add(open.id);
      continue;
    }
    if (l === BLOCK_CLOSE) {
      if (open === null) { problems.push({ line, message: "closing marker without an opening marker" }); continue; }
      blocks.push({ id: open.id, sha: open.sha, actualSha: blockSha(open.body.join("\n")), line: open.line, endLine: line });
      open = null;
      continue;
    }
    if (open !== null) open.body.push(l);
  }
  if (open !== null) problems.push({ line: open.line, message: `block '${open.id}' is never closed` });
  return { blocks, problems };
}

/** Lines outside every generated block (1-based) — the text a host or person wrote. */
export function hostWrittenLines(text: string): { line: number; text: string }[] {
  const { blocks } = parseGeneratedBlocks(text);
  const inBlock = (line: number): boolean => blocks.some((b) => line >= b.line && line <= b.endLine);
  const out: { line: number; text: string }[] = [];
  text.split("\n").forEach((t, idx) => {
    if (!inBlock(idx + 1)) out.push({ line: idx + 1, text: t.replace(/\r$/, "") });
  });
  return out;
}
