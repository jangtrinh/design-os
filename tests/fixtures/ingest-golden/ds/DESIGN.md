# golden — Design System

Ingested from an existing Figma design system via `ui ingest-figma-ds`.
This is the portable, AI-readable spec — tokens compile with `ui tokens compile`,
components load with `ui registry list --file component-registry.json`.

- **Source:** figma scan-design-system (ds.json)
- **Inventory:** 12 variables · 3 components · 5 styles

## Tokens

Two tiers (see knowledge/token-taxonomy.md): **primitives** are literal values;
**semantic** tokens alias a primitive and are what UI should consume.

### Primitives

| Token | Type | Value (· mode overrides) |
|---|---|---|
| `blue.400` | color | #60A5FA |
| `blue.500` | color | #3B82F6 |
| `font-family.sans` | fontFamily | Inter |
| `font-weight.bold` | fontWeight | 700 |
| `gray.50` | color | #F9FAFB |
| `gray.900` | color | #111827 |
| `space.4` | dimension | 16px |

### Semantic tokens

| Token | Type | Value (· mode overrides) |
|---|---|---|
| `color.primary` | color | {blue.500} · dark: {blue.400} |
| `color.text-body` | color | {gray.900} · dark: {gray.50} |
| `space.section` | dimension | {space.4} |

## Components

| Name | Category | Variants / props |
|---|---|---|
| `Badge` | COMPONENT | — |
| `Button` | COMPONENT_SET | Size=Large, Size=Small, Tone=Ghost, Tone=Primary |
| `Card/Elevated` | Card | State=Default, State=Hover |

_Resolve components by their exact name (ids renumber on sync)._

## Styles

### Text styles

- `Body/Regular`
- `Heading/H1`

### Effect styles

- `Shadow/Card`
- `Shadow/Overlay`

### Paint styles

- `Brand/Primary`

