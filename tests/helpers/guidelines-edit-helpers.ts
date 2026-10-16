/**
 * Edit helpers for the guidelines tests: change a sealed store and reseal it, answer one slot,
 * read a section of a pack file, and detect whether chmod really blocks writes on this machine.
 */
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalHash, canonicalStringify } from "../../src/core/ds-manifest.js";
import { read, tempDir } from "./guidelines-harness.js";

type Tokens = Record<string, Record<string, Record<string, unknown>>>;

/** Rewrite the registry of a project and reseal the manifest, so the store stays valid. */
export function editRegistry(dir: string, mutate: (registry: { components: Record<string, unknown>[] }) => void): void {
  const d = join(dir, "design");
  const registry = JSON.parse(read(d, "component-registry.json")) as { components: Record<string, unknown>[] };
  mutate(registry);
  const manifest = JSON.parse(read(d, "ds.manifest.json")) as Record<string, unknown>;
  manifest["registryHash"] = canonicalHash(registry);
  writeFileSync(join(d, "component-registry.json"), canonicalStringify(registry));
  writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
}

/** Rewrite the tokens of a project and reseal the manifest. */
export function editTokens(dir: string, mutate: (tokens: Tokens) => void): void {
  const d = join(dir, "design");
  const tokens = JSON.parse(read(d, "design.tokens.json")) as Tokens;
  mutate(tokens);
  const manifest = JSON.parse(read(d, "ds.manifest.json")) as Record<string, unknown>;
  manifest["compiledHash"] = canonicalHash(tokens);
  writeFileSync(join(d, "design.tokens.json"), canonicalStringify(tokens));
  writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
}

/** Reseal the store so it has no measurable gap: no baked roles, no failing pair, no missing component state. */
export function makeGapFree(dir: string): void {
  editTokens(dir, (tokens) => {
    for (const g of Object.values(tokens)) for (const t of Object.values(g)) delete t["$extensions"];
    tokens["color"]!["accent-soft-text"]!["$value"] = "#000000";
  });
  editRegistry(dir, (registry) => { for (const c of registry.components) c["states"] = ["default"]; });
}

/** Insert answer lines under the first QUESTION line that matches `slot`; returns that slot's id. */
export function fillSlot(file: string, slot: RegExp, answer: readonly string[]): string {
  const lines = readFileSync(file, "utf8").split("\n");
  const idx = lines.findIndex((l) => slot.test(l));
  if (idx < 0) throw new Error(`no slot matching ${String(slot)} in ${file}`);
  lines.splice(idx + 1, 0, ...answer);
  writeFileSync(file, lines.join("\n"));
  return /QUESTION\(([^)]+)\)/.exec(lines[idx] ?? "")?.[1] ?? "?";
}

/** The lines from the heading matching `heading` up to (not including) the next heading of the same or higher level. */
export function sectionUnder(text: string, heading: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) throw new Error(`no heading matching ${String(heading)}`);
  const level = /^#+/.exec(lines[start] ?? "")?.[0].length ?? 1;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#+ /.test(l) && (/^#+/.exec(l)?.[0].length ?? 9) <= level);
  return lines.slice(start, end < 0 ? undefined : start + 1 + end).join("\n");
}

/** True when a mode change really blocks writing here (false as root or on Windows): chmod tests skip otherwise. */
export function chmodBlocksWrites(): boolean {
  if (process.platform === "win32" || process.getuid?.() === 0) return false;
  const file = join(tempDir("ease-guidelines-chmod-probe-"), "probe.txt");
  writeFileSync(file, "x");
  chmodSync(file, 0o444);
  try { writeFileSync(file, "y"); return false; } catch { return true; } finally { chmodSync(file, 0o644); }
}
