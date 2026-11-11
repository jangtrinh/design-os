/**
 * Helpers of the `ui ds surface` suites: a scratch copy of the synthetic embedded-app fixture (with or without a sealed
 * token store), generated project shapes for the app-default and budget tests, the JSON envelope reader, and an answer
 * helper that builds an answer from the `--format claude` answer key alone, the way a host does.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import type { KeyEntry } from "./project-kinds-helpers.js";
import { writeFiles } from "./scan-wide-app-fixture.js";

export const FIXTURE = join(process.cwd(), "tests", "fixtures", "ds-surface", "embedded-app");
export const TOKENS_FILE = join(FIXTURE, "tokens.json");

export type Envelope = { ok?: boolean; data?: Record<string, any>; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const envelope = (out: string): Envelope => JSON.parse(out) as Envelope;

const scratch = (prefix: string): string => mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), prefix));

/** A scratch copy of the fixture (the token file stays outside the project, as a user's would until imported). */
export function fixtureCopy(): string {
  const dir = scratch("ds-surface-");
  cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith("tokens.json") });
  return dir;
}

/** The fixture with its token store sealed by `ui ds import`, the way a user onboards tokens before the surface. */
export function sealedFixture(): string {
  const dir = fixtureCopy();
  const done = capture(["ds", "import", TOKENS_FILE, "--dir", dir, "--json"]);
  if (done.code !== 0) throw new Error(`fixture import failed: ${done.out}${done.err}`);
  return dir;
}

export const surface = (project: string, ...extra: string[]): ReturnType<typeof capture> => capture(["ds", "surface", "--cwd", project, "--json", ...extra]);

export const pkg = (deps: Record<string, string>): string => JSON.stringify({ name: "x", dependencies: deps });
const three = (base: string): Record<string, string> => Object.fromEntries(["A", "B", "C"].map((n) => [`${base}/${n}.tsx`, `export function ${n}Thing() { return <div className="x" />; }\n`]));

/** A root application with one example project beside it. */
export const ROOT_APP_WITH_EXAMPLE: Record<string, string> = {
  "package.json": pkg({ react: "18" }), ...three("src/components"),
  "examples/demo/package.json": pkg({ react: "18" }), ...three("examples/demo/src/components"),
};
/** A workspace root that names no framework, one application and two config packages. */
export const WORKSPACE_ONE_APP: Record<string, string> = {
  "package.json": pkg({}),
  "apps/web/package.json": pkg({ next: "15" }), ...three("apps/web/components"),
  "packages/eslint-config/package.json": pkg({}), "packages/tsconfig/package.json": pkg({}),
};
/** A workspace root that names no framework and two applications. */
export const WORKSPACE_TWO_APPS: Record<string, string> = {
  "package.json": pkg({}),
  "apps/web/package.json": pkg({ next: "15" }), ...three("apps/web/components"),
  "apps/admin/package.json": pkg({ react: "18" }), ...three("apps/admin/components"),
};

export function projectFrom(files: Record<string, string>): string {
  const dir = scratch("ds-surface-shape-");
  writeFiles(dir, files);
  return dir;
}

/** Answers every open question of `kind` from the claude answer key: `pick` chooses the answer for one key entry. */
export function answerKind(project: string, kind: string, pick: (entry: KeyEntry) => Record<string, unknown>): ReturnType<typeof submit> {
  return submit(project, keyOf(project).filter((k) => k.kind === kind).map((k) => ({ fingerprint: k.fingerprint, ...pick(k) })));
}

export { keyOf, submit, writeFiles, mkdirSync, readFileSync, writeFileSync };
