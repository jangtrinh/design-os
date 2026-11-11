/**
 * Codex reads project instructions up to a byte limit and does not read the rest. This module measures the AGENTS.md that
 * an `ui agents init` would leave behind, with the same insert-or-replace the shared writer performs, so the kernel can
 * refuse before a file is written that the runtime would read only in part, and say exactly what it measured.
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

/** The bytes of a file, split so that `outside + section + separator` is `total` exactly. */
export interface DocSizes { total: number; section: number; outside: number; separator: number }

export function docSizes(host: string | null, section: string): DocSizes {
  const total = Buffer.byteLength(resultingAgentsDoc(host, section));
  const inside = Buffer.byteLength(section);
  const text = host ?? "";
  if (findSentinelBlock(text, CODEX_AGENTS_BEGIN, CODEX_AGENTS_END) !== null) return { total, section: inside, outside: total - inside, separator: 0 };
  const outside = Buffer.byteLength(text.trimEnd());
  return { total, section: inside, outside, separator: total - inside - outside };
}

/**
 * What was measured, in one sentence a person can act on: the size, the default limit, how many bytes at the end of
 * the file are not read, and where the bytes lie. `would` is true for a file a command is about to write.
 */
export function limitFacts(sizes: DocSizes, would: boolean): string {
  const cut = sizes.total - CODEX_PROJECT_DOC_MAX_BYTES;
  const separator = sizes.separator > 0 ? `, and the ${sizes.separator} separator bytes the writer adds around a new section` : "";
  return `AGENTS.md ${would ? "would be" : "is"} ${sizes.total} bytes, and Codex reads the first ${CODEX_PROJECT_DOC_MAX_BYTES} bytes by default, so the last ${cut} bytes of the file ${would ? "would not be read" : "are not read"}: the text outside the agents section is ${sizes.outside} bytes, the agents section is ${sizes.section} bytes${separator}`;
}

/** The manual action that makes a refused or reported file fit: how many bytes the project's own text must shrink by. */
export const shrinkAction = (sizes: DocSizes): string => `shorten the project's own text in AGENTS.md by at least ${sizes.total - CODEX_PROJECT_DOC_MAX_BYTES} bytes`;
