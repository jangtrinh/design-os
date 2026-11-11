# Sources of the ds-import regression fixture

Synthetic. `flat-clean.tokens.json` is an invented flat token file with unambiguous roles and tokens that all type
cleanly (one alias that resolves inside the file); no project data, client name or private content is in it.

`golden/*` is the output of `ui ds import flat-clean.tokens.json --name regression` captured by the import command as it
was before it learned to ask (the base of spec 033 phase P3). Only the scratch directory and instants are normalised.
The regression test requires the import of a file with nothing to ask to stay byte-identical to these files.
Regenerate only deliberately: `UPDATE_GOLDEN=1 npx vitest run tests/ds-import-sealed-regression.test.ts`.
