/**
 * Shared by the `ui ds import --registry` tests: a small invented scan ingested to a registry and a token file, the
 * envelope type, and the sealed registry reader. Every name is invented.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestUntilReady, newProject, scanOf, takeRecommended, writeScan, colorVar, comp } from "./figma-ingest-helpers.js";
import type { Choose } from "./figma-ingest-helpers.js";

export type Envelope = { data?: Record<string, any>; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const json = (out: string): Envelope => JSON.parse(out) as Envelope;
export const LIB = { id: "0:1", name: "Library" };

/** A small scan with named components and one collection: no question is raised. */
export const smallScan = (): Record<string, unknown> => scanOf({
  tokens: [colorVar("1:1", "color/brand", "Primitives"), colorVar("1:2", "color/ink", "Primitives")],
  components: [comp("1:1", "Button/Primary", LIB), comp("1:2", "Card/Summary", LIB), comp("1:3", "Chip/Status", LIB)],
});

/** Ingests `scan` to a fresh out dir, answering whatever it asks; returns the out dir and the ledger. */
export function ingest(scan: Record<string, unknown>): { out: string; written: number; tokens: string; registry: string } {
  const cwd = newProject();
  const out = newProject();
  const file = writeScan(cwd, scan);
  const choose: Choose = (c) =>
    c.kind === "figma-library-pages" ? [c.options.find((o) => o.label.includes("Library"))!.id]
      : c.kind === "archived-marked-nodes" ? "exclude-archived" : c.kind === "duplicate-component-names" ? "exclude-all" : takeRecommended(c);
  const { final } = ingestUntilReady(file, cwd, out, choose, ["--json"]);
  const data = json(final.out).data!;
  return { out, written: data["ledger"].written.components as number, tokens: join(out, "tokens.json"), registry: data["registry"] as string };
}
export const sealRegistry = (project: string): { components: { name: string; tokensUsed: string[] }[] } =>
  JSON.parse(readFileSync(join(project, "design", "component-registry.json"), "utf8")) as { components: { name: string; tokensUsed: string[] }[] };
