/**
 * AC-17 (FR-031): the Figma door ends in the sealed store. `ui ds import --registry <file>` seals the tokens and the
 * registry `ui ingest-figma-ds` wrote under one manifest; every record is validated first; a sealed registry is never
 * replaced without `--reset-registry`; the ingest's error text names the flag.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalHash } from "../src/core/ds-manifest.js";
import { ingestArgs, ingestUntilReady, newProject, scanOf, takeRecommended, writeScan, colorVar, comp } from "./figma-ingest-helpers.js";
import type { Choose } from "./figma-ingest-helpers.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { projectWith } from "./project-kinds-helpers.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "owner-rulings");
const read = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Record<string, unknown>;
type Envelope = { data?: Record<string, any>; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (out: string): Envelope => JSON.parse(out) as Envelope;
const LIB = { id: "0:1", name: "Library" };

/** A small scan with named components and one collection: no question is raised. */
const smallScan = (): Record<string, unknown> => scanOf({
  tokens: [colorVar("1:1", "color/brand", "Primitives"), colorVar("1:2", "color/ink", "Primitives")],
  components: [comp("1:1", "Button/Primary", LIB), comp("1:2", "Card/Summary", LIB), comp("1:3", "Chip/Status", LIB)],
});

/** Ingests `scan` to a fresh out dir, answering whatever it asks; returns the out dir and the ledger. */
function ingest(scan: Record<string, unknown>): { out: string; written: number; tokens: string; registry: string } {
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
const sealRegistry = (project: string): { components: { name: string }[] } => JSON.parse(readFileSync(join(project, "design", "component-registry.json"), "utf8")) as { components: { name: string }[] };

describe("AC-17: ingest, answer, then `ui ds import --registry` leaves the registry in the sealed store", () => {
  it("the multi-collection, multi-page fixtures: the sealed record count equals the ledger's written count, and `ui ds status` passes", () => {
    const eleven = read("components-eleven-pages.json");
    const five = read("variables-five-collections.json");
    const { out, written, tokens, registry } = ingest({ ...eleven, tokens: five["tokens"] });
    expect(written).toBe(431);
    const project = projectWith({ "package.json": "{}" });
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(json(r.out).data!["registry"].components).toBe(written);
    expect(sealRegistry(project).components).toHaveLength(written);
    expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0);
    expect(existsSync(join(out, "tokens.json"))).toBe(true);
  });
  it("one manifest covers both: registryHash is the hash of the records sealed, so altering a record is DS_TAMPERED", () => {
    const { tokens, registry } = ingest(smallScan());
    const project = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", tokens, "--registry", registry, "--dir", project]).code).toBe(0);
    const file = join(project, "design", "component-registry.json");
    const manifest = JSON.parse(readFileSync(join(project, "design", "ds.manifest.json"), "utf8")) as { registryHash: string; compiledHash: string };
    expect(manifest.registryHash).toBe(canonicalHash(JSON.parse(readFileSync(file, "utf8"))));
    const edited = JSON.parse(readFileSync(file, "utf8")) as { components: { description?: string }[] };
    edited.components[0]!.description = "edited by hand";
    writeFileSync(file, JSON.stringify(edited));
    const status = capture(["ds", "status", "--dir", project, "--json"]);
    expect(status.code).toBe(1);
    expect(status.out + status.err).toContain("DS_TAMPERED");
  });
  it("`ui reuse-plan check` resolves a component name from the sealed registry", () => {
    const { tokens, registry } = ingest(smallScan());
    const project = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", tokens, "--registry", registry, "--dir", project]).code).toBe(0);
    const plan = join(project, "plan.md");
    writeFileSync(plan, "# Reuse plan\n\n## Screen: Orders\nPattern: none — one-off\n\n| Slot | Rung | Use | Reason |\n|---|---|---|---|\n| action | 3 | Button/Primary | — |\n| card | 3 | Card/Summary | — |\n");
    const r = capture(["reuse-plan", "check", plan, "--dir", project, "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(json(r.out).data!["screens"][0].reuse).toBe(2);
  });
  it("without --registry the sealed registry is empty, as before", () => {
    const { tokens } = ingest(smallScan());
    const project = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", tokens, "--dir", project]).code).toBe(0);
    expect(sealRegistry(project).components).toEqual([]);
  });
});

describe("a sealed registry is never replaced without --reset-registry", () => {
  const sealed = (): { project: string; tokens: string; registry: string; before: string } => {
    const { tokens, registry } = ingest(smallScan());
    const project = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", tokens, "--registry", registry, "--dir", project]).code).toBe(0);
    return { project, tokens, registry, before: hashTree(project) };
  };
  it("--force with --registry over a non-empty sealed registry: REGISTRY_NOT_EMPTY, nothing written", () => {
    const { project, tokens, registry, before } = sealed();
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--force", "--json"]);
    expect(r.code).toBe(1);
    expect(json(r.out).error!.code).toBe("REGISTRY_NOT_EMPTY");
    expect(json(r.out).error!.message).toContain("--reset-registry");
    expect(hashTree(project)).toBe(before);
  });
  it("--registry alone over a sealed store is refused too: the tokens exist (EXISTS), and no merge happens", () => {
    const { project, tokens, registry, before } = sealed();
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--json"]);
    expect(json(r.out).error!.code).toBe("EXISTS");
    expect(hashTree(project)).toBe(before);
  });
  it("--registry with --reset-registry replaces it and the store still verifies", () => {
    const { project, tokens, registry } = sealed();
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--force", "--reset-registry", "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0);
  });
  it("a registry flag over a non-empty registry is guarded even when the tokens file is gone", () => {
    const { project, tokens, registry } = sealed();
    capture(["onboard", "--cwd", project, "--no-banner"]);
    writeFileSync(join(project, "design", "design.tokens.json"), "{}");
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--force", "--json"]);
    expect(json(r.out).error!.code).toBe("REGISTRY_NOT_EMPTY");
  });
});

describe("every record is validated before anything is written", () => {
  const badRegistry = (mutate: (records: Record<string, unknown>[]) => unknown): { project: string; tokens: string; file: string; before: string } => {
    const { tokens, registry } = ingest(smallScan());
    const registryJson = JSON.parse(readFileSync(registry, "utf8")) as { version: string; components: Record<string, unknown>[] };
    const file = join(newProject(), "component-registry.json");
    writeFileSync(file, JSON.stringify({ version: registryJson.version, components: mutate(registryJson.components) }));
    const project = projectWith({ "package.json": "{}" });
    return { project, tokens, file, before: hashTree(project) };
  };
  it("a record that fails the registry store's validation refuses the import and nothing is written", () => {
    const { project, tokens, file, before } = badRegistry((records) => records.map((r, i) => (i === 1 ? { ...r, tokensUsed: "not a list" } : r)));
    const r = capture(["ds", "import", tokens, "--registry", file, "--dir", project, "--json"]);
    expect(r.code).toBe(1);
    expect(json(r.out).error!.code).toBe("BAD_REGISTRY");
    expect(json(r.out).error!.message).toContain("registry record #1");
    expect(json(r.out).error!.message).toContain("Nothing was written");
    expect(hashTree(project)).toBe(before);
    expect(existsSync(join(project, "design"))).toBe(false);
  });
  it("a record that is not an object, a repeated name, a missing file and a bare flag are each refused with their own code", () => {
    const notObject = badRegistry((records) => [...records, 7]);
    expect(json(capture(["ds", "import", notObject.tokens, "--registry", notObject.file, "--dir", notObject.project, "--json"]).out).error!.code).toBe("BAD_REGISTRY");
    const twice = badRegistry((records) => [...records, records[0]]);
    const dup = capture(["ds", "import", twice.tokens, "--registry", twice.file, "--dir", twice.project, "--json"]);
    expect(json(dup.out).error!.code).toBe("BAD_REGISTRY");
    expect(json(dup.out).error!.message).toContain("appears twice");
    const missing = capture(["ds", "import", twice.tokens, "--registry", join(twice.project, "nope.json"), "--dir", twice.project, "--json"]);
    expect(json(missing.out).error!.code).toBe("FILE_NOT_FOUND");
    const bare = capture(["ds", "import", twice.tokens, "--registry", "--dir", twice.project, "--json"]);
    expect(json(bare.out).error!.code).toBe("BAD_ARG");
    expect(existsSync(join(twice.project, "design"))).toBe(false);
  });
});

describe("the ingest error text names --registry", () => {
  it("refusing --out design points at `ui ds import <out>/tokens.json --registry <out>/component-registry.json`", () => {
    const cwd = newProject();
    const designOut = join(newProject(), "design");
    mkdirSync(designOut, { recursive: true });
    const r = capture([...ingestArgs(writeScan(cwd, smallScan()), cwd, designOut), "--json"]);
    expect(json(r.out).error!.code).toBe("SEALED_PATH_COLLISION");
    expect(json(r.out).error!.message).toContain("ui ds import <out>/tokens.json --registry <out>/component-registry.json --dir <project>");
  });
});
