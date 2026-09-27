/**
 * ksync ingest — the frame snapshot the HOST captured from Figma. The kernel never
 * calls Figma (Art. I); it only reads what was captured.
 *
 * Native shape:  { ingestedAt, fileKey?, frames: [{ nodeId, lastModified?, specHash? }] }
 * Also read:     the per-app ledger shape design/knowledge/ksync/frames.json already uses in
 *                practice ({ fileKey, apps: { <app>: { refreshedFromDumpAt, entries: [{ figmaId, specHash }] } } }),
 *                so a real project's ledger can be checked without a conversion step.
 */
export interface IngestFrame {
  nodeId: string;
  lastModifiedMs: number | null;
  specHash: string | null;
}

export interface Ingest {
  ingestedAtMs: number | null;
  fileKey: string | null;
  frames: Map<string, IngestFrame>;
}

export class IngestError extends Error {}

/** ISO string or epoch milliseconds → epoch ms; anything else → null (an unknown time is never guessed). */
export function toMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function parseIngest(doc: unknown): Ingest {
  const d = obj(doc);
  if (d === null) throw new IngestError("frames file is not a JSON object");
  const frames = new Map<string, IngestFrame>();
  const add = (nodeId: string | null, lastModified: unknown, specHash: unknown): void => {
    if (nodeId === null) return;
    frames.set(nodeId, { nodeId, lastModifiedMs: toMs(lastModified), specHash: str(specHash) });
  };
  if (Array.isArray(d["frames"])) {
    for (const f of d["frames"]) {
      const o = obj(f);
      if (o !== null) add(str(o["nodeId"]), o["lastModified"], o["specHash"]);
    }
    return { ingestedAtMs: toMs(d["ingestedAt"]), fileKey: str(d["fileKey"]), frames };
  }
  const apps = obj(d["apps"]);
  if (apps === null) throw new IngestError("frames file needs a 'frames' array (or a per-app 'apps' ledger)");
  let newest: number | null = null;
  for (const app of Object.values(apps)) {
    const a = obj(app);
    if (a === null) continue;
    const at = toMs(a["refreshedFromDumpAt"]);
    if (at !== null && (newest === null || at > newest)) newest = at;
    if (Array.isArray(a["entries"])) for (const e of a["entries"]) { const o = obj(e); if (o !== null) add(str(o["figmaId"]), null, o["specHash"]); }
  }
  return { ingestedAtMs: newest, fileKey: str(d["fileKey"]), frames };
}
