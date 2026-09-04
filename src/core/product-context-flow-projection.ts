import { FlowError, parseFlow } from "./flow-model.js";
import { lintFlow } from "./flow-lint.js";
import { normalizeProductContextFlowValue } from "./product-context-receipt-model.js";
import { ProductContextError, ascii, finalizeProductContextFindings, finding, sha256 } from "./product-context-value.js";
import type { Flow } from "./flow-model.js";
import type { CompileResult } from "./product-context-compile.js";
import type { Json, Obj } from "./product-context-value.js";

const FLOW_FIELDS = ["flow.screens", "flow.transitions", "flow.entryPoints"] as const;
type FlowField = (typeof FLOW_FIELDS)[number];

export interface ProductContextFlowProjection {
  kind: "product-context-flow-projection";
  version: 1;
  status: "available" | "blocked";
  productId: string;
  atlasDigest: string;
  truthStatus: "not-evaluated";
  flow: Flow | null;
  findings: Obj[];
  errorCount: number;
  warningCount: number;
}

function normalizedFlow(flow: Flow): Flow {
  return {
    screens: flow.screens.map((screen) => ({ ...screen, states: [...screen.states].sort(ascii) })).sort((left, right) => ascii(left.id, right.id)),
    transitions: [...flow.transitions].sort((left, right) => ascii(left.id, right.id)),
    entryPoints: [...flow.entryPoints].sort((left, right) => ascii(left.id, right.id)),
  };
}

function fieldValue(atlas: Obj, field: FlowField): Json[] | undefined {
  const entry = (atlas.fields as Obj[]).find((item) => item.field === field);
  if (entry?.resolution !== "resolved" || entry.value === null) return undefined;
  const candidates = entry.candidates as Obj[];
  if (!candidates.some((candidate) => (candidate.status === "selected" || candidate.status === "coalesced") && (candidate.claim as Obj).disposition === "present")) return undefined;
  return normalizeProductContextFlowValue(entry.value, field);
}

function result(atlas: Obj, supplied: Buffer, flow: Flow | null, findings: Obj[]): ProductContextFlowProjection {
  const finalized = finalizeProductContextFindings(findings.map((item) => ({ ...item })));
  return {
    kind: "product-context-flow-projection",
    version: 1,
    status: finalized.errorCount === 0 && flow !== null ? "available" : "blocked",
    productId: String(atlas.productId),
    atlasDigest: sha256(supplied),
    truthStatus: "not-evaluated",
    flow: finalized.errorCount === 0 ? flow : null,
    ...finalized,
  };
}

export function projectProductContextFlow(replay: CompileResult, supplied: Buffer): ProductContextFlowProjection {
  const replayFindings = replay.findings.map((item) => ({ ...item }));
  if (replay.errorCount > 0) return result(replay.atlas, supplied, null, replayFindings);
  let values: readonly (readonly [FlowField, Json[] | undefined])[];
  try {
    values = FLOW_FIELDS.map((field) => [field, fieldValue(replay.atlas, field)] as const);
  } catch (error) {
    if (error instanceof ProductContextError) return result(replay.atlas, supplied, null, [...replayFindings, finding("flow-projection-invalid", "error", error.message)]);
    throw error;
  }
  const unavailable = values.filter(([, value]) => value === undefined).map(([field]) =>
    finding("flow-entry-unavailable", "error", `${field} is not resolved from active present evidence`),
  );
  if (unavailable.length > 0) return result(replay.atlas, supplied, null, [...replayFindings, ...unavailable]);
  const flowInput = Object.fromEntries(values) as Record<FlowField, Json[]>;
  try {
    const flow = normalizedFlow(parseFlow({
      screens: flowInput["flow.screens"],
      transitions: flowInput["flow.transitions"],
      entryPoints: flowInput["flow.entryPoints"],
    }, "replayed-flow.json"));
    const flowFindings = lintFlow(flow).findings.map((item) => ({ ...item } as Obj));
    return result(replay.atlas, supplied, flow, [...replayFindings, ...flowFindings]);
  } catch (error) {
    if (error instanceof FlowError || error instanceof ProductContextError) {
      return result(replay.atlas, supplied, null, [...replayFindings, finding("flow-projection-invalid", "error", error.message)]);
    }
    throw error;
  }
}
