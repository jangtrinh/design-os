/**
 * Is a Reason cell a real reason? A cell that is empty, a dash, a placeholder word, or just the
 * slot's own name says nothing, and a plan full of them is the same silence as no reasons.
 * Edge punctuation and symbols (backticks included) are stripped first, so `` `—` `` and "N/A." do not slip through.
 */

/** Fixed placeholder list (after lowercasing and stripping edge punctuation). */
const PLACEHOLDERS = new Set(["n/a", "na", "none", "tbd", "todo", "x"]);

/** Lowercase and trim whitespace, punctuation and symbols (backticks, dashes, dots) from both ends. */
function core(text: string): string {
  return text.trim().toLowerCase().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");
}

export function isPlaceholderReason(reason: string, slotName = ""): boolean {
  const c = core(reason);
  if (c === "" || PLACEHOLDERS.has(c)) return true;
  const slot = core(slotName);
  return slot !== "" && c === slot;
}
