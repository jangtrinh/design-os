/**
 * What `ui agents init` tells the person: which targets it wrote and which it replaced, and for a replaced one whether its
 * text outside the area block differed from a fresh render (the comparison `ui agents check` makes). The note states a fact the kernel observed, never a cause.
 */
import { existsSync, readFileSync } from "node:fs";
import { findSentinelBlock } from "../core/adapter-writer.js";
import type { AdapterArtifact } from "../adapters/index.js";
import { stripBlocks } from "../core/agents-areas-block.js";
import type { AgentRole } from "../core/agents-gen.js";
import type { Runtime } from "../core/init-stub.js";

export const DIFFERED_NOTE = "its text outside the area block differed from what this version generates; that text is not kept";
export interface Prior { replaced: boolean; differedOutsideBlock: boolean }
export interface InitRow { runtime: Runtime; role: AgentRole; name: string; path: string; written: true; replaced: boolean; differedOutsideBlock: boolean }

/** Before anything is written: did the target exist, and did its text outside the block differ from the fresh one. */
export function priorOf(a: AdapterArtifact): Prior {
  if (!existsSync(a.absPath)) return { replaced: false, differedOutsideBlock: false };
  const text = readFileSync(a.absPath, "utf8");
  if (a.mode === "write") return { replaced: true, differedOutsideBlock: stripBlocks(text) !== stripBlocks(a.content) };
  const range = findSentinelBlock(text, a.sentinelBegin, a.sentinelEnd);
  if (range === null) return { replaced: false, differedOutsideBlock: false };
  return { replaced: true, differedOutsideBlock: stripBlocks(text.slice(range.start, range.end)) !== stripBlocks(a.content) };
}

export function initLines(rows: readonly InitRow[], codexPath: string): string[] {
  const note = (r: Prior): string => (r.differedOutsideBlock ? `; ${DIFFERED_NOTE}` : "");
  const verb = (r: Prior): string => (r.replaced ? "replaced" : "written");
  const lines = rows.filter((r) => r.runtime === "claude").map((r) => `agent ${verb(r)}: ${r.path} (${r.role})${note(r)}`);
  lines.push(...rows.filter((r) => r.runtime === "antigravity").map((r) => `agent ${verb(r)}: ${r.path} (${r.role}, Antigravity)${note(r)}`));
  const section = rows.find((r) => r.runtime === "codex");
  if (section !== undefined) lines.push(`agents section ${verb(section)}: ${codexPath} (Codex: ${rows.filter((r) => r.runtime === "codex").map((r) => r.role).join(", ")})${note(section)}`);
  return lines;
}
