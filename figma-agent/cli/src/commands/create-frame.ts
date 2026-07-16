// `figma-agent create-frame` — figma.createFrame with geometry / optional parent.
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const name = args.req('name');
  return runCommand('CREATE_FRAME', {
    name,
    width: args.num('w'),
    height: args.num('h'),
    parentId: args.str('parent'),
    x: args.num('x'),
    y: args.num('y'),
  }, { activity: `Build · ${name}` });
}
