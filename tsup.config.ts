import { defineConfig } from "tsup";

// Bundles the `ui` binary. The shebang is injected here (not in source) so the
// build output has exactly one, and `src/cli.ts` stays plain TypeScript.
export default defineConfig({
  // `cli` is the `ui` binary; `lint` is the public `ease-design/lint` library entry
  // (the shebang banner below applies to every entry, but a library import ignores a
  // leading shebang line, so it is harmless on `lint`).
  entry: { cli: "src/cli.ts", lint: "src/lint.ts" },
  format: ["esm"],
  target: "node20",
  // No `dts` yet: enabling it trips the repo's pre-existing `baseUrl` deprecation
  // (TS5101) through tsup's stricter dts pass. The sole current consumer imports the
  // linters untyped by design, so ship the runtime now and add types in a follow-up
  // once the tsconfig deprecation is addressed on its own.
  // Bundle the runtime dependencies INTO the artifact.
  //
  // tsup externalises `dependencies` by default, which quietly broke the
  // property this repo is built on: `ui` is a single relocatable binary. Copy
  // dist/ anywhere without node_modules beside it and the externalised imports
  // fail at load — `ERR_MODULE_NOT_FOUND: htmlparser2`, before any command runs.
  // The four cascade-engine packages are pure JS with no native bindings, so
  // bundling them costs only bundle size.
  noExternal: ["htmlparser2", "css-tree", "css-tree/parser", "css-tree/walker", "css-tree/generator", "css-select", "domutils"],
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
