/** Helpers of the agents suites: one project per test, the commands through the CLI seam, and the roster files by role. */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";

export function pinStudioHome(): void {
  const saved = process.env["EASE_DESIGN_HOME"];
  beforeEach(() => { process.env["EASE_DESIGN_HOME"] = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "agents-home-")); });
  afterEach(() => { if (saved === undefined) delete process.env["EASE_DESIGN_HOME"]; else process.env["EASE_DESIGN_HOME"] = saved; });
}

export const ROLES = ["designer", "curator", "figma-hand"];
export const read = (p: string, rel: string): string => readFileSync(join(p, rel), "utf8");
export const prefix = (role: string): string => (role === "figma-hand" ? "figma" : role);
export const name = (p: string): string => JSON.parse(read(p, "design/ds.manifest.json")).name as string;
export const claudeFile = (p: string, role: string): string => `.claude/agents/${prefix(role)}-${name(p)}.md`;
export const init = (p: string, ...flags: string[]): ReturnType<typeof capture> => capture(["agents", "init", "--dir", p, ...flags]);
export const check = (p: string): { code: number; data: { findings: { checkId: string; severity: string; message: string }[]; errorCount: number; runtimesChecked: string[]; runtimesWithoutTargets: string[] } } => {
  const done = capture(["agents", "check", "--dir", p, "--json"]);
  return { code: done.code, data: JSON.parse(done.out).data };
};
export const codes = (p: string): string[] => check(p).data.findings.map((f) => f.checkId);
export const rawTemplate = (role: string): string => readFileSync(join(process.cwd(), "templates", "agents", `${role}.md`), "utf8");
export const projectOf = (): string => { const p = builtRing1(); expect(init(p).code).toBe(0); return p; };
