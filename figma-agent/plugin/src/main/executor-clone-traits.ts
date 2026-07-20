import { withCode } from './executor-styles';

export const TRAIT_GROUPS = [
  'layout', 'fills-variables', 'typography', 'spacing', 'text',
] as const;
export type TraitGroup = (typeof TRAIT_GROUPS)[number];

type Params = Record<string, unknown>;
type Writable = SceneNode & Record<string, unknown>;

function requestedTraits(value: unknown): TraitGroup[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const traits = raw.map(String).map((item) => item.trim()).filter(Boolean);
  const unknown = traits.filter((item) => !(TRAIT_GROUPS as readonly string[]).includes(item));
  if (unknown.length > 0) {
    throw withCode(new Error(`unknown traits: ${unknown.join(', ')}; valid: ${TRAIT_GROUPS.join(', ')}`), 'E_INVALID_ARGS');
  }
  if (traits.includes('text') && value === undefined) {
    throw withCode(new Error('text copying requires an explicit text trait'), 'E_INVALID_ARGS');
  }
  return [...new Set(traits)] as TraitGroup[];
}

async function sceneNode(id: unknown, label: string): Promise<SceneNode> {
  if (typeof id !== 'string' || !id) throw withCode(new Error(`missing ${label} id`), 'E_INVALID_ARGS');
  const node = await figma.getNodeByIdAsync(id);
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw withCode(new Error(`${label} not found: ${id}`), 'E_INVALID_ARGS');
  }
  return node as SceneNode;
}

function copyFields(
  source: Writable,
  target: Writable,
  fields: readonly string[],
): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const field of fields) {
    if (!(field in source) || !(field in target)) continue;
    try {
      target[field] = source[field];
      applied.push(field);
    } catch {
      skipped.push(field);
    }
  }
  return { applied, skipped };
}

async function copyTypography(
  source: SceneNode,
  target: SceneNode,
): Promise<{ applied: string[]; skipped: string[] }> {
  if (source.type !== 'TEXT' || target.type !== 'TEXT') {
    throw withCode(new Error('typography trait requires TEXT source and target'), 'E_INVALID_ARGS');
  }
  const font = source.fontName;
  if (font !== figma.mixed) {
    await figma.loadFontAsync(font);
    target.fontName = font;
  }
  return copyFields(source as Writable, target as Writable, [
    'fontSize', 'lineHeight', 'letterSpacing', 'textAlignHorizontal',
    'textAlignVertical', 'textCase', 'textDecoration', 'paragraphSpacing',
  ]);
}

export async function opCloneTraits(params: Params): Promise<Record<string, unknown>> {
  const source = await sceneNode(params.sourceId ?? params.source, 'source');
  const target = await sceneNode(params.targetId ?? params.target, 'target');
  const traits = requestedTraits(params.traits);
  if (traits.length === 0) throw withCode(new Error('CLONE_TRAITS requires traits'), 'E_INVALID_ARGS');
  const applied: string[] = [];
  const skipped: string[] = [];
  const collect = (result: { applied: string[]; skipped: string[] }) => {
    applied.push(...result.applied);
    skipped.push(...result.skipped);
  };

  for (const trait of traits) {
    if (trait === 'layout') collect(copyFields(source as Writable, target as Writable, [
      'layoutMode', 'layoutWrap', 'primaryAxisAlignItems', 'counterAxisAlignItems',
      'primaryAxisSizingMode', 'counterAxisSizingMode', 'layoutSizingHorizontal',
      'layoutSizingVertical', 'constraints',
    ]));
    if (trait === 'spacing') collect(copyFields(source as Writable, target as Writable, [
      'itemSpacing', 'counterAxisSpacing', 'paddingTop', 'paddingRight',
      'paddingBottom', 'paddingLeft',
    ]));
    if (trait === 'fills-variables') collect(copyFields(source as Writable, target as Writable, [
      'fills', 'strokes', 'strokeWeight', 'opacity',
    ]));
    if (trait === 'typography') collect(await copyTypography(source, target));
    if (trait === 'text') {
      if (source.type !== 'TEXT' || target.type !== 'TEXT') {
        throw withCode(new Error('text trait requires TEXT source and target'), 'E_INVALID_ARGS');
      }
      collect(await copyTypography(source, target));
      target.characters = source.characters;
      applied.push('characters');
    }
  }
  return { sourceId: source.id, targetId: target.id, traits, applied, skipped };
}
