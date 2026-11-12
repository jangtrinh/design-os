/**
 * `ui ontology` — the design ontology of a project: one knowledge graph, emitted from what onboarding already produced
 * and never hand-edited. `build` writes it (and asks the owner about a `defines` link instead of guessing one); `lint`
 * checks it against the sources, by re-emit and compare; `query` packs what it knows about a task.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { runOntologyBuild } from "./ontology-build.js";
import { runOntologyLint } from "./ontology-lint.js";
import { runOntologyQuery } from "./ontology-query.js";

const CMD = "ontology";
const SUBCOMMANDS = ["build", "lint", "query"] as const;

export const ONTOLOGY_HELP = `ui ontology — the design ontology of a project (design-os-ontology/1)

Usage:
  ui ontology build [--dir <project>] [--out <file>] [--json]
  ui ontology lint  [--dir <project>] [--file <file>] [--strict] [--json]
  ui ontology query "<text>" [--area <name>] [--budget <chars>] [--dir <project>] [--json]

build   Reads the sealed token store and component registry, the Figma scan (design/ds.json) or the code surface for
        screens, the ratified soul, promoted rules, measured conventions (design/conventions.json) and the optional
        ring-2 files (design/knowledge/rulings.json, design/principles.json, CONTEXT.md terms, design/patterns/*.md,
        design/knowledge/screens.meta.json), and writes design/knowledge/ontology.json: nodes and links, no timestamp.
        A link is exact or it is asked: a name that matches nothing is counted unresolved, a field the host never
        sensed is counted not sensed, and a glossary term named like a node raises one inferred-links question.
        The build refuses, writing nothing (exit 1), when the graph does not hold together (ONTOLOGY_DUPLICATE_ID,
        ONTOLOGY_DANGLING_LINK), when design/conventions.json and CONVENTIONS.md differ (CONVENTIONS_PAIR_DRIFT) or when a
        source cannot be read (ONTOLOGY_BAD_SOURCE). An open question blocks the write too (exit 1, nothing written but
        the pending question list); the summary of what would be written is still shown. Missing sources are reported,
        never an error.
lint    Judges the build it would run now, and the file on disk when there is one. Fails on a link to a node that does
        not exist, a duplicate node id, a stale file (a fresh emit differs from the file) and a CONVENTIONS.md that
        differs from a render of design/conventions.json; a refusal the build would give is reported by its own code, and
        no line promises that ui ontology build cures what it would refuse. Orphans (a node with no link that is not
        standalone) are warnings (ONTOLOGY_ORPHAN); --strict makes them errors. Orphans no question covers are warnings
        too (ONTOLOGY_ORPHAN_UNASKED). Always prints the coverage table and the link reports (written, unresolved, not
        sensed, not checked, owner-ruled pairs no candidate matches; --json: linkReports). Never writes and never raises
        a question. An open question the build depends on is an error that names its next action: ui onboard questions
        --format claude when it lists the question, ui ontology build for the questions only the build raises.
query   Finds what the ontology knows about a task: the nodes whose name or aliases hold the most distinct words of the
        text (ties by node id), then the nodes within two links of them, packed in one fixed order (rules, patterns,
        components, tokens, rulings that are not superseded, sibling screens), each entry naming its node id and the
        project-relative file to open. A rule that constrains the whole project reaches every match. Reads only
        design/knowledge/ontology.json, and only while it equals what a build from the current sources writes: a stale
        or missing file is refused (ONTOLOGY_STALE, with the one action that works), never queried and never rebuilt.
        Writes nothing. A text that matches nothing exits 0 with "matches: 0" and the three nearest titles, no pack.
        An area is the grouping the build wrote on a node: page:<page>, dir:<directory>, tokens:<group>, rulings:<category>.
        --area takes the full key or the name after its prefix, exactly: a name two areas share is refused
        (ONTOLOGY_AREA_AMBIGUOUS, the full keys listed), a name no area has is refused (ONTOLOGY_AREA_UNKNOWN, the three
        nearest keys listed). --budget bounds the pack text in characters (default 12000): whole entries are cut from the
        end of the order, and the output says how many entries of each group were left out.

Options:
  --dir <project>   Project directory (default: current working directory)
  --out <file>      build: output file, inside the project (default: design/knowledge/ontology.json)
  --file <file>     lint: the file to check, inside the project (default: design/knowledge/ontology.json)
  --strict          lint: orphans are errors
  --area <name>     query: only the nodes of this area (a full key such as page:Buttons, or the name after the prefix)
  --budget <chars>  query: the most characters the pack may hold (default 12000)
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
  ONTOLOGY_BAD_SOURCE                  A source file exists and cannot be read as what it claims to be (build refuses)
  ONBOARD_BLOCKED_NEEDS_OWNER_RULING   build: an open question blocks the write; lint: it blocks a fresh emit
  ONTOLOGY_STALE                       lint: a fresh emit from the current sources differs from the file on disk; query: the file is not current, so it is not queried
  ONTOLOGY_AREA_AMBIGUOUS              query: --area names more than one area
  ONTOLOGY_AREA_UNKNOWN                query: --area names no area
  ONTOLOGY_DANGLING_LINK               build refuses and lint reports: a link's target does not exist
  ONTOLOGY_DUPLICATE_ID                build refuses and lint reports: a node id appears more than once
  CONVENTIONS_PAIR_DRIFT               build refuses and lint reports: CONVENTIONS.md and design/conventions.json differ
  ONTOLOGY_ORPHAN                      lint warning (error under --strict): a node with no link that is not standalone
  ONTOLOGY_ORPHAN_UNASKED              lint warning: orphans no question covers
`;

export const ontologyCommand = {
  name: CMD,
  summary: "Build, lint and query the design ontology (nodes and exact links) of a project",
  hasSubcommands: true,
  help: ONTOLOGY_HELP,

  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "build": return runOntologyBuild(parsed);
      case "lint": return runOntologyLint(parsed);
      case "query": return runOntologyQuery(parsed);
      default: {
        const msg = `unknown subcommand '${parsed.subcommand ?? ""}'. Subcommands: ${SUBCOMMANDS.join(", ")}. Run 'ui ontology --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
