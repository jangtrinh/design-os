/** Shared setup of the registration-question suites (spec 033 D17, D18): a project already registered from code, then edited. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { COLLISION, MATCH, answerMatch, apply, readyProject } from "./ds-surface-source-match-helpers.js";
import { answerKind, sealedFixture, surface } from "./ds-surface-helpers.js";

export const CHANGED = "component-source-changed";
export const LINT = "component-lint-refused";

export const clustersOf = (p: string, kind: string) => readPending(p).clusters.filter((c) => c.kind === kind);

/** Replaces one exact text in a file of the project; a text that is not there fails the test instead of editing nothing. */
export function edit(p: string, rel: string, from: string, to: string): void {
  const file = join(p, rel);
  const text = readFileSync(file, "utf8");
  expect(text, `${rel} holds ${JSON.stringify(from)}`).toContain(from);
  writeFileSync(file, text.replace(from, to));
}

/** The fixture sealed with a Figma registry, "same" answered and `--apply` run: Card and Panel linked, four code records. */
export function registeredProject(): string {
  const p = readyProject();
  expect(answerMatch(p, (k) => ({ choice: k.options.find((o) => o.id === "same")!.id })).code).toBe(0);
  const done = apply(p);
  expect(done.code, done.out).toBe(0);
  expect(readPending(p).clusters.filter((c) => c.kind === MATCH)).toHaveLength(0);
  return p;
}

/** Card (a linked record) and Avatar (a code record) have changed since they were registered. */
export function registeredAndEdited(): string {
  const p = registeredProject();
  edit(p, "src/components/ui/Card.tsx", "p-4", "p-6");
  edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full bg-surface");
  return p;
}

/**
 * A component whose directory name holds a backslash: the registration path reads a backslash as a path separator, finds
 * no such file and refuses its source reference (`REGISTRY_BAD_SOURCE_REF`), a refusal that is not of the lint family and
 * so is never asked.
 */
export const UNREGISTRABLE = ["OddOne", "OddThree", "OddTwo"];
export function addUnregistrableComponent(p: string): void {
  const dir = join(p, "src/components", "odd\\dir"); // three components: a directory under `components` is a component directory from three files
  mkdirSync(dir, { recursive: true });
  for (const name of UNREGISTRABLE) writeFileSync(join(dir, `${name}.tsx`), `export function ${name}() { return <div className="bg-surface" />; }\n`);
}

/** Removes the undeclared token the fixture's Button plants, so a sealed store lints it clean. */
export function cleanButtons(p: string): void {
  for (const rel of ["src/components/ui/Button.tsx", "src/components/kit/Button.tsx"]) {
    const file = join(p, rel);
    if (existsSync(file)) writeFileSync(file, readFileSync(file, "utf8").replace(', borderColor: "var(--color-missing)"', ""));
  }
}

export const LAMP = "src/components/kit/Lamp.tsx";
export const LAMP_SOURCE = "export function Lamp() { return <i style={{ color: \"var(--color-ghost)\" }} />; }\n";

/** Button (planted undeclared token) and Lamp (another one) fail the lint of a sealed store; the collision is ruled. */
export function lintProject(raise = true): string {
  const p = sealedFixture();
  writeFileSync(join(p, LAMP), LAMP_SOURCE);
  surface(p);
  expect(answerKind(p, COLLISION, (k) => ({ choice: k.options.find((o) => o.id === "public-dir:src/components/ui")!.id })).code).toBe(0); // the public Button is the one that holds the planted token
  if (raise) surface(p, "--register");
  return p;
}
