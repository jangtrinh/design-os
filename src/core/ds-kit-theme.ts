import { parseTokenFile, sanitizeModeName, type TokenTree } from './token-model.js';
import { resolveTokens } from './token-resolve.js';
import { emitCss, declaredCssVarNames } from './token-emit.js';
import { KitError } from './ds-kit-types.js';
import { object } from './ds-kit-parse.js';
function consumerVariable(name: string, type: string): string {
  const prefix = type === 'color' ? 'color' : type === 'fontFamily' ? 'font' : type === 'dimension' ? 'spacing' : type === 'fontWeight' ? 'font-weight' : type === 'duration' ? 'duration' : 'number';
  return /^radius(?:-|$)/.test(name) ? `--${name}` : `--${prefix}-${name}`;
}
function safeCssText(value: string): void {
  if (/[{};]/.test(value) || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || value.includes('/*') || value.includes('*/')) throw new KitError('KIT_THEME', 'Unsafe CSS token value');
  let quote = ''; const delimiters: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === '\\') {
      if (++i === value.length) throw new KitError('KIT_THEME', 'Unclosed CSS escape');
    } else if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') delimiters.push(char);
    else if (char === ')' || char === ']') {
      if (delimiters.pop() !== (char === ')' ? '(' : '[')) throw new KitError('KIT_THEME', 'Unbalanced CSS token value');
    }
  }
  if (quote || delimiters.length) throw new KitError('KIT_THEME', 'Unclosed CSS token value');
}
function safeCssScalar(value: unknown): void {
  if (typeof value === 'string') { safeCssText(value); return; }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    for (const item of value) {
      // The shared emitter quotes whitespace-bearing family names without
      // escaping embedded quotes. Preserve raw capture and refuse unsafe input.
      if (/["'\\]/.test(item)) throw new KitError('KIT_THEME', 'Unsafe font stack family');
      safeCssText(item);
    }
    return;
  }
  throw new KitError('KIT_THEME', 'Unsafe or unsupported CSS token value');
}
export function emitKitTheme(tokens: unknown, aliases: Record<string, string>): string {
  try {
    const tree = parseTokenFile(tokens);
    const colorRoles = /^(background|foreground|card|popover|primary|secondary|muted|accent|border|input|ring|destructive|.+-foreground)$/;
    const modes = new Set<string>(); const spellings = new Map<string,string>();
    for (const group of Object.values(tree)) for (const token of Object.values(group)) {
      for (const [key, value] of Object.entries(token.$extensions ?? {})) {
        if (!key.startsWith('mode.')) continue;
        const raw = key.slice(5); const mode = sanitizeModeName(raw);
        if (!raw || mode === 'x' || mode === 'default' || spellings.has(mode) && spellings.get(mode) !== raw) throw new KitError('KIT_MODE', `Ambiguous mode: ${raw}`);
        spellings.set(mode, raw); modes.add(mode);
        const ext = object(value, key, ['$value']);
        if (!('$value' in ext)) throw new KitError('KIT_MODE', `Missing value: ${key}`);
      }
    }
    const emit = (layer: TokenTree, selector: string): string => {
      const resolved = resolveTokens(layer).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      for (const t of resolved) {
        if (!/^[a-z][a-z0-9-]*\.[a-z0-9-]+$/.test(t.path)) throw new KitError('KIT_THEME', `Unsafe CSS token path: ${t.path}`);
        if (!['shadow','typography'].includes(t.type) && typeof t.value !== 'string' && typeof t.value !== 'number' && !(t.type === 'fontFamily' && Array.isArray(t.value))) throw new KitError('KIT_THEME', `Invalid scalar token: ${t.path}`);
        if (typeof t.value === 'number' && !Number.isFinite(t.value)) throw new KitError('KIT_THEME', `Nonfinite token: ${t.path}`);
        const names = declaredCssVarNames([t]);
        if (!names.size) throw new KitError('KIT_THEME', `Token omitted by CSS emitter: ${t.path}`);
        if ([...names].some(name => !/^--[a-z][a-z0-9-]*$/.test(name))) throw new KitError('KIT_THEME', `Unsafe emitted CSS identifier: ${t.path}`);
        if (t.value !== null && typeof t.value === 'object' && !Array.isArray(t.value)) {
          for (const member of Object.values(t.value)) safeCssScalar(member);
        } else safeCssScalar(t.value);
      }
      const declarations = declaredCssVarNames(resolved);
      const expected = resolved.reduce((n,t) => n + declaredCssVarNames([t]).size, 0);
      if (expected !== declarations.size) throw new KitError('KIT_THEME', 'CSS variable collision');
      const lines: string[] = [];
      const bindings = new Map([...declarations].map(name => [name, name]));
      const bind = (variable: string, target: string, name: string, consumer: boolean): void => {
        const previous = bindings.get(variable);
        if (previous !== undefined && previous !== target) throw new KitError('KIT_ALIAS', `${consumer ? 'Tailwind alias' : 'Alias'} collision: ${name}`);
        if (previous === undefined) lines.push(`  ${variable}: var(${target});`);
        bindings.set(variable, target);
      };
      for (const [name,path] of Object.entries(aliases).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) {
        if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new KitError('KIT_ALIAS', `Invalid alias: ${name}`);
        const token = resolved.find(t => t.path === path);
        if (!token || typeof token.value !== 'string' && typeof token.value !== 'number' || !['color','dimension','fontFamily','fontWeight','number','duration','string'].includes(token.type)) throw new KitError('KIT_ALIAS', `Unsupported alias target: ${path}`);
        if (colorRoles.test(name) && token.type !== 'color' || /^radius(?:-|$)/.test(name) && token.type !== 'dimension') throw new KitError('KIT_ALIAS', `Alias type mismatch: ${name}`);
        const vars = [...declaredCssVarNames([token])];
        if (vars.length !== 1) throw new KitError('KIT_ALIAS', `Alias collision: ${name}`);
        bind(`--${name}`, vars[0]!, name, false);
        const variable = consumerVariable(name, token.type);
        // Redeclare direct consumers in each mode scope: inherited root aliases
        // otherwise retain their already-resolved light value on descendants.
        bind(variable, vars[0]!, name, true);
      }
      const css = emitCss(resolved).replace(':root', selector);
      return css.replace('}\n', `${lines.length ? lines.join('\n') + '\n' : ''}}\n`);
    };
    let css = emit(tree, ':root');
    for (const mode of [...modes].sort()) {
      const layer = structuredClone(tree);
      for (const group of Object.values(layer)) for (const token of Object.values(group)) {
        const ext = token.$extensions?.[`mode.${spellings.get(mode)}`];
        if (ext !== undefined) token.$value = object(ext, 'mode')['$value'] as typeof token.$value;
      }
      css += emit(layer, `[data-ds-mode="${mode}"]`);
    }
    const resolved = resolveTokens(tree);
    let consumerDeclarations: Set<string> | undefined;
    const consumer: string[] = []; const references: string[] = [];
    Object.entries(aliases).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).forEach(([name,path]) => {
      const target = resolved.find(t => t.path === path)!;
      const variable = consumerVariable(name, target.type);
      const targetVar = [...declaredCssVarNames([target])][0]!;
      if ((consumerDeclarations ??= declaredCssVarNames(resolved)).has(variable) && variable !== targetVar) throw new KitError('KIT_ALIAS', `Tailwind alias collision: ${name}`);
      (variable === targetVar ? references : consumer).push(`  ${variable}: var(${targetVar});`);
    });
    return css + (consumer.length ? `@theme inline {\n${consumer.join('\n')}\n}\n` : '') + (references.length ? `@theme inline reference {\n${references.join('\n')}\n}\n` : '');
  } catch (error) {
    if (error instanceof KitError) throw error;
    throw new KitError('KIT_THEME', `Invalid token theme: ${String(error)}`);
  }
}
