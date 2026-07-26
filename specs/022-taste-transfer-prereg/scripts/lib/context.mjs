// scripts/lib/context.mjs
//
// Shared filesystem-access context passed to every check function, so checks never
// hand-roll path joining or error handling. Read errors are returned as {ok:false},
// never thrown — a missing file is a finding, not a crash.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function makeContext({ specDir, repoRoot, corpus, mode }) {
  return {
    specDir,
    repoRoot,
    corpus,
    mode,
    // Which phases' evidence this mode may see. "post-phase-a" is the Phase-A gate:
    // Phase-A evidence is required and Phase-B evidence is forbidden, so the whole
    // check set narrows to Phase A. Every other mode sees both phases.
    phaseScope: mode === "post-phase-a" ? "A" : null,
    abs(rel) {
      return join(specDir, rel);
    },
    exists(rel) {
      return existsSync(this.abs(rel));
    },
    isDir(rel) {
      return this.exists(rel) && statSync(this.abs(rel)).isDirectory();
    },
    readText(rel) {
      try {
        return { ok: true, data: readFileSync(this.abs(rel), "utf8") };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    readBytes(rel) {
      try {
        return { ok: true, data: readFileSync(this.abs(rel)) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    // Read an ABSOLUTE path outside the spec dir. Used for exactly one thing: the
    // committed external secret map, read in place and read-only at the Phase-A
    // gate, and only after its bytes hash-match the public commitment.
    readBytesAbs(absPath) {
      try {
        return { ok: true, data: readFileSync(absPath) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    readJSON(rel) {
      const t = this.readText(rel);
      if (!t.ok) return t;
      try {
        return { ok: true, data: JSON.parse(t.data) };
      } catch (err) {
        return { ok: false, error: `invalid JSON: ${err.message}` };
      }
    },
  };
}
