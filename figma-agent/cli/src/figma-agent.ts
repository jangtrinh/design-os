// figma-agent CLI entry: plain argv dispatch (no arg-parsing dependency).
// Hidden subcommand `__broker` runs the persistent relay daemon in-process.
// Every visible command prints exactly ONE JSON object and exits 0/1.
import { resolve } from 'node:path';
import { runBrokerDaemon } from './transport/broker-daemon.ts';
import { parseArgs, type CommandArgs } from './arg-parse.ts';
import { CliError } from './transport/protocol-helpers.ts';
import { getLastFileContext, setExpectedFile, setProjectDir, setReadOnly } from './transport/broker-client.ts';
import { printErrorJson, printJson, withFileContext } from './util/json-out.ts';
import * as batch from './commands/batch.ts';
import * as bind from './commands/bind.ts';
import * as bindVariable from './commands/bind-variable.ts';
import * as capture from './commands/capture.ts';
import * as cloneTraits from './commands/clone-traits.ts';
import * as createFrame from './commands/create-frame.ts';
import * as createInstance from './commands/create-instance.ts';
import * as createVariable from './commands/create-variable.ts';
import * as execJs from './commands/exec-js.ts';
import * as exportPng from './commands/export-png.ts';
import * as getSelection from './commands/get-selection.ts';
import * as htmlToFigma from './commands/html-to-figma.ts';
import * as inspect from './commands/inspect.ts';
import * as job from './commands/job.ts';
import * as mirrorVerify from './commands/mirror-verify.ts';
import * as scanDesignSystem from './commands/scan-design-system.ts';
import * as scanNode from './commands/scan-node.ts';
import * as scanConventions from './commands/scan-conventions.ts';
import * as auditDs from './commands/audit-ds.ts';
import * as setAutolayout from './commands/set-autolayout.ts';
import * as setConstraints from './commands/set-constraints.ts';
import * as seat from './commands/seat.ts';
import * as setText from './commands/set-text.ts';
import * as setVariant from './commands/set-variant.ts';
import * as status from './commands/status.ts';
import * as syncCorrections from './commands/sync-corrections.ts';

// Re-exported so command files keep `import type { CommandArgs } from '../figma-agent.ts'`.
export type { CommandArgs } from './arg-parse.ts';

const COMMAND_MODULES: Record<string, { run(args: CommandArgs): Promise<unknown> }> = {
  status,
  seat,
  bind,
  'get-selection': getSelection,
  inspect,
  job,
  'scan-design-system': scanDesignSystem,
  'scan-node': scanNode,
  'mirror-verify': mirrorVerify,
  'scan-conventions': scanConventions,
  'audit-ds': auditDs,
  'create-frame': createFrame,
  'create-instance': createInstance,
  'set-variant': setVariant,
  'create-variable': createVariable,
  'bind-variable': bindVariable,
  'set-autolayout': setAutolayout,
  'set-constraints': setConstraints,
  'set-text': setText,
  'clone-traits': cloneTraits,
  'sync-corrections': syncCorrections,
  'export-png': exportPng,
  'html-to-figma': htmlToFigma,
  'exec-js': execJs,
  capture,
  batch,
};

const HELP = `figma-agent — CLI bridge to the Figma plugin (via a local WS broker)

Usage: figma-agent <command> [options]

Commands:
  status               Broker + plugin connection info
  seat                 Probe seat → {seat, bridge, reason} [--seat free|paid skips the probe]
  bind                 --file "<name>" --dir <projectDir>   bind a file to a project for
                       panel/idle sync (refuses to guess otherwise) [--list] [--unbind]
  get-selection        Serialize the current selection [--depth 1]
  inspect              [nodeId|--node id] [--out file.png --scale 1 --timeout ms]
  job                  <jobId> [--wait] [--wait-timeout 60000] | --list [--file name] |
                       <jobId> --cancel (queued only) | <jobId> --force-release
                       poll/wait/cancel/list a job the CLI stopped waiting for (backlog 1.1+2.6+4.3)
  scan-design-system   Components/variables/styles registry [--out file.json --timeout ms]
  scan-node            [SPIKE] Reverse-walk one node → FigmaExportNode spec <nodeId> [--timeout ms]
  mirror-verify        Prove one node round-trips: scan → rebuild → scan → diff <nodeId> [--parent id --keep --timeout ms]
  scan-conventions     Convention-DNA walk over sections → usage-dna.json [<sectionId...> --out file.json --budget 14000 --timeout ms]
  audit-ds             DS-hygiene audit of the open file's component library [--out file.json --sections "01 A,02 B" --facts raw.json --from-facts raw.json --timeout ms]
  create-frame         --name n --w 400 --h 300 [--parent id --x 0 --y 0]
  create-instance      --component <key|id> [--parent id]
  set-variant          --node id --props k=v,k2=v2
  create-variable      --collection c --name n --type COLOR|FLOAT|STRING|BOOLEAN --value v [--mode m]
  bind-variable        --node id --field fills|cornerRadius|... --variable <id|name>
  set-autolayout       --node id --mode H|V|GRID|NONE [--gap n --pad t,r,b,l --align-primary --align-counter --wrap --sizing-h --sizing-v --rows n --cols n --col-sizes ...]
  set-constraints      --node id --h MIN|MAX|CENTER|STRETCH|SCALE --v MIN|MAX|CENTER|STRETCH|SCALE
  set-text             --node id --chars "..." [--font f --size n --weight n]
  clone-traits         --source id --target id --traits layout,fills-variables,typography,spacing,text
  sync-corrections     [--dir project] sync Figma edge memory with design/memory
  export-png           --node <id|selection> --out file.png [--scale 2]
  html-to-figma        --html <file|-> [--width 1280 --x --y --parent id --replace id]
  exec-js              <file|-> [--timeout ms (cap 120000)] [--undo-group]
                       --undo-group brackets the script in ONE undo step and reverts it on error;
                       the script must not call figma.commitUndo/triggerUndo itself, and a timeout
                       cannot stop a running script (the plugin has no cancellation). While it runs,
                       figma.currentPage carries one extra invisible child (the undo sentinel) —
                       a script that enumerates or counts the page's children will see it.
                       \`console\` and \`ui\` are injected — a script cannot declare its own.
  capture              <url> [--out dir --headless --channel chrome --width 1440 --timeout ms --carousel-window ms]
  batch                <file.json> [--stop-on-error]

Global: --file "<exact file name>"   route to that file's plugin AND refuse to run anywhere else
                                     (exact, case-insensitive; beats FIGMA_AGENT_FILE; payloads
                                      >512KB route by the env pin but are still guarded)
        --dir <projectDir>          this invocation's project root (default: cwd); stamped on
                                     every request so panel/idle sync can apply into the right
                                     project once bound (\`figma-agent bind\`) — never a guess
        --read-only                 declare that this command only READS. Skips the per-file
                                     mutation queue (backlog 1.1+2.6+4.3). TRUSTED, NOT ENFORCED —
                                     the plugin sandbox cannot verify it, so a mis-declared
                                     mutation can interleave with another agent's work.

All commands print one JSON object to stdout and exit 0, or {error:{code,message}} and exit 1.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const name = argv[0];

  if (name === '__broker') {
    await runBrokerDaemon(); // daemon never returns until shutdown
    return;
  }
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(HELP);
    process.exit(name ? 0 : 1);
  }
  const command = COMMAND_MODULES[name];
  if (!command) {
    printErrorJson(new CliError('E_INVALID_ARGS', `unknown command "${name}" — run figma-agent --help`));
  }
  const args = parseArgs(argv.slice(1));
  // `--file` with no value parses as boolean true and str() then returns undefined
  // (arg-parse.ts:27-34) — a typo would run UNGUARDED, so refuse instead.
  if (args.bool('file') && (args.str('file') ?? '').trim() === '') {
    printErrorJson(new CliError('E_INVALID_ARGS', '--file needs a file name, e.g. --file "VSF - PCP"'));
  }
  setExpectedFile(args.str('file'));   // global flag — verified: no command reads --file today
  setProjectDir(resolve(args.str('dir') ?? process.cwd())); // registry-integrity phase 01 §1
  setReadOnly(args.bool('read-only')); // concurrency & jobs (backlog 1.1+2.6+4.3) — TRUSTED, not enforced
  try {
    const result = await command.run(args);
    printJson(withFileContext(result));
    process.exit(0);
  } catch (err) {
    printErrorJson(err, getLastFileContext());
  }
}

main().catch((err) => printErrorJson(err));
