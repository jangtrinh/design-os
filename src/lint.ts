// Public `ease-design/lint` subpath — the HTML/content linters exposed as a stable
// library API so downstream consumers (e.g. the Figma-plugin panel gate) can import
// them from the published package instead of vendoring the kernel by path/submodule.
//
// Surface = the content-page linter family: layout, accessibility, taste, the
// content-copy checks, and design-system-usage. Each module namespaces its own
// Severity/Finding/Result types, so a flat re-export is collision-free. The `ui`
// binary is unaffected — this is an additive second entry point, not a CLI change.
export * from "./core/layout-lint.js";
export * from "./core/a11y-lint.js";
export * from "./core/taste-lint.js";
export * from "./core/content-checks.js";
export * from "./core/gate.js";
export * from "./core/ds-usage-lint.js";
