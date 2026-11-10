# golden — Design System

Ingested from an existing Figma design system via `ui ingest-figma-ds`.
This is the portable, AI-readable spec — tokens compile with `ui tokens compile`,
components load with `ui registry list --file component-registry.json`.

- **Source:** figma scan-design-system (ds-mixed.json)
- **Inventory:** 1 variables · 2 components · 4 icons · 2 screens · 1 styles

## Tokens

Two tiers (see knowledge/token-taxonomy.md): **primitives** are literal values;
**semantic** tokens alias a primitive and are what UI should consume.

### Primitives

| Token | Type | Value (· mode overrides) |
|---|---|---|
| `blue.500` | color | #3B82F6 |

## Components

| Name | Category | Variants / props |
|---|---|---|
| `Button` | COMPONENT_SET | Size=Large, Size=Small |
| `Card` | COMPONENT | — |

_Resolve components by their exact name (ids renumber on sync)._

## Icons

_4 icons (icon-set) — represented in bulk, not as individual components._

Sample: `Icon`, `Icon / Search`, `Icon / X`, `lucide-menu`

## Screens

_2 screen-frames — full designs, NOT design-system components (excluded from the registry)._

- `01 · Foo`
- `10 · Bar`

## Styles

### Text styles

- `Heading/H1`

