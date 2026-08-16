#!/usr/bin/env node
/**
 * Local passthrough to the built `ui` kernel, so any subcommand can be run during
 * development without depending on a global install.
 *
 *   node scripts/dev/ui.mjs taste-lint site/examples/index.html
 */
import { run } from "../../dist/cli.js";

const code = await run(process.argv.slice(2));
process.exit(typeof code === "number" ? code : 0);
