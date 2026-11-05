/**
 * Host files design:os writes into a project itself — `ui init` adapter trees and
 * `ui agents init` agents. They configure the agent host, never the design system,
 * and the CLI re-renders them at will, so an adopted kit's integrity walk lets an
 * UNDECLARED one coexist instead of calling it tampering. A host file the kit
 * declared in `kit.json` artifacts stays hashed like any other content.
 *
 * Paths are design:os-owned namespaces, not a list of today's verbs: a project
 * initialised by an older or newer `ui` must verify too. Agents and AGENTS.md
 * share their folder with hand-written files, so those count only when they carry
 * the generator's own mark (the agent stamp, the Codex sentinel block).
 */
import { parseAgentStamp } from "./agents-gen.js";
import { CODEX_SENTINEL_BEGIN } from "../adapters/wrapper-shapes-codex.js";

const OWNED_HOST_PATHS: readonly RegExp[] = [
  /^(\.claude|\.agent)\/ease-design\.json$/,
  /^AGENTS\.ease-design\.json$/,
  /^\.claude\/commands\/ui\/[a-z0-9-]+\.md$/,
  /^\.agent\/workflows\/ui-[a-z0-9-]+\.md$/,
  /^(\.claude|\.agent)\/skills\/design-os-[a-z0-9-]+\/SKILL\.md$/,
  /^(\.claude|\.agent)\/rules\/design-os-routing\.md$/,
  /^((\.claude|\.agent)\/)?design-os-model\.sh$/,
];

/** True when `path` (kit-root-relative POSIX) is a host file design:os generated. `read` is only called for marked kinds. */
export function isGeneratedHostFile(path: string, read: () => Buffer): boolean {
  if (OWNED_HOST_PATHS.some((pattern) => pattern.test(path))) return true;
  if (/^\.claude\/agents\/[^/]+\.md$/.test(path)) return parseAgentStamp(read().toString("utf8")) !== null;
  if (path === "AGENTS.md") return read().toString("utf8").includes(CODEX_SENTINEL_BEGIN);
  return false;
}

/** Where an adopted kit takes a project input that would otherwise sit undeclared in the kit root. */
const ADOPTED_INPUT_HOMES: Readonly<Record<string, string>> = {
  "ontology/glossary.yaml": "design/knowledge/glossary.yaml",
};

/** The undeclared-file message, naming the supported home when the file is a known project input. */
export function undeclaredFileMessage(path: string): string {
  const home = ADOPTED_INPUT_HOMES[path];
  return home === undefined
    ? `Undeclared file: ${path}`
    : `Undeclared file: ${path} — an adopted kit reads it from ${home} (or declare it in kit.json artifacts before adoption)`;
}
