/**
 * The test that replaces the reviewer. For every object, list and leaf of every ring-2 JSON file of the full fixture
 * (found by walking the parsed JSON, not from a list of fields; ontology-variants-walker.ts), a variant replaces that
 * value in turn by wrong shapes, by a repeated list item, or by the key of another node kind. Each variant is built in
 * memory, the way the build command builds it. It must be refused by name, or satisfy the oracle
 * (ontology-variants-oracle.ts): node counts from the graph; each scope value, `figmaId` and mention is a link, an
 * unresolved reference or a counted repeat; a link lost against the unmodified fixture is explained by a changed value
 * of the same entry and a count; and the final de-duplication of links removes nothing.
 */
import { describe, expect, it } from "vitest";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { buildOntology } from "../src/core/ontology/build-ontology.js";
import { serializeOntology } from "../src/core/ontology/emit-ontology.js";
import { graphErrors } from "../src/core/ontology/graph-errors.js";
import { buildLinks } from "../src/core/ontology/link-rules.js";
import { readNodeSources } from "../src/core/ontology/node-sources.js";
import type { Ontology } from "../src/core/ontology/ontology-types.js";
import { OntologyReadError } from "../src/core/ontology/read-error.js";
import { FULL, fullProject, write } from "./ontology-helpers.js";
import { checkInvariant, checkLostLinks, checkNewLinks } from "./ontology-variants-oracle.js";
import { loadFiles, makeVariants } from "./ontology-variants-walker.js";

const REFUSALS = ["ONTOLOGY_BAD_SOURCE", "CONVENTIONS_PAIR_DRIFT", "ONTOLOGY_DUPLICATE_ID", "ONTOLOGY_DANGLING_LINK"];
const project = fullProject();
interface Out { refused?: string; o?: Ontology; deduped?: number }
function evaluate(): Out {
  try {
    const rulings = readRulingStore(project).rulings;
    const sources = readNodeSources(project, rulings);
    const o = buildOntology(sources, rulings).ontology;
    const bad = graphErrors(o.nodes, o.links);
    return bad.length > 0 ? { refused: bad[0]!.code } : { o, deduped: buildLinks(sources).deduped };
  } catch (e) { if (e instanceof OntologyReadError) return { refused: e.code }; throw e; }
}
const sum = (m: Record<string, number> | undefined, prefix: string): number => Object.entries(m ?? {}).filter(([k]) => k.startsWith(prefix)).reduce((n, [, c]) => n + c, 0);

const originals = loadFiles(FULL);
const files = [...originals.keys()];
for (const f of files) write(project, f, JSON.stringify(originals.get(f)));
const clean = evaluate();
const keysByKind = new Map<string, string[]>();
for (const n of clean.o?.nodes ?? []) keysByKind.set(n.kind, [...(keysByKind.get(n.kind) ?? []), n.id.slice(n.kind.length + 1)].sort());
const variants = makeVariants(originals, keysByKind);

describe("every ring-2 value, replaced by every wrong shape", () => {
  it(`${variants.length} variants over ${files.join(", ")}: refused by name, or every entry, reference and lost link accounted for`, () => {
    expect(clean.refused).toBeUndefined();
    checkInvariant(clean.o!, originals, "unmodified fixture");
    expect(clean.deduped, "unmodified fixture: the final de-duplication removes a link").toBe(0);
    const baseBytes = serializeOntology(clean.o!);
    let refusals = 0;
    for (const v of variants) {
      const label = `${v.file} ${["$", ...v.path].join(".")} -> ${v.how}`;
      write(project, v.file, JSON.stringify(v.doc));
      const out = evaluate();
      write(project, v.file, JSON.stringify(originals.get(v.file)));
      if (out.refused !== undefined) { expect(REFUSALS, label).toContain(out.refused); refusals++; continue; }
      checkInvariant(out.o!, new Map([...originals, [v.file, v.doc]]), label);
      checkNewLinks(clean.o!, out.o!, v, originals, label);
      checkLostLinks(clean.o!, out.o!, v, originals, label);
      expect(out.deduped, `${label}: the final de-duplication removes a link`).toBe(0);
      if (v.unknownKey && !v.path.includes("scope")) expect(serializeOntology(out.o!), label).toBe(baseBytes);
      if (v.unknownKey && v.path[v.path.length - 1] === "scope") expect(sum(out.o!.sources.find((s) => s.kind === "ruling")!.leftOut, "scope: key the kernel does not read"), label).toBe(1);
    }
    expect(refusals).toBeGreaterThan(0);
    expect(refusals).toBeLessThan(variants.length);
    console.log(`ring-2 variants: ${variants.length} run, ${refusals} refused by name, ${variants.length - refusals} built and checked`);
  }, 300_000);
});
