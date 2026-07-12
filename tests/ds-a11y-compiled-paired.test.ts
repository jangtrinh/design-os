/**
 * Dogfood finding L7 regression guard — a FRESHLY COMPILED DS must audit clean.
 *
 * `ui ds init` now emits the paired {role}/{role}-foreground vocabulary with
 * contrast-aware foregrounds, so `ui ds a11y` runs in the deterministic "paired"
 * mode (never the legacy "inferred" fallback) and reports ZERO failures. This
 * exercises the real CLI end-to-end: init → a11y --json.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { loadPersonaIndex } from "../src/core/persona-loader.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

function capture(args: string[]): { exitCode: number; stdout: string } {
  let stdout = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  process.stderr.write = () => true;
  let exitCode: number;
  try { exitCode = run(args); } finally { process.stdout.write = origOut; process.stderr.write = origErr; }
  return { exitCode, stdout };
}

interface A11yData { mode: string; failures: unknown[]; checkedPairs: number; inferred: boolean }

/** Compile a DS for `persona` into a temp dir, then run `ds a11y --json` and parse it. */
function initThenA11y(persona: string): { exitCode: number; data: A11yData } {
  const tmp = mkdtempSync(join(tmpdir(), "ease-l7-"));
  const init = capture(["ds", "init", "acme", "--persona", persona, "--intent", "audit", "--dir", tmp, "--persona-data", PERSONA_DATA, "--json"]);
  expect(init.exitCode, `init ${persona}`).toBe(0);
  const r = capture(["ds", "a11y", "--dir", tmp, "--json"]);
  return { exitCode: r.exitCode, data: JSON.parse(r.stdout).data as A11yData };
}

describe("compiled DS → ui ds a11y paired mode with zero failures (L7)", () => {
  // Two personas from DIFFERENT families, per the acceptance criterion.
  it("saas-aurora-minimal (functional-saas): mode 'paired', 0 failures, exit 0", () => {
    const { exitCode, data } = initThenA11y("saas-aurora-minimal");
    expect(data.mode).toBe("paired");
    expect(data.inferred).toBe(false);
    expect(data.failures).toHaveLength(0);
    expect(data.checkedPairs).toBeGreaterThan(0);
    expect(exitCode).toBe(0);
  });

  it("liquid-glass (material-surface): mode 'paired', 0 failures, exit 0", () => {
    const { exitCode, data } = initThenA11y("liquid-glass");
    expect(data.mode).toBe("paired");
    expect(data.inferred).toBe(false);
    expect(data.failures).toHaveLength(0);
    expect(exitCode).toBe(0);
  });

  // Stronger guarantee: EVERY persona compiles to a clean paired audit — the
  // contrast-aware picker must never leave a sub-AA foreground for any brand hue.
  it("every persona in the index compiles to paired mode with 0 a11y failures", () => {
    for (const p of loadPersonaIndex(PERSONA_DATA)) {
      const { exitCode, data } = initThenA11y(p.slug);
      expect(data.mode, `${p.slug} mode`).toBe("paired");
      expect(data.failures, `${p.slug} failures`).toHaveLength(0);
      expect(exitCode, `${p.slug} exit`).toBe(0);
    }
  });
});
