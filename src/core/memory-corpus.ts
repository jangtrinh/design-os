/**
 * Design-memory corpus export — the deterministic seam between the `ui` binary
 * and the (optional, non-deterministic) `recall/` workspace.
 *
 * The binary never embeds anything. It walks the append-only ledger and emits one
 * natural-language payload per *embeddable* item, tagged with a memory tier. The
 * recall workspace embeds those payloads into a rebuildable vector view; truth
 * stays the JSONL ledger (Track 9 boundary invariant #2).
 *
 * Tiers (plan §P3a):
 *   episodic   — what happened to *this* project: recorded insights (with provenance)
 *   semantic   — durable facts/rationale: token-change reasons, harvested sources
 *   procedural — how we design: persona signatures, vibe→axis mappings
 *
 * Only the enumerated sources are embeddable; other event types (user_pick,
 * taste_verdict, …) carry no free text worth embedding and are skipped — they
 * already shape the compiled graph's weights.
 *
 * Pure: no fs, no clock, no network. Ledger order is preserved, so the same
 * ledger always yields the same corpus bytes.
 */
import type { MemoryEvent } from "./memory-events.js";

export type CorpusTier = "semantic" | "episodic" | "procedural";

export interface CorpusItem {
  /** The source event id — the join key a rank-file refers back to. */
  id: string;
  tier: CorpusTier;
  /** Natural-language payload to embed. */
  text: string;
  /** Provenance event ids (empty unless the source event carried refs). */
  refs: string[];
  /** Source event timestamp (ISO-8601), for decay + bi-temporal validity. */
  t: string;
}

/** `"e12"` → `12`; null when the id is not a well-formed monotonic event id. */
export function eventIdNumber(id: string): number | null {
  const m = /^e(\d+)$/.exec(id);
  if (m === null) return null;
  const n = Number.parseInt(m[1] as string, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/** Read a string field out of an event's untyped `data` bag. */
function str(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

/**
 * Shape one event into an embeddable payload, or null when the event carries no
 * free text (its signal already lives in the compiled graph).
 */
function shape(e: MemoryEvent): { tier: CorpusTier; text: string } | null {
  const d = e.data;
  switch (e.type) {
    case "insight": {
      const text = str(d, "text");
      return text === undefined ? null : { tier: "episodic", text };
    }
    case "token_change": {
      // Only a *reasoned* change is durable knowledge; a bare value swap is not.
      const reason = str(d, "reason");
      const path = str(d, "path");
      if (reason === undefined || path === undefined) return null;
      const from = str(d, "from") ?? "?";
      const to = str(d, "to") ?? "?";
      return { tier: "semantic", text: `Token ${path} changed from ${from} to ${to}. Reason: ${reason}` };
    }
    case "harvested": {
      const source = str(d, "source");
      if (source === undefined) return null;
      const what = str(d, "what");
      return { tier: "semantic", text: `Harvested ${what ?? "design signals"} from ${source}.` };
    }
    case "vibe_edit": {
      const word = str(d, "word");
      const axis = str(d, "axis");
      if (word === undefined || axis === undefined) return null;
      return { tier: "procedural", text: `The vibe "${word}" maps to the ${axis} axis.` };
    }
    case "variant_generated": {
      const persona = str(d, "persona");
      const mode = str(d, "mode");
      if (persona === undefined || mode === undefined) return null;
      const intent = str(d, "intent");
      const tail = intent === undefined ? "" : ` for: ${intent}`;
      return { tier: "procedural", text: `Persona ${persona} was used to generate a ${mode} design${tail}.` };
    }
    default:
      return null;
  }
}

/**
 * Walk the ledger and emit the embeddable corpus, in ledger (chronological) order.
 *
 * `sinceId` makes the export incremental: only events *after* that id are emitted.
 * Ids are monotonic (`e1`, `e2`, …), so the cut is numeric — a `sinceId` that no
 * longer exists in the ledger still slices correctly.
 */
export function exportCorpus(events: readonly MemoryEvent[], sinceId?: string): CorpusItem[] {
  let floor = 0;
  if (sinceId !== undefined) {
    const n = eventIdNumber(sinceId);
    if (n === null) throw new Error(`--since expected an event id like 'e12', got '${sinceId}'`);
    floor = n;
  }

  const items: CorpusItem[] = [];
  for (const e of events) {
    const num = eventIdNumber(e.id);
    if (num !== null && num <= floor) continue;
    const shaped = shape(e);
    if (shaped === null) continue;
    items.push({ id: e.id, tier: shaped.tier, text: shaped.text, refs: e.refs ?? [], t: e.t });
  }
  return items;
}

/** Index a corpus by event id — the join a `--rank-file` performs. */
export function corpusById(items: readonly CorpusItem[]): Map<string, CorpusItem> {
  const m = new Map<string, CorpusItem>();
  for (const it of items) m.set(it.id, it);
  return m;
}

/**
 * Parse a rank-file payload into an ordered id list. Accepts either a bare id
 * array (`["e12","e5"]`) or the scored form `recall query` emits
 * (`[{"id":"e12","score":0.8}, …]`); order in the file IS the rank order.
 * Throws on any other shape so a malformed file fails loud.
 */
export function parseRankFile(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("rank-file must contain a JSON array of event ids");
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      ids.push(entry);
    } else if (entry !== null && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
      ids.push((entry as { id: string }).id);
    } else {
      throw new Error('rank-file entries must be event ids ("e12") or objects with an "id" field');
    }
  }
  return ids;
}
