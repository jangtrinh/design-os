/**
 * Codex reads project instructions up to a byte limit and cuts the rest. This module measures the AGENTS.md that an
 * `ui agents init` would leave behind, with the same insert-or-replace the shared writer performs, so the kernel can
 * refuse before a section is written that the runtime would read only in part.
 */
import { findSentinelBlock } from "./adapter-writer.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END } from "./agents-targets.js";

/**
 * `project_doc_max_bytes`, Codex's default limit on the combined project instructions it reads (32 KiB). It is the
 * runtime's default, not a kernel setting: a project that raised it in Codex's own configuration is still held to this.
 */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32768;

/** The AGENTS.md text after the section is inserted or replaced, exactly as the shared writer leaves it. */
export function resultingAgentsDoc(host: string | null, section: string): string {
  const text = host ?? "";
  const range = findSentinelBlock(text, CODEX_AGENTS_BEGIN, CODEX_AGENTS_END);
  if (range !== null) return text.slice(0, range.start) + section + text.slice(range.end);
  return text.length > 0 ? `${text.trimEnd()}\n\n${section}\n` : `${section}\n`;
}

export interface DocSizes { total: number; section: number; outside: number }

/** Bytes of the resulting file, of the section, and of everything the project keeps outside the section. */
export function docSizes(host: string | null, section: string): DocSizes {
  const total = Buffer.byteLength(resultingAgentsDoc(host, section));
  const inside = Buffer.byteLength(section);
  return { total, section: inside, outside: total - inside };
}
