/**
 * `ui ontology` — the design ontology of a project: one knowledge graph, emitted from what onboarding already produced
 * and never hand-edited. `build` writes it (and asks the owner about a `defines` link instead of guessing one); `lint`
 * checks it against the sources, by re-emit and compare.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { runOntologyBuild } from "./ontology-build.js";
import { runOntologyLint } from "./ontology-lint.js";

const CMD = "ontology";
const SUBCOMMANDS = ["build", "lint"] as const;

export const ONTOLOGY_HELP = `ui ontology — the design ontology of a project (design-os-ontology/1)

Usage:
  ui ontology build [--dir <project>] [--out <file>] [--json]
  ui ontology lint  [--dir <project>] [--file <file>] [--strict] [--json]

build   Reads the sealed token store and component registry, the Figma scan (design/ds.json) or the code surface for
        screens, the ratified soul, promoted rules, measured conventions (design/conventions.json) and the optional
        ring-2 files (design/knowledge/rulings.json, design/principles.json, CONTEXT.md terms, design/patterns/*.md,
        design/knowledge/screens.meta.json), and writes design/knowledge/ontology.json: nodes and links, no timestamp.
        A link is exact or it is asked: a name that matches nothing is counted unresolved, a field the host never
        sensed is counted not sensed, and a glossary term named like a node raises one inferred-links question.
        An open question blocks the write (exit 1, nothing written but the pending question list); the summary of what
        would be written is still shown. Missing sources are reported, never an error.
lint    Fails on a link to a node that does not exist, a duplicate node id, a stale file (a fresh emit differs from the
        file) and a CONVENTIONS.md that differs from a render of design/conventions.json. Orphans (a node with no link
        that is not standalone) are warnings; --strict makes them errors. Always prints the coverage table and the link
        reports (written, unresolved, not sensed, not checked, owner-ruled pairs no candidate matches; --json: linkReports).
        Never writes and never raises a question. An open question the build depends on is an error naming ui onboard questions.

Options:
  --dir <project>   Project directory (default: current working directory)
  --out <file>      build: output file, inside the project (default: design/knowledge/ontology.json)
  --file <file>     lint: the file to check, inside the project (default: design/knowledge/ontology.json)
  --strict          lint: orphans are errors
  --json            Emit a JSON envelope instead of text
  -h, --help        Show this help

Error codes:
  BAD_ARG                              A flag needs a value, or --out/--file names a path outside the project
  UNKNOWN_FLAG                         Unrecognised --flag (rejected, with a did-you-mean hint)
  READ_ERROR                           The project directory cannot be read
  WRITE_ERROR                          The ontology file could not be written
  BAD_MANIFEST                         design/design-dir.json cannot be read
  BAD_PENDING                          .design-os/onboard/pending.json is malformed
  DS_TAMPERED                          The sealed store drifted from its seal: reseal it, the build never reads it as is
  ONTOLOGY_BAD_SOURCE                  A source file exists and cannot be read as what it claims to be
  ONBOARD_BLOCKED_NEEDS_OWNER_RULING   build: an open question blocks the write; lint: it blocks a fresh emit
  ONTOLOGY_STALE                       lint: a fresh emit from the current sources differs from the file on disk
  ONTOLOGY_DANGLING_LINK               lint: a link's target does not exist
  ONTOLOGY_DUPLICATE_ID                lint: a node id appears more than once
  CONVENTIONS_PAIR_DRIFT               lint: CONVENTIONS.md and design/conventions.json differ
`;

export const ontologyCommand = {
  name: CMD,
  summary: "Build and lint the design ontology (nodes and exact links) of a project",
  hasSubcommands: true,
  help: ONTOLOGY_HELP,

  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "build": return runOntologyBuild(parsed);
      case "lint": return runOntologyLint(parsed);
      default: {
        const msg = `unknown subcommand '${parsed.subcommand ?? ""}'. Subcommands: ${SUBCOMMANDS.join(", ")}. Run 'ui ontology --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
