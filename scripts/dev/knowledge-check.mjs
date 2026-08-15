#!/usr/bin/env node
/**
 * Thin wrapper so the knowledge-core self-check can be invoked without naming the build
 * output path directly. Mirrors what CI runs.
 */
import { run } from "../../dist/cli.js";

const args = process.argv.slice(2);
const code = await run(["knowledge", ...(args.length > 0 ? args : ["check"])]);
process.exit(typeof code === "number" ? code : 0);
