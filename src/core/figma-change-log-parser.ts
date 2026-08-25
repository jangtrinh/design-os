/**
 * Defensive parser for the append-only Figma change log.
 *
 * The log is a serialization boundary with the separately bundled figma-agent, so this
 * kernel validates the bytes it receives instead of importing producer implementation.
 */
import {
  EXPECTED_CHANGE_LOG_VERSION,
  ReconcileError,
  type ChangeFrame,
} from "./figma-reconcile-types.js";

/** Parse and validate one JSONL record. lineNumber is one-based for diagnostics. */
export function parseChangeLogLine(line: string, lineNumber: number): ChangeFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new ReconcileError("BAD_CHANGE_LOG", `change-log line ${lineNumber} is not valid JSON`);
  }
  return validateFrame(parsed, lineNumber);
}

/**
 * Parse the complete log. Blank lines are ignored; any malformed record fails loudly so
 * audit history is never skipped silently.
 */
export function parseChangeLog(raw: string): ChangeFrame[] {
  const frames: ChangeFrame[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;
    frames.push(parseChangeLogLine(line, i + 1));
  }
  return frames;
}

function validateFrame(value: unknown, line: number): ChangeFrame {
  const bad = (message: string): never => {
    throw new ReconcileError("BAD_CHANGE_LOG", `change-log line ${line}: ${message}`);
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return bad("frame must be an object");
  }
  const frame = value as Record<string, unknown>;
  if (frame["v"] !== EXPECTED_CHANGE_LOG_VERSION) {
    return bad(`unsupported schema version ${String(frame["v"])} (expected ${EXPECTED_CHANGE_LOG_VERSION})`);
  }
  if (typeof frame["ts"] !== "number") return bad("ts must be a number");
  if (frame["op"] !== "created" && frame["op"] !== "updated" && frame["op"] !== "deleted") {
    return bad(`invalid op '${String(frame["op"])}'`);
  }
  if (typeof frame["nodeId"] !== "string" || frame["nodeId"].length === 0) {
    return bad("nodeId must be a non-empty string");
  }
  if (frame["nodeName"] !== null && typeof frame["nodeName"] !== "string") {
    return bad("nodeName must be a string or null");
  }
  if (typeof frame["nodeType"] !== "string") return bad("nodeType must be a string");
  if (!Array.isArray(frame["changedProps"]) || frame["changedProps"].some((prop) => typeof prop !== "string")) {
    return bad("changedProps must be an array of strings");
  }
  if (frame["origin"] !== "LOCAL" && frame["origin"] !== "REMOTE") {
    return bad(`invalid origin '${String(frame["origin"])}'`);
  }
  if (frame["scopeHint"] !== "local" && frame["scopeHint"] !== "global") {
    return bad(`invalid scopeHint '${String(frame["scopeHint"])}'`);
  }
  if (typeof frame["page"] !== "string") return bad("page must be a string");
  if (frame["fileKey"] !== null && typeof frame["fileKey"] !== "string") {
    return bad("fileKey must be a string or null");
  }
  if (frame["fileName"] !== undefined && typeof frame["fileName"] !== "string") {
    return bad("fileName must be a string when present");
  }

  return {
    v: EXPECTED_CHANGE_LOG_VERSION,
    ts: frame["ts"],
    op: frame["op"],
    nodeId: frame["nodeId"],
    nodeName: frame["nodeName"] as string | null,
    nodeType: frame["nodeType"],
    changedProps: frame["changedProps"] as string[],
    origin: frame["origin"],
    scopeHint: frame["scopeHint"],
    page: frame["page"],
    fileKey: frame["fileKey"] as string | null,
    ...(typeof frame["fileName"] === "string" && { fileName: frame["fileName"] }),
  };
}
