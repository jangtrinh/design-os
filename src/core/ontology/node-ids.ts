/** Node ids: `<kind>:<key>`, the key being something that survives a reordering of its source (never a position). */
import { createHash } from "node:crypto";
import type { NodeKind } from "./ontology-types.js";

export const nodeId = (kind: NodeKind, key: string): string => `${kind}:${key}`;

/** A soul rule has no id of its own: its key is its section and the first 12 hex characters of the SHA-256 of its text, whitespace collapsed. */
export function soulRuleKey(section: "never" | "always", text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return `${section}:${createHash("sha256").update(collapsed).digest("hex").slice(0, 12)}`;
}
