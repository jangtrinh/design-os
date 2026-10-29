/**
 * `ui ds` dispatcher — routes ds subcommands to their implementations.
 */
import { errJson, errText } from "../core/output.js";
import { runKit } from "./ds-kit-impl.js";
import { runInit } from "./ds-init-impl.js";
import { runContext } from "./ds-context-impl.js";
import { runDiff } from "./ds-diff-impl.js";
import { runDocs } from "./ds-docs-impl.js";
import { runA11y } from "./ds-a11y-impl.js";
import { runChangeToken } from "./ds-change-token-impl.js";
import { runSetRole } from "./ds-set-role-impl.js";
import { runStatus } from "./ds-status-impl.js";
import { runImport } from "./ds-import-impl.js";
import { runSpecimen } from "./ds-specimen-impl.js";
import { runPreview } from "./ds-preview-impl.js";
import { runSoul } from "./ds-soul-impl.js";
import { runGuidelines } from "./ds-guidelines-impl.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds";

export const DS_HELP = `ui ds — Design System SSOT (compile + enforce)

Usage:
  ui ds kit plan|theme|prepare|validate|adopt|verify [options]
  ui ds init <name> --persona <slug> --intent "<text>" [options]
  ui ds context [--strict] [--with-theme] [--format markdown|json] [options]
  ui ds change-token <path> --value <v> [options]
  ui ds set-role <token.path> <role> [--dir <project>] [--json]
  ui ds status   [--dir <project-dir>] [--json]
  ui ds diff <base-dir> <head-dir> [--format markdown|json|pr-comment] [--base-version <v>]
  ui ds docs [--dir <project>] [--out <file>] [--format markdown|json]
  ui ds a11y [--dir <project>] [--pairs "text:surface,..."] [--json]
  ui ds preview [--dir <project>] [--out <file>] [--split <dir>] [--json]
  ui ds soul init  [--dir <project>] [--force] [--studio]
  ui ds soul check [--dir <project>] [--json] [--studio]
  ui ds guidelines build|check [--dir <project>] [--out <pack-dir>] [--rulings <file>] [--allow-unsealed] [--now <UTC-ISO>] [--json]
  ui ds guidelines export --target figma [--dir <project>] [--pack <pack-dir>] [--out <dir>] [--budget <n>kb] [--allow-unsealed] [--json]
  ui ds guidelines check --profile figma --bundle <figma-guidelines dir> [--json]

Subcommands:
  kit            Stage owner captures, emit approved theme CSS, validate, adopt and verify a kit
  init           Compile a project-scoped design system from a persona + intent
  import         Onboard an EXISTING flat tokens.json → the DTCG store (so ds a11y/status/diff work)
  context        Emit the active design system as a context block for the host model
  change-token   Update one token's $value (only sanctioned mutation post-init)
  set-role       Set/correct one token's recognized role — the owner-edit path for
                 recognition (spec 011 P2); 'ds context' reads this, never recomputes it
  status         Show the manifest summary (generation, persona, hashes)
  diff           Compare two DS states (dirs with design.tokens.json) → semver + visual-breaking classification
  docs           Regenerate component reference docs from the registry (decay-proof)
  a11y           Token-pair contrast audit (text×surface ≥ AA, incl. hover/active state pairs); exit 1 on a fail. Declared tokens only — not a conformance claim.
  specimen       Report each component's variant×state matrix + applicable-state gaps (missing disabled/empty)
  preview        Generate a self-contained specimen.html from the compiled tokens + registry
  soul           Scaffold + structure-lint the declared design stance (design/soul.md)
  guidelines     Compile the sealed design system into a guidelines pack (design/guidelines/) + lint it

'ds kit' operations:
  plan --source <file> --kind figma|registry --tokens <file> --out <absent-dir> --name <display-name>
  theme <candidate-root> [--json]    Read-only; JSON {path,css}, text CSS on stdout
  prepare <candidate-root> [--json]  Read-only structure/hash/findings
  validate <candidate-root> [--json] Read-only complete evidence validation and lock summary
  adopt <candidate-root> --out <absent-dir> [--now <UTC-ISO>] [--json]
  verify [--dir <project>] [--json]  Integrity and verified/stale readiness
  Host writes the returned theme CSS into the candidate's declared theme path.

'ds a11y' options:
  --dir <path>       Project directory holding design/ (default: cwd)
  --pairs "t:s,..."  Pin explicit text:surface token pairs (skips name-role inference)

'ds docs' options:
  --dir <path>       Project directory holding design/ (default: cwd)
  --out <file>       Write the docs to a file instead of stdout
  --format <f>       markdown (default) | json

'ds diff' options:
  --format <f>       markdown (default) | json | pr-comment
  --base-version <v> Base semver (x.y.z) to compute the recommended next version from
  --color-tolerance <n>  OKLab ΔE below which a colour change is a patch (default 0.02)
  --dim-tolerance <n>    Dimension % change below which it is a patch (default 5)

'ds init' options:
  --persona <slug>   Persona slug from personas.json (required)
  --intent "<text>"  Plain-language design intent, max 512 chars (required)
  --brand-hex <hex>  Brand seed color (#RRGGBB)
  --force            Overwrite an existing DS (preserves changelog history)
  --bare             Skip the default component kit (start with an empty registry)
  --persona-data <f> Override the personas.json path (test support)
  --dir <path>       Override the project directory

'ds import' options:
  --dir <path>       Project directory to write design/ into (default: cwd)
  --name <name>      DS name for the sealed manifest (default: imported-ds)
  --force            Overwrite an existing design.tokens.json
  --reset-registry   Confirm --force may wipe a non-empty registry (required alongside
                     --force when component-registry.json already has components —
                     REGISTRY_NOT_EMPTY otherwise)
  Converts a flat { category: { name: value } } token file into DTCG, inferring
  $type per value (color/dimension/number/fontFamily/fontWeight/duration). Nested
  groups are hoisted to <cat>-<sub>. Un-typeable values (box-shadow strings,
  bezier easings) are SKIPPED and reported — never emitted with a bad type.
  Also BAKES role recognition into every $type:color token before sealing
  (spec 011 P2): each recognized token gets $extensions["design-os.role"],
  lossless (never renames/drops/injects). Output reports "N roles recognized,
  M gaps: <role list>" — the gaps are reported, never auto-injected. Correct a
  mis-recognition afterwards with 'ui ds set-role'.

'ds specimen' options:
  --dir <path>       Project directory holding design/ (default: cwd)
  --strict           Exit 1 if any completeness gap is found (default: informational, exit 0)
  Reads component-registry.json and reports each component's variant dimensions + declared
  states. Flags only reliably-modelled gaps: missing 'disabled' on an interactive control,
  missing 'empty' on a data-family component. 'focus' is intentionally NOT required (it is
  usually a runtime :focus-visible, not a Figma variant, so requiring it would over-fire).

'ds preview' options:
  --dir <path>       Project directory holding design/ (default: cwd, else discovered)
  --out <file>       Output HTML path (default: <project>/design/preview/specimen.html)
  --split <dir>      Emit one self-contained page per component into <dir> (+ a deterministic
                     index.json), instead of one whole-DS specimen. One page per registry
                     record with markup; each reuses the specimen chrome + :root tokens.
  Renders the compiled design system as ONE self-contained page: :root tokens, colour
  paired roles (each swatch renders its own declared foreground), the type ramp,
  radius/elevation/duration chips, and one block per registered component (markup comes
  from the registry — the only component source). Deterministic: same DS → byte-identical.

'ds guidelines' options:
  build              Write overview.md, vocabulary.md, components.md + guidelines.manifest.json
  check              Lint a built pack; exit 1 on any error finding
  --dir <path>       Project directory holding design/ (default: discovered from cwd)
  --out <dir>        build/check: pack directory (default: <project>/design/guidelines); export: destination
                     folder (default: <project>/design/figma-export)
  export             Write the Figma bundle: <out>/figma-guidelines/ (3-8 files, .md/.txt/.json, at most 200 KB,
                     warning above 100 KB) and <out>/UPLOAD.md BESIDE it (never inside). The pack must pass
                     check and carry no open slot: OPEN_QUESTIONS (n) otherwise (a partial answer is open).
                     components.md keeps the look-alike names (with answers) and the component rulings, not the
                     component inventory; apps/*.md merge into apps.md with one '## <app> (<n>)' heading each;
                     generated-block markers are stripped. Only files the manifest lists are used.
  --target figma     export: the only supported target (upload to Figma stays manual during its beta).
  --pack <dir>       export: the pack directory to read (default: <project>/design/guidelines).
  --budget <n>kb     export: trim to n KB (n <= 200) in priority order (grammar, terminology, overview stance,
                     apps - largest app first, oldest ruling first -, then rulings oldest first; anti-patterns,
                     vocabulary and components are never trimmed). Every drop is reported with its ids.
                     Without --budget nothing is trimmed; over the 200 KB cap export fails: BUDGET_EXCEEDED.
  --profile figma    check: with --bundle <dir>, validate an exported bundle (file count, extensions, byte caps,
                     open slots) instead of a pack. Needs no design system.
  --rulings <file>   Owner rulings file (default: <project>/design/knowledge/rulings.json). Absent file
                     = rulings omitted and recorded under skippedSources; malformed = BAD_RULINGS.
                     Tier A (global, in the 8 design categories shell-chrome, component-reuse,
                     screen-composition, tables, forms-inputs, status-vocabulary, naming-language,
                     section-layout) -> rulings.md; any other global ruling -> rulings.md under
                     'Other library-wide rulings' (manifest tierAOther); tier B (scope.apps) -> apps/<app>.md;
                     process categories (figma-scripting, workflow-process, delivery-gates) and
                     rulings whose text STARTS with '(SUPERSEDED …)' (any shape, any case; the word elsewhere is a mention) are never emitted,
                     only counted under 'rulings' in the manifest. 'check' also reads it for superseded ids.
  --allow-unsealed   Proceed when the store no longer matches its sealed hashes (default: refused as
                     DS_TAMPERED). Only hash drift is tolerated: unreadable files or a broken kit still fail.
                     The manifest records seal: { status: "unverified", drifted: [{file, expected, actual}] }
                     ("verified" otherwise); 'check' reports each drifted file as a SEAL_UNVERIFIED warning.
  --now <ISO>        'build' only: clock written to the manifest (default: current time).
                     The same store + the same --now give byte-identical output.
  Names are written as explicit spans: \`token:color.primary\`, \`component:Button/Primary\`,
  \`term:Space\`. 'check' reads only those spans: a token/component span that is not in the
  sealed design system is UNKNOWN_NAME (file:line); a term: span is counted, not judged,
  until a glossary exists. Facts sit inside <!-- ds-guidelines:generated id=<id> sha=<12 hex> -->
  blocks; editing one is GENERATED_BLOCK_TAMPERED — rebuild instead. Open slots are
  '> QUESTION(<id>): ...' lines outside those blocks, for the host model to answer.
  'check' also fails: SUPERSEDED_CITED (text outside generated blocks cites a superseded ruling id),
  DUPLICATE_RULE (the same rule text in two files; per-app files may repeat a multi-app ruling),
  PACK_INCOMPLETE (a file or generated block recorded in the manifest is missing, or the manifest is).
  Other optional inputs, all read from the project: CONTEXT.md + ontology/glossary.yaml -> terminology.md
  (CONTEXT.md wins on a clash, every clash is listed under 'terminology' in the manifest; a glossary that
  is not the flat 'terms: - term/vi/def/avoid' shape is skipped with its line and cause, e.g. 'line 48: ...',
  in the manifest and in 'check'; the run goes on);
  CONVENTIONS.md -> grammar.md (DO/DON'T lines copied verbatim, never re-derived; absent = 'not measured yet');
  design/soul.md -> a capped stance summary in overview.md. With a glossary, 'check' judges term: spans
  (UNKNOWN_NAME) and rejects a slot answer (a **Do:** / **Don't:** / **Why:** line) that uses an _Avoid_ word.
  anti-patterns.md holds scenario slots seeded from evidence (rulings saying never/always/do not, CONVENTIONS.md
  DON'T lines, persona anti-patterns, gaps that need a decision) and the measured gaps themselves. Slot ids come
  from the evidence (<kind>-<readable prefix>-<hash of the full raw evidence>, never a counter), so a rebuild
  keeps each answer attached: identical evidence is ONE slot listing every line it came from.
  Answers live in guidelines.answers.json (written by 'build', never by hand unless you discard one):
  { version: 1, answers: { <slot id>: { lines, file } } }. Editing the .md is still how you answer. On every
  'build' the answers are harvested from the previous store and from EVERY .md in the pack folder (listed or
  not) and the parked-answers file, merged by slot id (the answer in the file the slot is in wins, then the
  stored one, then any other file in path order), and written to the store FIRST. Any different text that
  loses, and any answer whose slot is gone, is parked in guidelines.orphans.md once (never dropped; manifest
  orphanedAnswers); a gone slot's answer also stays in the store and returns with the slot. An answer
  deleted from a .md therefore comes back from the store: to discard one, delete it from the store (and the
  file). A malformed store is BAD_ANSWERS_STORE ('build' writes nothing, 'check' errors, export is refused).
  Knowledge (knowledge/*.md) is cited only as the answer to a measured gap, always
  with its gap id (gap.component.*, gap.role.*, gap.a11y.*). 'check' reports each unanswered slot as an
  OPEN_QUESTION warning, an answer missing Do/Don't/Why as SCENARIO_INCOMPLETE, a hand-written knowledge
  citation without a measured gap id as UNBOUND_KNOWLEDGE, and waiting orphans as ORPHANED_ANSWERS (warnings).
  Writes are staged: the answers store, then the parked answers, are written first (temp file + rename),
  every other file goes to a staging folder and is moved into place only when all are written, so a failure
  (WRITE_ERROR) never loses an answer. Export writes figma-guidelines/ and UPLOAD.md together or not at all:
  the previous bundle waits in <out>/.figma-guidelines.previous until the new one is in place, is put back on
  failure (the error says what state the output folder is in, checked, never assumed) and is never deleted
  when it cannot be put back. The store is never exported and 'ds context' ignores it. Ordering never depends
  on the machine's locale: the same inputs give the same bytes anywhere.
  Stale files: 'build' never deletes. A file in the pack folder that the build did not produce is listed in the
  manifest as staleFiles; 'check' warns STALE_FILE for it, does not lint it, and export ignores it.
  Optional inputs that are absent (no baked roles, no measurable colour pairs, no components)
  are listed under skippedSources in the manifest and never fail the build.

'ds change-token' options:
  --value <v>        New $value for the token (required)
  --reason "<text>"  Changelog note recorded with the mutation
  --dir <path>       Override the project directory

'ds set-role' options:
  <token.path>       Existing token path (e.g. color.surface-content) — BAD_TOKEN if unknown
  <role>             One of the canonical roles (background, foreground, card, popover,
                     primary, secondary, muted, accent, border, input, ring, destructive,
                     success, warning, info, neutral) — BAD_ROLE if not
  --dir <path>       Override the project directory
  The owner-edit path for recognition (decision 2: editable). Sets
  $extensions["design-os.role"] on the ONE named token and reseals (bumps
  generation, appends a changelog entry) — never renames the token, never
  touches any other token. 'ds context' reads exactly what this writes.

'ds context' options:
  --strict       Prepend the registered-components-only enforcement preamble
  --with-theme   Also emit the compiled Tailwind v4 @theme block (full token map,
                 immune to --max-bytes) — folds context + 'tokens compile' into one
                 read-only call. Markdown: appended as a fenced section; JSON: a
                 sibling 'theme' string field.
  --include <s>  Comma-separated sections: tokens,registry,naming,anti-patterns,soul (default: those five)
                 and the opt-in 'guidelines' (never in the default set)
  --format <f>   markdown (default) | json
  --max-bytes <n>  Truncate the context block to fit n bytes (default 4096)
  --dir <path>   Override the project directory
  The 'guidelines' section summarises the built guidelines pack (design/guidelines/): its file index, the
  anti-pattern scenario titles with their slot status (open/partial/answered) and the tier-A ruling ids and
  text. It bounds itself to --max-bytes: rulings are dropped from the tail first, then scenario titles, never
  the file index, and the block says what was dropped. No pack: the section is omitted, never an error; a
  pack whose manifest is unreadable gets a one-line note ('ds guidelines build|check' produce the pack).
  The 'soul' section emits design/soul.md (the declared stance, capped at 150
  lines) when that file exists, PLUS the studio-level soul from
  $EASE_DESIGN_HOME/studio-soul.md (the genealogy layer above every project
  soul — see 'ds soul --studio' below) when THAT file exists, rendered after
  the project section since the project always wins on conflict. Either,
  both, or neither may exist; a missing file just omits its section, never
  an error.
  The 'tokens' section also emits '## Roles' (role → your own token name,
  e.g. background → color.surface-content) and '## Missing roles' (the gap
  list, e.g. "card, popover (no token — add via 'ui ds change-token' in your
  own name)") — read from the BAKED $extensions["design-os.role"] annotation
  ('ds import' or 'ds set-role'), never recomputed, so a 'ds set-role'
  correction always sticks. A DS with no baked roles omits both, never an error.

'ds soul' options:
  init           Write the design/soul.md scaffold (status: draft)
  check          Structure-lint design/soul.md; exit 1 on error-severity findings
  --dir <path>   Project directory holding design/ (default: cwd)
  --force        'soul init' only: overwrite an existing soul.md
  --studio       Target $EASE_DESIGN_HOME/studio-soul.md instead — the
                 genealogy layer above every project soul (its 'name:'
                 frontmatter later names a studio's agents, e.g. name: MERIDIAN).
                 Conflicts with --dir (BAD_ARG: a studio is user-scoped, not
                 per-project).
  Checks (structure only — content taste stays a model judgment):
  soul-missing-section / soul-empty-section / soul-placeholder-copy   (errors)
  soul-draft-status / soul-scaffold-untouched / soul-too-long         (warnings)
  --studio also checks soul-missing-name (error) — a studio soul additionally
  needs frontmatter 'name:' set to something other than the placeholder.
  A missing file is the error finding 'soul-missing' (an explicit check expects
  a soul). Everywhere else the soul is OPTIONAL — absence is never an error.

Project layout (all under <project-dir>/design/):
  design.tokens.json       DTCG two-tier tokens
  component-registry.json  Canonical component records
  ds.manifest.json         DS seal: hashes, generation, changelog

Discovery:
  --dir <path>             Override the project directory
  (default)                Walks up from cwd (max 5 levels, stops at .git)

Immutability:
  Once 'ds init' compiles a DS, the tokens file is sealed by a SHA-256 hash in
  the manifest. Hand-editing the tokens file triggers DS_TAMPERED on the next
  command. Use 'ds change-token' to update a value (bumps generation, re-seals).

  Re-init with --force:
  'ds init --force' overwrites the existing artifacts but preserves the prior
  changelog history. New init entry is appended after all prior entries.
  The 'generation' field reflects the current compiled state only (resets to 1
  on --force). The 'changelog[]' array spans the manifest's full lifetime
  across all --force re-inits and grows without bound.

Common options:
  --json                   Emit a JSON envelope
  -h, --help               Show this help

Error codes:
  DS_NOT_FOUND       No manifest in cwd or parents
  DS_EXISTS          'ds init' against an existing manifest without --force
  DS_TAMPERED        Manifest hash != on-disk file hash
  BAD_MANIFEST       Manifest shape invalid
  BAD_NAME           Invalid <name> on 'ds init'
  BAD_INTENT         Invalid --intent
  BAD_BRAND_HEX      Invalid --brand-hex
  BAD_TOKEN          Compiled token set failed validation on 'ds init'
  PERSONA_NOT_FOUND  --persona slug not in personas.json
  TOKEN_NOT_FOUND    'change-token' on a non-existent path
  BAD_ROLE           'set-role' <role> is not one of the canonical roles
  UNKNOWN_FLAG       Unrecognised --flag
  BAD_ARG            Missing <tokens.json> on 'ds import'
  FILE_NOT_FOUND     'ds import' source file does not exist
  BAD_JSON           'ds import' source is not valid JSON / did not convert
  EXISTS             'ds import' target design.tokens.json exists (use --force)
  REGISTRY_NOT_EMPTY 'ds import --force' would wipe a non-empty registry (pass --reset-registry)
  EMPTY_IMPORT       'ds import' found no typeable tokens
  WRITE_ERROR        'ds import' could not write the DS store
  DS_NOT_FOUND       'ds specimen' found no component-registry.json
  BAD_VALUE          'change-token' --value fails type/format check
  ALIAS_CYCLE        New alias graph has a cycle
  DANGLING_ALIAS     New alias points to a missing token
  TYPE_MISMATCH      New alias crosses incompatible $type
  WRITE_ERROR        A design/ artifact could not be written
  BAD_ARG            Missing required flag, unknown subcommand, etc.
  UNKNOWN_FLAG       Unrecognised --flag (rejected, with a did-you-mean hint)
  FILE_NOT_FOUND     'ds diff' input dir has no design.tokens.json
  BAD_JSON           'ds diff' input file is not valid JSON / bad token shape
  READ_ERROR         'ds diff' input could not be read
  REGISTRY_NOT_FOUND 'ds docs' found no component-registry.json
  BAD_REGISTRY       'ds docs' registry file is malformed
  EXISTS             'ds soul init' target soul.md exists (use --force)
  WRITE_ERROR        'ds soul init' could not write the scaffold
  READ_ERROR         'ds soul check' could not read soul.md
  PACK_NOT_FOUND     'ds guidelines check' found no pack directory (run 'ds guidelines build')
  UNKNOWN_NAME       'ds guidelines check' finding: a token:/component: span names nothing in the DS
  GENERATED_BLOCK_TAMPERED  'ds guidelines check' finding: a generated block was edited or its markers damaged
  SUPERSEDED_CITED   'ds guidelines check' finding: host-written text cites a superseded ruling id
  DUPLICATE_RULE     'ds guidelines check' finding: the same rule text sits in two files
  AVOIDED_TERM       'ds guidelines check' finding: a slot answer uses (outside backticks) a word the glossary lists as _Avoid_
  SCENARIO_INCOMPLETE 'ds guidelines check' finding: an answer lacks one of Do / Don't / Why
  OPEN_QUESTION      'ds guidelines check' warning: a slot has no answer yet
  UNBOUND_KNOWLEDGE  'ds guidelines check' warning: a knowledge citation without a measured gap id
  ORPHANED_ANSWERS   'ds guidelines check' warning: answers wait in guidelines.orphans.md
  STALE_FILE         'ds guidelines check' warning: a pack-folder file the manifest does not list
  OPEN_QUESTIONS     'ds guidelines export' refused: n slots have no complete answer
  PACK_INVALID       'ds guidelines export' refused: the pack has check errors
  BUDGET_EXCEEDED    The Figma bundle is over the 200 KB cap (also a 'check --profile figma' finding)
  OVER_SOFT_BUDGET   'check --profile figma' warning: the bundle is over 100 KB
  BUNDLE_FILE_COUNT  The Figma bundle has fewer than 3 or more than 8 files
  BUNDLE_EXTENSION   'check --profile figma': a bundle file is not .md, .txt or .json
  BUNDLE_DIR_NOT_CLEAN 'export': the bundle folder holds files this export does not produce
  BUNDLE_NOT_FOUND   'check --profile figma': no such bundle folder
  BAD_ANSWERS_STORE  'ds guidelines build|check|export': guidelines.answers.json is not a valid { version: 1, answers } store
  BUILD_FAILED       'ds guidelines build' hit an unexpected defect in the pack builder (reported, not a crash)
  EXPORT_FAILED      'ds guidelines export' hit an unexpected defect assembling the bundle
  SEAL_UNVERIFIED    'ds guidelines check --allow-unsealed' warning: a store file no longer matches its sealed hash
  PACK_INCOMPLETE    'ds guidelines check' finding: a manifest-listed file or generated block is missing
  BAD_RULINGS        'ds guidelines build|check' rulings file is not the expected { rulings: [...] } shape

Kit error codes:
  KIT_DOWNGRADE              Init/import cannot replace an adopted or incomplete kit
  BAD_KIT / KIT_FORMAT       Malformed kit contract or unsupported fields
  KIT_PATH / KIT_IO          Unsafe path or unreadable candidate file
  KIT_SOURCE / KIT_TOKENS    Invalid captured record or token tree
  KIT_THEME / KIT_ALIAS / KIT_MODE  Invalid owner theme, compatibility alias or mode
  KIT_UNDECLARED             Required or discovered content is outside the declared closure
  KIT_BLOCKED                Unresolved coverage or source facts; inspect returned findings
  KIT_EVIDENCE               Missing, failed or inconsistent declared case evidence
  KIT_EVIDENCE_STALE         Receipt subject differs from prepared content
  KIT_TAMPERED / KIT_CHANGED Bound bytes changed during validation or adoption
  KIT_NOT_BOUND             Verify requested for a project without an adopted kit
  KIT_TARGET_EXISTS         Destination is occupied; no overwrite is allowed
  KIT_PLAN_INCOMPLETE / KIT_ADOPTION_INCOMPLETE  Explicit partial reservation; inspect receipt
`;
// 'ds a11y' error codes (DS_NOT_FOUND / BAD_ARG / BAD_JSON / UNKNOWN_FLAG) are shared with the above.

export const dsCommand = {
  name: CMD,
  summary: "Compile, inspect, and mutate the project's design system",
  hasSubcommands: true,
  help: DS_HELP,
  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "kit":          return runKit(parsed);
      case "init":         return runInit(parsed);
      case "import":       return runImport(parsed);
      case "context":      return runContext(parsed);
      case "change-token": return runChangeToken(parsed);
      case "set-role":     return runSetRole(parsed);
      case "status":       return runStatus(parsed);
      case "diff":         return runDiff(parsed);
      case "docs":         return runDocs(parsed);
      case "a11y":         return runA11y(parsed);
      case "specimen":     return runSpecimen(parsed);
      case "preview":      return runPreview(parsed);
      case "soul":         return runSoul(parsed);
      case "guidelines":   return runGuidelines(parsed);
      case undefined: {
        const msg = "ui ds requires a subcommand. Run 'ui ds --help'.";
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${sub}'. Run 'ui ds --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
    }
  },
};
