# Sources of the ds-surface fixtures

Every file here is synthetic. No project data, client name, path or file content from any real project is included; the
names (`Button`, `Card`, `Badge`, `Tabs`, `Panel`, `Avatar`) are generic labels. What is reproduced is the **shape**
measured on a real application whose design system lives inside the application (Spec 033, section 1.2): two component
directories that export one shared name, components that reference tokens through custom properties, one that composes
its classes through a helper, pages and stories that import components, a component without a story.

| Path | Reproduces | What the test asserts |
|---|---|---|
| `embedded-app/package.json`, `embedded-app/tokens.json` | A React application that depends on Tailwind v4, and the flat token file a project would import (`ui ds import tokens.json` seals the store the surface reads) | 4 tokens; `--color-primary` is `color.primary` |
| `embedded-app/src/components/ui/` | The first component directory: `Button` (named export, three custom-property references: two resolve to a token, `--color-missing` resolves to none), `Card` (default export, classes `bg-surface text-ink`), `Badge` (arrow-function export; its classes are composed through `cn()`; its props type states `tone` as a union of two literals), `Tabs` (its look is chosen through an object, which no pattern reads exactly) | tokens and `unresolvedStyles` of each component |
| `embedded-app/src/components/kit/` | The second component directory: `Button` (the shared name), `Panel`, `Avatar` (no story) | 1 collision: `Button` in two directories |
| `embedded-app/src/pages/home.tsx`, `pricing.tsx` | Two page files; `home` imports by relative path, `pricing` by the `@/` alias | `screens`: home imports Button, Card, Panel; pricing imports Card |
| `embedded-app/src/components/**/*.stories.tsx` | Three story files: one imports one component, one imports two, one imports one from the second directory | `stories`; `unstoried` holds the components no story imports |
| `embedded-app/src/lib/cn.ts` | The class-composing helper | not a component |

The wide, two-app and workspace shapes used by the app-default and budget tests are generated at test time
(`tests/ds-surface-helpers.ts`), so no thousands of files are committed.
