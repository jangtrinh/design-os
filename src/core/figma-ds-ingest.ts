/**
 * Figma design-system ingest — the pure orchestrator (zero-network, zero-LLM).
 *
 * Validates a parsed ds.json (the `figma-agent scan-design-system` output) and
 * transforms it into the portable ease-design stores: a DTCG token tree, a
 * component registry, and a DESIGN.md knowledge doc. The command wrapper
 * (src/commands/ingest-figma-ds.ts) owns all filesystem I/O and memory seeding;
 * this module is a deterministic value → value transform.
 */
import { buildTokensTree } from "./figma-ds-tokens.js";
import type { DsVariable, DtcgTree } from "./figma-ds-tokens.js";
import { buildRegistry } from "./figma-ds-registry.js";
import type { DsComponent } from "./figma-ds-registry.js";
import { buildDesignDoc } from "./figma-ds-designdoc.js";
import type { DsStyle } from "./figma-ds-designdoc.js";
import type { Registry } from "./registry-store.js";

/** Typed failure for a malformed ds.json (shape, not JSON syntax). */
export class DsIngestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DsIngestError";
    this.code = code;
  }
}

export interface DsFile {
  components: DsComponent[];
  tokens: DsVariable[];
  styles: DsStyle[];
}

export interface IngestResult {
  tree: DtcgTree;
  registry: Registry;
  designMd: string;
  counts: { tokens: number; components: number; styles: number };
  stats: { primitives: number; semantics: number; skippedTokens: number };
  componentNames: string[];
}

function requireArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) {
    throw new DsIngestError("BAD_DS", `ds.json is missing the '${key}' array (is this a scan-design-system output?)`);
  }
  return v;
}

/** Validate the parsed ds.json into a typed DsFile, or throw DsIngestError("BAD_DS"). */
export function parseDsFile(json: unknown): DsFile {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new DsIngestError("BAD_DS", "ds.json must be a JSON object with components/tokens/styles arrays");
  }
  const obj = json as Record<string, unknown>;
  const components = requireArray(obj, "components") as DsComponent[];
  const tokens = requireArray(obj, "tokens") as DsVariable[];
  const styles = requireArray(obj, "styles") as DsStyle[];
  return { components, tokens, styles };
}

/** Transform a validated ds.json into the portable stores. Deterministic. */
export function ingestDesignSystem(ds: DsFile, name: string, source: string): IngestResult {
  const built = buildTokensTree(ds.tokens);
  const registry = buildRegistry(ds.components);
  const counts = {
    tokens: ds.tokens.length,
    components: ds.components.length,
    styles: ds.styles.length,
  };
  const designMd = buildDesignDoc({
    name,
    source,
    tree: built.tree,
    registry,
    styles: ds.styles,
    counts,
  });
  return {
    tree: built.tree,
    registry,
    designMd,
    counts,
    stats: { primitives: built.primitives, semantics: built.semantics, skippedTokens: built.skipped },
    componentNames: registry.components.map((c) => c.name),
  };
}
