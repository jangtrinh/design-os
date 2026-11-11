/** Shared setup of the fix round 3 suites. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { answerKind, sealedFixture, surface } from "./ds-surface-helpers.js";

export const COLLISION = "component-name-collision";

/** The fixture sealed, its collision ruled and its planted undeclared token removed: a run that has records to write and nothing that blocks. */
export function writable(): string {
  const p = sealedFixture();
  surface(p);
  expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
  for (const f of ["src/components/ui/Button.tsx", "src/components/kit/Button.tsx"]) {
    const file = join(p, f);
    writeFileSync(file, readFileSync(file, "utf8").replace(', borderColor: "var(--color-missing)"', ""));
  }
  return p;
}

