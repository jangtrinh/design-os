/** The help text of `ui ingest-figma-ds`. */
export const INGEST_FIGMA_DS_HELP = `ui ingest-figma-ds — onboard an existing Figma design system

Usage:
  ui ingest-figma-ds <ds.json> [--out <dir>] [--name <slug>] [--cwd <dir>] [--seed-memory] [--now <iso>] [--json]

Takes a 'figma-agent scan-design-system' output (Variables + Styles + Components)
and compiles it — deterministically, zero-network, zero-LLM — into ease-design's
portable stores so an AI can understand, remember, and work on the DS on any runtime.

It asks instead of dropping or guessing. When the scan holds something only the owner can settle (two
collections that map to one token path, nodes on several pages, archive-marked or duplicate names, variables that
cannot become tokens), the command writes NOTHING, exits 1 with ONBOARD_BLOCKED_NEEDS_OWNER_RULING, and leaves the
questions in <cwd>/.design-os/onboard/pending.json. Next: ui onboard questions, then ui onboard answer --file, then
run this command again. Every item left out is counted under a named reason in the closing ledger.

Writes (into <out>, default: current directory):
  tokens.json             DTCG tokens — primitive literals + semantic aliases; Light/Dark modes
  component-registry.json component inventory (name, variants, props)
  DESIGN.md               the human+AI-readable design-system spec
  design/memory.events.jsonl  only with --seed-memory (records the DS as remembered)

Options:
  --out <dir>      Output directory (default: current working directory)
  --name <slug>    Design-system name for DESIGN.md (default: the --out folder name)
  --cwd <dir>      The project whose owner rulings apply (default: current working directory)
  --seed-memory    Also seed 'ui memory' (harvested + component_registered events)
  --now <iso>      Deterministic clock for the seeded memory graph (ISO-8601)
  --json           Emit a JSON envelope instead of human-readable text
  -h, --help       Show this help

Modes:
  A variable's base/Light mode becomes its $value; other modes (e.g. Dark) are
  preserved under $extensions and documented — 'ui tokens compile' stays valid.

Error codes:
  BAD_ARG          Missing <ds.json> positional, invalid --now, or a --cwd that is not an existing directory
  UNKNOWN_FLAG     Unrecognised --flag (rejected, with a did-you-mean hint)
  ONBOARD_BLOCKED_NEEDS_OWNER_RULING  A question has no owner ruling; nothing was written
  BAD_PENDING      <cwd>/.design-os/onboard/pending.json is unreadable (transient; safe to delete)
  BAD_MANIFEST     <cwd>/design/design-dir.json is unreadable
  FILE_NOT_FOUND   ds.json does not exist (ENOENT)
  READ_ERROR       ds.json exists but cannot be read
  BAD_JSON         ds.json is not valid JSON
  BAD_DS           ds.json is not a scan-design-system output (missing components/tokens/styles)
  SEALED_PATH_COLLISION  --out resolves to a directory named 'design' — the sealed DS path
  MEMORY_LOCKED    Memory append lock is held; wait for its writer to release it
  MEMORY_COMMITTED  Memory seed events committed before a later failure; do not repeat seeding
  WRITE_ERROR      An output file could not be written
`;
