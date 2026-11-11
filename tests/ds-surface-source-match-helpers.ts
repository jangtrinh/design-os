/** Shared setup of the D16 tests: a fixture sealed with a Figma-door registry, the collision ruled, the source-match question raised. */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import type { ComponentRecord } from "../src/core/registry-store.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture } from "./owner-rulings-helpers.js";
import { TOKENS_FILE, answerKind, fixtureCopy, keyOf, surface } from "./ds-surface-helpers.js";

export const COLLISION = "component-name-collision";
export const MATCH = "component-source-match";
export const NOW = "2026-11-11T09:00:00Z";
export type Rec = ComponentRecord & { code?: { sourceRef: string; sha256: string } };
export const registryOf = (p: string): { components: Rec[] } => JSON.parse(readFileSync(join(p, "design", "component-registry.json"), "utf8")) as { components: Rec[] };
export const manifestOf = (p: string) => JSON.parse(readFileSync(join(p, "design", "ds.manifest.json"), "utf8")) as { generation: number; changelog: { kind: string; note?: string }[] };
export const pending = (p: string) => readPending(p).clusters.filter((c) => c.kind === MATCH);
export const apply = (p: string, ...more: string[]) => surface(p, "--register", "--apply", "--now", NOW, ...more);

export const figma = (name: string, n: number, tokensUsed: string[], extra: Record<string, unknown> = {}) => ({
  name, category: "Library", markup: `<div data-figma="${name}"></div>`, tokensUsed, scope: "local", variants: ["Size=Small"],
  provenance: { kind: "figma", sourceRef: `figma:${n}:1`, sha256: "sha256-AAAA" }, ...extra,
});
/** The fixture sealed together with a Figma-door registry (`ui ds import --registry`), as an owner's project would be. */
export function sealedFromFigma(records: unknown[], project = fixtureCopy(), more: string[] = []): string {
  const file = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-surface-figma-")), "component-registry.json");
  writeFileSync(file, JSON.stringify({ version: "1", components: records }));
  const done = capture(["ds", "import", TOKENS_FILE, "--dir", project, "--registry", file, "--json", ...more]);
  if (done.code !== 0) throw new Error(done.out + done.err);
  return project;
}
export const BASE = (): unknown[] => [figma("Card", 1, ["color.ink"]), figma("Panel", 2, ["space.md"], { provenance: undefined }), figma("Gone", 3, [])];
export function readyProject(records: unknown[] = BASE()): string {
  const p = sealedFromFigma(records);
  const file = join(p, "src/components/ui/Button.tsx");
  writeFileSync(file, readFileSync(file, "utf8").replace(', borderColor: "var(--color-missing)"', "")); // the planted undeclared token is refused by a sealed store
  surface(p);
  expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
  surface(p, "--register");
  return p;
}
export const answerMatch = (p: string, pick: (k: ReturnType<typeof keyOf>[number]) => Record<string, unknown>) => answerKind(p, MATCH, pick);
