import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  return runCommand('CLONE_TRAITS', {
    sourceId: args.req('source'),
    targetId: args.req('target'),
    traits: args.req('traits'),
  }, { activity: `Clone traits · ${args.req('target')}` });
}
