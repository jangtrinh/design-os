import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // tests/fixtures/** is fixture DATA plus the scripts a fixture ships with —
    // vendored trees this repo runs but does not author. spec-022-prereg's
    // validator is plain Node .mjs written to its own conventions, so linting it
    // to this repo's TS rules reports 43 problems about a file we must not edit.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "tests/fixtures/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
