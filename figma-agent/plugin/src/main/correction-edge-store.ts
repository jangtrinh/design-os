import {
  buildCorrectionEvent,
  EDGE_RAW_LIMIT,
  retainCorrectionEvents,
  type CorrectionEvent,
} from '../../../shared/supervised-memory';

const NAMESPACE = 'ease_design';
const KEY = 'figma-corrections-v1';
const suppressedUntil = new Map<string, number>();
let eventSequence = 0;

function parseEvents(text: string): CorrectionEvent[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed as CorrectionEvent[] : [];
  } catch {
    return [];
  }
}

export function readEdgeCorrections(): CorrectionEvent[] {
  return parseEvents(figma.root.getSharedPluginData(NAMESPACE, KEY));
}

export function writeEdgeCorrections(events: readonly CorrectionEvent[]): CorrectionEvent[] {
  const retained = retainCorrectionEvents(events, new Date(), EDGE_RAW_LIMIT);
  figma.root.setSharedPluginData(NAMESPACE, KEY, JSON.stringify(retained));
  return retained;
}

function eventId(prefix: string, nodeId: string): string {
  eventSequence += 1;
  return `${prefix}-${Date.now()}-${eventSequence}-${nodeId.replace(/[^a-z0-9]/gi, '-')}`;
}

export function isDesignerCorrectionCandidate(
  changeType: string,
  properties: readonly string[],
): boolean {
  if (changeType !== 'PROPERTY_CHANGE' || properties.length === 0) return false;
  return !properties.includes('parent') && !properties.includes('relativeTransform');
}

export function beginAgentMutation(nodeIds: readonly string[]): void {
  const until = Date.now() + 2_000;
  for (const nodeId of nodeIds) suppressedUntil.set(nodeId, until);
}

export function recordAgentMutation(nodeId: string, traits: Record<string, unknown>): CorrectionEvent {
  const event = buildCorrectionEvent({
    eventId: eventId('agent', nodeId),
    fileKey: figma.fileKey ?? 'local-file',
    nodeId,
    source: 'agent',
    kind: 'agent-operation',
    timestamp: new Date().toISOString(),
    traits,
  });
  writeEdgeCorrections([...readEdgeCorrections(), event]);
  return event;
}

export function recordDesignerCorrection(
  nodeId: string,
  traits: Record<string, unknown>,
): CorrectionEvent | null {
  const changeType = typeof traits.changeType === 'string' ? traits.changeType : '';
  const properties = Array.isArray(traits.properties)
    ? traits.properties.filter((value): value is string => typeof value === 'string')
    : [];
  if (!isDesignerCorrectionCandidate(changeType, properties)) return null;
  if ((suppressedUntil.get(nodeId) ?? 0) >= Date.now()) return null;
  const events = readEdgeCorrections();
  const parent = [...events].reverse()
    .find((event) => event.nodeId === nodeId && event.kind === 'agent-operation');
  if (!parent) return null;
  const event = buildCorrectionEvent({
    eventId: eventId('correction', nodeId),
    fileKey: figma.fileKey ?? 'local-file',
    nodeId,
    source: 'designer',
    kind: 'designer-correction',
    timestamp: new Date().toISOString(),
    causalParent: parent.eventId,
    unresolved: true,
    traits,
  });
  writeEdgeCorrections([...events, event]);
  return event;
}
