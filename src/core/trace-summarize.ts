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
 *   mutate  {t, kind: "mutate", session?}
 *   skill   {t, kind: "skill", name, session?}
 *   gate    {t, kind: "gate", session?}
 *
 * Only Claude hosts emit these records, so coverage is reported as `claude-only` when a
 * trace exists and `none` when it does not — never pretended.
 */

export interface TraceSummary {
  bytesBeforeFirstMutate: number;
  filesBeforeFirstMutate: string[];
  readmeOpened: boolean;
  indexOpened: boolean;
  esDesignerLoaded: boolean;
  esDesignerChecklistRan: boolean;
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
  let readmeOpened = false;
  let indexOpened = false;
  let esDesignerLoaded = false;
  let checklistRead = false;
  let esDesignerChecklistRan = false;
  let gateRuns = 0;

  for (const record of records) {
    const kind = record["kind"];
    if (kind === "mutate") {
      mutated = true;
    } else if (kind === "skill") {
      if (isEsDesigner(record["name"])) esDesignerLoaded = true;
    } else if (kind === "gate") {
      gateRuns++;
      // The checklist RAN only when its gate followed a read of checklist.md after the load.
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
      if (esDesignerLoaded && path.endsWith("es-designer/checklist.md")) checklistRead = true;
    }
  }

  return {
    bytesBeforeFirstMutate,
    filesBeforeFirstMutate,
    readmeOpened,
    indexOpened,
    esDesignerLoaded,
    esDesignerChecklistRan,
    gateRuns,
    traceCoverage: records.length > 0 ? "claude-only" : "none",
    malformedLines: parsed.malformed,
  };
}
