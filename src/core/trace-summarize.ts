/**
 * `ui trace summarize` kernel — pure, fs-free, no clock, no model (Art I).
 *
 * Input: the lines of `.design-os/trace/reads.jsonl`, appended by the host hook
 * `templates/hooks/design-os-read-trace.cjs`. Output: how much context an agent loaded
 * before its first mutation, which orientation files it opened, and — kept as two
 * separate facts on purpose — whether it LOADED the es-designer skill and whether it
 * actually RAN that skill's checklist. Loading a skill is not running its checklist.
 *
 * Record shapes (one JSON object per line):
 *   read    {t, tool, path, bytes, kind?: "read", session?}
 *   mutate  {t, kind: "mutate", tool?, path?, session?}   a write inside the project tree; a Bash
 *           mutate WITHOUT a `path` predates target recording and cannot be verified, so it is
 *           counted in `unclassifiedMutations` and does not end the pre-mutation window
 *   skill   {t, kind: "skill", name, session?}
 *   gate    {t, kind: "gate", command?, session?}
 *
 * Only Claude hosts emit these records, so coverage is reported as `claude-only` when a
 * trace exists and `none` when it does not — never pretended.
 */

/** The record that ended the pre-mutation window — shown so a reader can see what was counted. */
export interface FirstMutation {
  t?: string;
  kind: string;
  path?: string;
  /** Set on the legacy-Bash stand-in so a reader sees why no target is shown. */
  note?: string;
}

export interface TraceSummary {
  bytesBeforeFirstMutate: number;
  firstMutation: FirstMutation | null;
  /** Bash mutate records with no recorded target path: not counted, not silently dropped. */
  unclassifiedMutations: number;
  filesBeforeFirstMutate: string[];
  readmeOpened: boolean;
  indexOpened: boolean;
  esDesignerLoaded: boolean;
  esDesignerChecklistRan: boolean;
  /** A read of es-designer/checklist.md was recorded (independent of any gate). */
  checklistReadRecorded: boolean;
  gateRuns: number;
  traceCoverage: "claude-only" | "none";
  /** Lines that were not a JSON object — counted, never silently dropped. */
  malformedLines: number;
}

export interface SummarizeOptions {
  /** Keep only records carrying this `session` id (records without one are dropped). */
  session?: string;
}

type TraceRecord = Record<string, unknown>;

function parseLines(lines: readonly string[]): { records: TraceRecord[]; malformed: number } {
  const records: TraceRecord[] = [];
  let malformed = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        records.push(value as TraceRecord);
      } else {
        malformed++;
      }
    } catch {
      malformed++;
    }
  }
  return { records, malformed };
}

const toPosix = (p: string): string => p.replace(/\\/g, "/");

/** `es:designer`, `es-designer` and a plugin-prefixed `x:es-designer` are the same skill. */
function isEsDesigner(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const normal = name.trim().toLowerCase().replace(/:/g, "-");
  return normal === "es-designer" || normal.endsWith("-es-designer");
}

function readBytes(record: TraceRecord): number {
  const b = record["bytes"];
  return typeof b === "number" && Number.isFinite(b) && b > 0 ? b : 0;
}

function isReadRecord(record: TraceRecord): record is TraceRecord & { path: string } {
  const kind = record["kind"];
  return (kind === undefined || kind === "read") && typeof record["path"] === "string";
}

export function summarizeTrace(lines: readonly string[], options: SummarizeOptions = {}): TraceSummary {
  const parsed = parseLines(lines);
  const records = options.session === undefined
    ? parsed.records
    : parsed.records.filter((r) => r["session"] === options.session);

  const seen = new Set<string>();
  const filesBeforeFirstMutate: string[] = [];
  let bytesBeforeFirstMutate = 0;
  let mutated = false;
  let firstMutation: FirstMutation | null = null;
  let unclassifiedMutations = 0;
  let readmeOpened = false;
  let indexOpened = false;
  let esDesignerLoaded = false;
  let checklistRead = false;
  let firstLegacy: FirstMutation | null = null;
  let esDesignerChecklistRan = false;
  let gateRuns = 0;

  for (const record of records) {
    const kind = record["kind"];
    if (kind === "mutate") {
      const target = record["path"];
      if (record["tool"] === "Bash" && typeof target !== "string") {
        unclassifiedMutations++;
        firstLegacy ??= {
          ...(typeof record["t"] === "string" ? { t: record["t"] } : {}),
          kind: "bash-legacy",
          note: "untargeted legacy record",
        };
      } else if (!mutated) {
        mutated = true;
        firstMutation = {
          ...(typeof record["t"] === "string" ? { t: record["t"] } : {}),
          kind: typeof record["tool"] === "string" ? record["tool"] : "mutate",
          ...(typeof target === "string" ? { path: toPosix(target) } : {}),
        };
      }
    } else if (kind === "skill") {
      if (isEsDesigner(record["name"])) esDesignerLoaded = true;
    } else if (kind === "gate") {
      gateRuns++;
      // The checklist RAN when ANY gate event (direct `ui gate`/`slop-detect` or a wrapper
      // script that runs one) followed a read of checklist.md.
      if (checklistRead) esDesignerChecklistRan = true;
    } else if (isReadRecord(record)) {
      const path = toPosix(record.path);
      if (!mutated) {
        bytesBeforeFirstMutate += readBytes(record);
        if (!seen.has(path)) {
          seen.add(path);
          filesBeforeFirstMutate.push(path);
        }
      }
      if (path === "README.md") readmeOpened = true;
      if (path === "knowledge/index.json" || path.endsWith("/knowledge/index.json")) indexOpened = true;
      if (path.endsWith("es-designer/checklist.md")) checklistRead = true;
    }
  }

  return {
    bytesBeforeFirstMutate,
    // Never "none" while a mutate record exists: a window that no targeted write ended shows the legacy stand-in.
    firstMutation: firstMutation ?? firstLegacy,
    unclassifiedMutations,
    filesBeforeFirstMutate,
    readmeOpened,
    indexOpened,
    esDesignerLoaded,
    esDesignerChecklistRan,
    checklistReadRecorded: checklistRead,
    gateRuns,
    traceCoverage: records.length > 0 ? "claude-only" : "none",
    malformedLines: parsed.malformed,
  };
}
