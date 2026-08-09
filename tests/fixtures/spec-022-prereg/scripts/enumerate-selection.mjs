#!/usr/bin/env node
/**
 * enumerate-selection.mjs — spec 022 (architecture §C)
 *
 * Deterministic enumeration of every upstream SKILL.md at the pinned corpus commit
 * (21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49), read from the commit OBJECT — never
 * the working tree — so the list is tamper-proof against local edits. Emits record
 * skeletons ({path, sha256}) in enumeration order to stdout, ready for the builder
 * to fill in classification/disposition/reason per architecture §C.
 *
 * Fails loudly (non-zero exit) if the count is not exactly 121 or any blob is
 * unreadable. NEVER substitutes a working-tree file for a missing blob — a missing
 * blob is a fatal error, not a fallback.
 *
 * Usage: node enumerate-selection.mjs --corpus <path-to-corpus-clone>
 */
import { lsTreeSkillPaths, catFileBlob } from "./lib/git.mjs";
import { sha256Hex } from "./lib/hash.mjs";
import { PINNED_COMMIT } from "./lib/constants.mjs";

const EXPECTED_COUNT = 121;

function parseArgs(argv) {
  const args = { corpus: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--corpus") args.corpus = argv[++i];
  }
  return args;
}

function main() {
  const { corpus } = parseArgs(process.argv.slice(2));
  if (!corpus) {
    process.stderr.write("usage: node enumerate-selection.mjs --corpus <path>\n");
    process.exit(2);
    return;
  }

  let paths;
  try {
    paths = lsTreeSkillPaths(corpus, PINNED_COMMIT);
  } catch (err) {
    process.stderr.write(`FATAL: could not read commit ${PINNED_COMMIT} from ${corpus}: ${err.message}\n`);
    process.exit(1);
    return;
  }

  if (paths.length !== EXPECTED_COUNT) {
    process.stderr.write(
      `FATAL: enumerated ${paths.length} SKILL.md paths, expected exactly ${EXPECTED_COUNT}. Refusing to emit a partial/wrong set.\n`
    );
    process.exit(1);
    return;
  }

  const records = [];
  for (const path of paths) {
    let blob;
    try {
      blob = catFileBlob(corpus, PINNED_COMMIT, path);
    } catch (err) {
      process.stderr.write(`FATAL: unreadable blob ${PINNED_COMMIT}:${path}: ${err.message}\n`);
      process.exit(1);
      return;
    }
    records.push({ path, sha256: sha256Hex(blob) });
  }

  process.stdout.write(JSON.stringify(records) + "\n");
}

main();
