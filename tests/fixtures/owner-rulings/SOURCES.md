# Sources of the owner-rulings fixtures

Every file here is synthetic. No project data, client name, node id, variable name or file content from any real
project is included; the names are invented and the files are produced by `generate-scan-fixtures.mjs` (deterministic,
no clock, no randomness). What is reproduced is the **shape** measured on a real working Figma design-system scan
(Spec 033, section 1.2): the counts below, not the content. The three scan fixtures use the id forms of a real scan (`VariableID:<group>:<n>` for variables, `<n>:<n>` for nodes), a page as `{ id, name }` and an empty `styles` list, so they validate against `schemas/figma-ds-scan.schema.json`.

| File | Reproduces (measured shape) | Counts the test asserts |
|---|---|---|
| `variables-five-collections.json` | A scan with 5 variable collections, one colliding pair, and an alias chain from the semantic collection into the primitive one | 516 variables in 5 collections (149 / 103 / 98 / 86 / 80); 76 token paths collide, all between the two plugin-style collections; none involves the semantic or primitive collection |
| `components-eleven-pages.json` | A scan whose component-kind nodes sit on 11 pages: one library page and ten feature pages, with archive markers and duplicate names on the library page | 781 nodes; 477 on the library page, 304 on the other ten (144, 48, 34, 30, 18, 14, 10, 4, 1, 1); 25 archive-marked names (leading cross mark, `[ARCHIVED]`, `[DEPRECATED]`, any case); 9 names that occur more than once after marker stripping, 12 surplus records |
| `control-single-collection-single-page.json` | The control: a single-collection, single-page file | 1 collection, 12 variables, no collision; 5 nodes on 1 page, no marker, no duplicate |
| `scan-sensed-field-shape.json` | A small scan in the sensed field shape of the scan schema: pages as `{ id, name }`, `boundVariables`, `instances` (a local id and a library key), `unresolvedInstances`, `frames` with a section, `sensing` | 3 components, 2 variables in 2 collections (one aliasing the other), 2 frames on 2 pages |
| `scan-breaks-schema.json` | A scan that breaks the scan schema three ways: a component without an id, a numeric host-internal id, a variable of a remote collection under `tokens` | the schema test must fail it on exactly those three paths |
| `kinds/<kind>/must-raise.json`, `must-not-raise.json` | Per cluster kind, an input its emitter must raise a cluster for, and one it must not (Art II). Present for the eight Figma-ingest kinds: `figma-collections`, `token-path-collision`, `figma-library-pages`, `screen-pages`, `archived-marked-nodes`, `duplicate-component-names`, `classification-conflicts`, `untypeable-tokens`; the other kinds add theirs with their emitters | n/a |
| `brief-golden/*` | Captured output of `ui brief questions` before its option/limit logic was shared with `ui onboard questions`; the snapshot test requires byte-identical output | n/a |

The collection names (`Semantic`, `Primitives`, `Spacing Primitives`, `Plugin Export A`, `Plugin Export B`) and the
page names (`Library`, `Feature Area A` to `J`) are generic labels chosen for this fixture.
