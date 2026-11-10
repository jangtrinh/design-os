// Regenerates the three synthetic scan fixtures next to this file. Deterministic: no clock, no randomness.
//   node tests/fixtures/owner-rulings/generate-scan-fixtures.mjs
// Every name is invented; the counts are the measured shapes listed in SOURCES.md.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pad = (n, w = 3) => String(n).padStart(w, "0");
const color = (i) => ({ r: ((i * 37) % 256) / 255, g: ((i * 91) % 256) / 255, b: ((i * 53) % 256) / 255, a: 1 });
const alias = (id) => ({ type: "VARIABLE_ALIAS", id });

// ── 5 collections, 516 variables, one colliding pair of 76 paths ────────────────────────────────
const tokens = [];
for (let i = 0; i < 103; i++) tokens.push({ id: `V:prim-${i}`, name: `primitives/color/shade-${pad(i)}`, type: "COLOR", collection: "Primitives", value: color(i) });
for (let i = 0; i < 149; i++) tokens.push({ id: `V:sem-${i}`, name: `semantic/color/role-${pad(i)}`, type: "COLOR", collection: "Semantic", valuesByMode: { Light: alias(`V:prim-${i % 103}`) } });
for (let i = 0; i < 98; i++) tokens.push({ id: `V:space-${i}`, name: `spacing/space/step-${pad(i)}`, type: "FLOAT", collection: "Spacing Primitives", value: i * 4 });
for (let i = 0; i < 86; i++) tokens.push({ id: `V:pa-${i}`, name: `plugin-export/color/${i < 76 ? "c" : "a-only"}-${pad(i)}`, type: "COLOR", collection: "Plugin Export A", value: color(i + 7) });
for (let i = 0; i < 80; i++) tokens.push({ id: `V:pb-${i}`, name: `plugin-export/color/${i < 76 ? "c" : "b-only"}-${pad(i)}`, type: "COLOR", collection: "Plugin Export B", value: color(i + 11) });
writeFileSync(join(here, "variables-five-collections.json"), `${JSON.stringify({ components: [], tokens }, null, 2)}\n`);

// ── 11 pages, 781 component nodes: one library page (477), ten feature pages (304) ─────────────
const components = [];
let n = 0;
const node = (name, page) => components.push({ id: `C:${n++}`, name, type: n % 5 === 0 ? "COMPONENT_SET" : "COMPONENT", page });
const LIB = "Library";
const marked = [
  ...Array.from({ length: 9 }, (_, i) => `❌ Legacy Item ${pad(i)}`),
  ...Array.from({ length: 8 }, (_, i) => `[ARCHIVED] Old Item ${pad(i)}`),
  ...Array.from({ length: 8 }, (_, i) => `[deprecated] Old Item ${pad(i + 8)}`),
];
marked.forEach((name) => node(name, LIB)); // 25 archive-marked
for (let d = 0; d < 9; d++) for (let k = 0; k < (d < 6 ? 2 : 3); k++) node(`Duplicate Widget ${pad(d)}`, LIB); // 9 names, 12 surplus records
const libraryPlain = 477 - marked.length - (6 * 2 + 3 * 3);
for (let i = 0; i < libraryPlain; i++) node(`Widget ${pad(i)}`, LIB);
const featurePages = [["Feature Area A", 144], ["Feature Area B", 48], ["Feature Area C", 34], ["Feature Area D", 30], ["Feature Area E", 18], ["Feature Area F", 14], ["Feature Area G", 10], ["Feature Area H", 4], ["Feature Area I", 1], ["Feature Area J", 1]];
for (const [page, count] of featurePages) for (let i = 0; i < count; i++) node(`${page} Piece ${pad(i)}`, page);
writeFileSync(join(here, "components-eleven-pages.json"), `${JSON.stringify({ components, tokens: [] }, null, 2)}\n`);

// ── control: one collection, one page, nothing to ask ──────────────────────────────────────────
const control = {
  components: Array.from({ length: 5 }, (_, i) => ({ id: `C:${i}`, name: `Control Widget ${i}`, type: "COMPONENT", page: "Library" })),
  tokens: Array.from({ length: 12 }, (_, i) => ({ id: `V:core-${i}`, name: `color/brand-${pad(i)}`, type: "COLOR", collection: "Core", value: color(i) })),
};
writeFileSync(join(here, "control-single-collection-single-page.json"), `${JSON.stringify(control, null, 2)}\n`);
