# Sources of the ingest goldens

Captured from the build of `ui ingest-figma-ds` that existed before the command learned to ask questions, run with
`--name golden --now 2026-01-01T00:00:00Z` on three scans that are committed in this repository:

| Folder | Scan | Notes |
|---|---|---|
| `ds/` | `tests/fixtures/figma-ds/ds.json` | Two variables cannot become tokens (a boolean and a non-font string). The old build skipped them without a word; the golden is what it wrote, and the test reproduces the same bytes once the owner answers "exclude". |
| `ds-mixed/` | `tests/fixtures/figma-ds/ds-mixed.json` | Icons and screens classified out of the registry; no page field. |
| `control-single-collection-single-page/` | `tests/fixtures/owner-rulings/control-single-collection-single-page.json` | One collection, one page: nothing to ask. |

Each folder holds `tokens.json`, `component-registry.json` and `DESIGN.md` exactly as the old build wrote them. The new
build must write `tokens.json` and `component-registry.json` byte for byte, and `DESIGN.md` as the golden followed by
its closing ledger section. Every name in these files is invented.
