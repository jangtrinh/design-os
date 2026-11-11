import { readFileSync, readdirSync } from "node:fs";
/** A source file that exists and cannot be read as what it claims to be: refused by name, never read as "missing". */
export class OntologyReadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OntologyReadError";
    this.code = code;
  }
}

export const BAD_SOURCE = "ONTOLOGY_BAD_SOURCE";

/** Reads a JSON file that exists; a syntax error is a refusal that names the file. */
export function parseSourceJson(rel: string, text: string): unknown {
  try { return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); }
  catch { throw new OntologyReadError(BAD_SOURCE, `${rel} is not valid JSON; fix it or remove it, then run ui ontology build again`); }
}

const reason = (e: unknown): string => (e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "read failed");

/** Reads a file that exists; a path that cannot be read (a directory, no permission) is a refusal that names it. */
export function readSourceText(rel: string, absolute: string): string {
  try { return readFileSync(absolute, "utf8"); }
  catch (e) { throw new OntologyReadError(BAD_SOURCE, `${rel} cannot be read (${reason(e)}); fix it or remove it, then run ui ontology build again`); }
}

/** The entries of a directory that exists; a path that is not a readable directory is a refusal that names it. */
export function readSourceDir(rel: string, absolute: string): string[] {
  try { return readdirSync(absolute); }
  catch (e) { throw new OntologyReadError(BAD_SOURCE, `${rel} cannot be read as a directory (${reason(e)}); fix it or remove it, then run ui ontology build again`); }
}
