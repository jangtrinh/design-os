# Sources of the ontology fixtures

Every file here is synthetic. No project data, client name, node id, variable name or file content from any real project
is included; the names (`Button`, `Card`, `Badge`, `Sign in`, `Dashboard`, `Ledger`) are generic labels. The fixtures
hold only what a person or a host writes. Everything the kernel itself produces (the sealed token store, the sealed
component registry, the promoted rule, the component registrations, the owner's rulings) is produced by running the
kernel's own commands in `tests/ontology-helpers.ts`, so a fixture can never hold a hand-made store or a hand-placed rule.

| Path | What it is | How the project is built from it |
|---|---|---|
| `ring1/ds.json` | A scan in the sensed field shape of `schemas/figma-ds-scan.schema.json`: three components on one library page (`Button`, a component set that nests `Badge`; `Card`; `Badge`) with `boundVariables`, three variables in one collection, three frames on two pages (`Screens`, `Sketches`), one instance that names a library component the scan does not hold and one instance count the host could not resolve | `ui ingest-figma-ds ring1/ds.json --out <bundle> --cwd <project>`; the `screen-pages` question is answered from the `--format claude` answer key (keep `Screens`, drop `Sketches`); `ui ds import <bundle>/tokens.json --registry <bundle>/component-registry.json --dir <project>` seals the store and the registry together; the scan is then placed at `<project>/design/ds.json`, as `figma-agent scan-design-system --out design/ds.json` would |
| `ring1/soul.md` | A ratified soul (`status: ratified`) with two `## Never` and one `## Always` rule | copied to `<project>/design/soul.md` |
| (none) | The promoted rule | `ui ds harvest-bans --source <scratch tree> --write`, then `ui ds harvest-bans --accept NS-10`: the owner's accept is the only code that writes `_adherence.rules.json` |
| `code/` | A small React application: three components (`Card`, `Button`, `Badge`), three page files (`home` imports `Card` and `Button`, `pricing` imports `Card`, `empty` imports nothing), a Tailwind v4 theme and a flat token file | the app is copied without `tokens.json`; `ui ds import tokens.json --dir <project>` seals the store; `ui ds surface --cwd <project> --register --apply` registers the components with their source references and the tokens they reference |
| `full/` | Ring 2: `CONTEXT.md` (three terms: `Card` named like a component and a pattern, `Sign in` named like a screen, `Ledger` named like nothing), `design/knowledge/rulings.json` (five rulings: global, scoped to an app and a feature, superseded by a ruling, superseded by a ruling that does not exist, one that names no target; backticked mentions of a component, a token, a pattern and a component that does not exist), `design/principles.json`, `design/patterns/card.md` and `card-grid.md`, `design/knowledge/screens.meta.json` (`screens-meta/1` as supplied by a project, synthetic names: `screens` keyed by screen id, four entries, one app, one feature, two entries that tie to a frame, one to a frame that does not exist, one with no app; one `unassigned` entry) | copied over the ring-1 project, after the scan was edited so that one component has no bound-variable entry (a field the host did not sense) |
| (none) | The conventions pair | `ui synthesize-conventions` on a usage-dna built in the test; see `tests/ontology-conventions-pair.test.ts` |

Counts the tests assert on the ring-1 project: 1 project, 3 token, 3 component, 2 screen (the frame on the page ruled out
is not one), 4 rule (3 soul, 1 promoted), 7 gate nodes; 4 `uses-component` links (a screen reaches `Badge` only through
`Button`'s nested instance), 4 `consumes-token`, 4 `constrains`, 1 `checked-by`; 2 unresolved references.
