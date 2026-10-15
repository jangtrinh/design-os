/**
 * DS Guidelines Pack — assemble the rendered files + manifest (pure, no fs).
 *
 * Deterministic (T7): inputs are sorted, the only clock is the caller's `now`,
 * and the manifest goes through `canonicalStringify` (sorted keys). Identical
 * inputs therefore produce identical bytes.
 */
import { canonicalStringify } from "./ds-manifest.js";
import { buildOverviewFile, buildStoreSections } from "./ds-guidelines-store-sections.js";
import { buildRulingsSections } from "./ds-guidelines-rulings-sections.js";
import { buildGrammarFile, buildSoulParts } from "./ds-guidelines-grammar-soul-sections.js";
import { buildTerminologyFile, loadTerminology } from "./ds-guidelines-terminology-sections.js";
import { PACK_MANIFEST_NAME } from "./ds-guidelines-model.js";
import type { GuidelineFile, PackInputs, RuleSource, SkippedSource, StoreSourcePaths } from "./ds-guidelines-model.js";
import { renderFile, sha256Hex } from "./ds-guidelines-render.js";
import type { DesignSystem } from "./design-system.js";

export interface PackFileOutput {
  path: string;
  content: string;
}

export interface BuiltPack {
  /** Markdown files first, manifest last — write in this order. */
  files: PackFileOutput[];
  ruleCount: number;
  openQuestions: number;
  skipped: SkippedSource[];
}

const OPEN_SLOT_RE = /^> QUESTION\(/gm;

export function buildPack(ds: DesignSystem, src: StoreSourcePaths, now: string, inputs: PackInputs): BuiltPack {
  const store = buildStoreSections(ds, src);
  const rulings = buildRulingsSections(inputs.rulings);
  const terminology = loadTerminology(inputs.context, inputs.glossary);
  const skipped: SkippedSource[] = [...store.skipped, ...rulings.skipped, ...terminology.skipped];
  const terminologyFile = buildTerminologyFile(terminology);
  const body: GuidelineFile[] = [
    ...store.files, ...rulings.files, ...(terminologyFile !== null ? [terminologyFile] : []),
    buildGrammarFile(inputs.conventions, skipped),
  ];
  const overview = buildOverviewFile(ds, body.map((f) => f.path), buildSoulParts(inputs.soul, skipped));
  const sections: GuidelineFile[] = [overview, ...body];
  const markdown: PackFileOutput[] = sections
    .map((f) => ({ path: f.path, content: renderFile(f) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const rules: { id: string; file: string; sources: RuleSource[] }[] = [];
  const ids = new Set<string>();
  for (const file of [...sections].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const part of file.parts) {
      if (part.kind !== "block") continue;
      for (const rule of part.rules) {
        if (ids.has(rule.id)) throw new Error(`internal: duplicate guideline rule id '${rule.id}'`);
        ids.add(rule.id);
        rules.push({ id: rule.id, file: file.path, sources: rule.sources });
      }
    }
  }

  const openQuestions = markdown.reduce((n, f) => n + (f.content.match(OPEN_SLOT_RE)?.length ?? 0), 0);
  const manifest = {
    version: 1,
    generatedAt: now,
    designSystem: { name: ds.manifest.name, generation: ds.manifest.generation, version: ds.manifest.version },
    files: markdown.map((f) => ({
      path: f.path,
      bytes: Buffer.byteLength(f.content, "utf8"),
      sha: sha256Hex(f.content),
      // Generated block ids, so `check` can tell a deleted block from an untouched one.
      blocks: (sections.find((s) => s.path === f.path)?.parts ?? []).flatMap((part) => (part.kind === "block" ? [part.id] : [])),
    })),
    ruleCount: rules.length,
    rules,
    openQuestions,
    // The sealed store hashes the pack was built from — a later slice compares them to flag stale packs.
    sources: [
      { path: src.tokens, sha: ds.manifest.compiledHash },
      { path: src.registry, sha: ds.manifest.registryHash },
      // Optional inputs whose content went into the pack (a skipped input was not used).
      ...Object.values(inputs).flatMap((i) =>
        i.text !== undefined && !skipped.some((k) => k.path === i.path) ? [{ path: i.path, sha: sha256Hex(i.text) }] : []),
    ].sort((a, b) => a.path.localeCompare(b.path)),
    ...(rulings.stats !== undefined ? { rulings: rulings.stats } : {}),
    ...(terminology.terms.length > 0
      ? { terminology: { terms: terminology.terms.length, fromContext: terminology.fromContext, fromGlossary: terminology.fromGlossary, conflicts: terminology.conflicts } }
      : {}),
    skippedSources: [...skipped].sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason)),
  };
  return {
    files: [...markdown, { path: PACK_MANIFEST_NAME, content: canonicalStringify(manifest) }],
    ruleCount: rules.length,
    openQuestions,
    skipped: manifest.skippedSources,
  };
}
