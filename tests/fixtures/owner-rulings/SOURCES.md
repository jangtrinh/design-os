# Sources of the owner-rulings fixtures

Every file here is synthetic. No project data, client name, node id, variable name or file content from any real
project is included; the names are invented and the files are produced by `generate-scan-fixtures.mjs` (deterministic,
no clock, no randomness). What is reproduced is the **shape** measured on a real working Figma design-system scan
(Spec 033, section 1.2): the counts below, not the content.

| File | Reproduces (measured shape) | Counts the test asserts |
|---|---|---|
| `variables-five-collections.json` | A scan with 5 variable collections, one colliding pair, and an alias chain from the semantic collection into the primitive one | 516 variables in 5 collections (149 / 103 / 98 / 86 / 80); 76 token paths collide, all between the two plugin-style collections; none involves the semantic or primitive collection |
| `components-eleven-pages.json` | A scan whose component-kind nodes sit on 11 pages: one library page and ten feature pages, with archive markers and duplicate names on the library page | 781 nodes; 477 on the library page, 304 on the other ten (144, 48, 34, 30, 18, 14, 10, 4, 1, 1); 25 archive-marked names (leading cross mark, `[ARCHIVED]`, `[DEPRECATED]`, any case); 9 names that occur more than once after marker stripping, 12 surplus records |
| `control-single-collection-single-page.json` | The control: a single-collection, single-page file | 1 collection, 12 variables, no collision; 5 nodes on 1 page, no marker, no duplicate |
| `kinds/<kind>/must-raise.json`, `must-not-raise.json` | Per cluster kind, an input its emitter must raise a cluster for, and one it must not (Art II). The directory does not exist in the first phase: the table and the coverage test ship before any emitter, and each later phase adds the fixtures of the kinds it implements | n/a |
| `brief-golden/*` | Captured output of `ui brief questions` before its option/limit logic was shared with `ui onboard questions`; the snapshot test requires byte-identical output | n/a |

The collection names (`Semantic`, `Primitives`, `Spacing Primitives`, `Plugin Export A`, `Plugin Export B`) and the
page names (`Library`, `Feature Area A` to `J`) are generic labels chosen for this fixture.
