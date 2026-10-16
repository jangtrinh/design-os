/**
 * DS Guidelines Pack — shared types (pure, no fs).
 *
 * A pack is a handful of markdown files compiled from the sealed design system.
 * Each file is an ordered list of PARTS: free text (host-editable: headings, slots)
 * and generated BLOCKS (facts the binary owns; sealed by a sha so edits are caught).
 * Every rule inside a block carries the sources that justify it.
 */

/** Where a rule comes from: a project-relative file plus the token path / component it names. */
export interface RuleSource {
  /** Project-relative POSIX path of the source file (e.g. `design/design.tokens.json`). */
  path: string;
  /** Dotted token path (`color.surface-base`), when the rule is about a token. */
  token?: string;
  /** Registry component name (`Button/Primary`), when the rule is about a component. */
  component?: string;
  /** Owner-ruling id, when the rule restates a ruling from the rulings file. */
  ruling?: string;
  /** Glossary term as written in its source, when the rule defines a term. */
  term?: string;
  /** Heading of the CONVENTIONS.md section the rule is copied from. */
  section?: string;
  /** Canonical colour role (e.g. `card`), when the rule is about a role no token plays. */
  role?: string;
}

export interface RuleEntry {
  /** Pack-unique, stable across rebuilds. */
  id: string;
  /** The exact markdown line emitted for this rule. */
  text: string;
  sources: RuleSource[];
}

export type FilePart =
  | { kind: "text"; lines: string[] }
  | { kind: "block"; id: string; lines: string[]; rules: RuleEntry[] };

export interface GuidelineFile {
  /** Pack-relative POSIX path (`vocabulary.md`). */
  path: string;
  parts: FilePart[];
}

/** An optional input the pack could not use — recorded, never fatal. */
export interface SkippedSource {
  path: string;
  reason: string;
}

/** Project-relative paths of the sealed store files the pack reads. */
export interface StoreSourcePaths {
  tokens: string;
  registry: string;
}

export interface StoreSections {
  files: GuidelineFile[];
  skipped: SkippedSource[];
}

/** An optional input file: project-relative (or absolute, when outside) path + text when present. */
export interface OptionalInput {
  path: string;
  /** Undefined when the file does not exist. */
  text?: string;
}

/** Every optional input the pack can read; I/O lives in the command layer, parsing in core. */
export interface PackInputs {
  rulings: OptionalInput;
  /** Product glossary: `CONTEXT.md` at the project root. */
  context: OptionalInput;
  /** Ontology glossary: `ontology/glossary.yaml` at the project root. */
  glossary: OptionalInput;
  /** Measured house style: `CONVENTIONS.md` at the project root (from `ui synthesize-conventions`). */
  conventions: OptionalInput;
  /** Declared stance: `design/soul.md`. */
  soul: OptionalInput;
}

/** A malformed optional input — carries the error code the command reports. */
export class GuidelinesInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GuidelinesInputError";
    this.code = code;
  }
}

/** A pack as it sits on disk before a rebuild — the source of answers to carry forward. */
export interface ExistingPack {
  /** Markdown files of the pack (the orphans file excluded). */
  files: { path: string; text: string }[];
  /** Current text of guidelines.orphans.md, when present. */
  orphansText?: string;
}

export const PACK_MANIFEST_NAME = "guidelines.manifest.json";

export function textPart(...lines: string[]): FilePart {
  return { kind: "text", lines };
}

export function blockPart(id: string, lines: string[], rules: RuleEntry[] = []): FilePart {
  return { kind: "block", id, lines, rules };
}

/** Lowercase, non-alphanumerics collapsed to `-`, trimmed — for ids built from names. */
export function slug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** `base`, or `base-2`, `base-3`… when `used` already holds it. Records the result in `used`. */
export function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}
