export type TargetSource = 'explicit' | 'selection' | 'recent';

export interface TargetResolution {
  nodeId: string;
  source: TargetSource;
}

export class TargetResolutionError extends Error {
  readonly code = 'E_INVALID_ARGS';
}

export function resolveSafeTarget(input: {
  explicit?: string;
  selection?: readonly string[];
  recent?: readonly string[];
  destructive?: boolean;
}): TargetResolution {
  if (input.explicit) return { nodeId: input.explicit, source: 'explicit' };
  if (input.destructive) {
    throw new TargetResolutionError('destructive or broad operations require an explicit node id');
  }
  const selected = input.selection?.find(Boolean);
  if (selected) return { nodeId: selected, source: 'selection' };
  const recent = input.recent?.find(Boolean);
  if (recent) return { nodeId: recent, source: 'recent' };
  throw new TargetResolutionError('no target: pass a node id, select one node, or edit a node recently');
}
