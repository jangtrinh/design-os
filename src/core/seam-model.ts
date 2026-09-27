import { lexSeam, seamEnd, splitSeam } from "./seam-tokens.js";
import type { SeamLex, Span } from "./seam-tokens.js";
export interface Binding { name: string; scope: number; at: number; values: Span[]; property?: string; parameter?: { fn: SeamFunction; index: number } }
export interface SeamFunction { name: string; at: number; body: Span; parameters: string[]; returns: Span[] }
export interface SeamCall { name: string; at: number; end: number; args: Span[] }
export interface SeamModule extends SeamLex {
  file: string; source: string; bindings: Binding[]; functions: SeamFunction[]; calls: SeamCall[];
  imports: Map<string, { module: string; name: string }>;
}
export function visibleBinding(mod: SeamModule, name: string, at: number): Binding | undefined {
  let scope = mod.tokens[at]?.scope ?? -1;
  while (true) {
    const found = mod.bindings.filter((b) => b.name === name && b.scope === scope);
    if (found.length) return found.filter((b) => b.at <= at).at(-1) ?? found[0];
    if (scope === -1) return undefined;
    scope = mod.parents.get(scope) ?? -1;
  }
}
function bodyStart(mod: SeamModule, at: number): number {
  while (at < mod.tokens.length && !["{", ";", "="].includes(mod.tokens[at]!.text)) at++;
  return at;
}
export function modelSeam(file: string, source: string): SeamModule {
  const mod: SeamModule = { ...lexSeam(source), file, source, bindings: [], functions: [], calls: [], imports: new Map() };
  const t = mod.tokens; const text = (i: number) => t[i]?.text ?? "";
  for (let i = 0; i < t.length; i++) {
    if (text(i) === "import") {
      const end = seamEnd(mod, i + 1); const from = t.findIndex((token, n) => n > i && n < end && token.text === "from");
      if (from > 0) {
        const module = text(from + 1).slice(1, -1);
        for (let n = i + 1; n < from; n++) {
          if (text(n) === "{") {
            for (const [a, b] of splitSeam(mod, n + 1, mod.pairs.get(n) ?? from)) {
              if (text(a) !== "type") mod.imports.set(text(b - 1), { module, name: text(a) });
            }
            break;
          }
          if (text(n) === "as" || (n === i + 1 && /^[\w$]+$/.test(text(n)))) {
            mod.imports.set(text(n) === "as" ? text(n + 1) : text(n), { module, name: "*" });
          }
        }
      }
    }
    if (text(i) === "function" && text(i + 2) === "(") {
      const close = mod.pairs.get(i + 2); if (close === undefined) continue;
      const start = bodyStart(mod, close + 1); const end = mod.pairs.get(start);
      if (text(start) !== "{" || end === undefined) continue;
      const params = splitSeam(mod, i + 3, close).map(([a]) => text(a));
      mod.functions.push({ name: text(i + 1), at: i + 1, body: [start, end], parameters: params, returns: [] });
    }
    if (/^[A-Za-z_$][\w$]*$/.test(text(i)) && text(i + 1) === "(" && text(i - 1) !== "function") {
      const end = mod.pairs.get(i + 1);
      if (end !== undefined) mod.calls.push({ name: text(i), at: i, end, args: splitSeam(mod, i + 2, end) });
    }
  }
  for (let i = 0; i < t.length; i++) {
    if (["const", "let", "var"].includes(text(i))) {
      if (text(i + 1) === "{") {
        const close = mod.pairs.get(i + 1); if (close === undefined || text(close + 1) !== "=") continue;
        for (const [a, b] of splitSeam(mod, i + 2, close)) {
          mod.bindings.push({ name: text(b - 1), scope: t[i]!.scope, at: i, property: text(a), values: [[close + 2, seamEnd(mod, close + 2)]] });
        }
      } else if (/^[\w$]+$/.test(text(i + 1))) {
        let eq = i + 2;
        while (eq < t.length && !["=", ";", "of", "in", ")"].includes(text(eq))) eq++;
        const binding: Binding = { name: text(i + 1), scope: t[i]!.scope, at: i, values: [] };
        if (text(eq) === "=" || text(eq) === "of") {
          binding.values.push([eq + 1, text(eq) === "of" ? (mod.pairs.get(i - 1) ?? seamEnd(mod, eq + 1)) : seamEnd(mod, eq + 1)]);
        }
        mod.bindings.push(binding);
        // Arrow helpers are common IO wrappers; parameters must trace their callers too.
        if (text(eq + 1) === "(") {
          const close = mod.pairs.get(eq + 1);
          if (close !== undefined) {
            let arrow = close + 1;
            while (arrow < (binding.values[0]?.[1] ?? arrow) && !["=>", "{"].includes(text(arrow))) arrow++;
            if (text(arrow) === "=>") {
              const start = arrow + 1; const block = text(start) === "{";
              mod.functions.push({ name: binding.name, at: i + 1, body: [start, block ? mod.pairs.get(start)! : seamEnd(mod, start)],
                parameters: splitSeam(mod, eq + 2, close).map(([a]) => text(a)), returns: block ? [] : [[start, seamEnd(mod, start)]] });
            }
          }
        }
      }
    }
  }
  for (const fn of mod.functions) {
    fn.parameters.forEach((name, index) => mod.bindings.push({ name, scope: fn.body[0], at: fn.at, values: [], parameter: { fn, index } }));
    for (let i = fn.body[0] + 1; i < fn.body[1]; i++) {
      if (text(i) === "return") fn.returns.push([i + 1, seamEnd(mod, i + 1)]);
    }
  }
  for (let i = 1; i < t.length; i++) {
    if (text(i) !== "=" || !/^[\w$]+$/.test(text(i - 1)) || ["const", "let", "var", "."].includes(text(i - 2))) continue;
    const binding = visibleBinding(mod, text(i - 1), i);
    if (binding && !binding.values.some(([a]) => a === i + 1)) binding.values.push([i + 1, seamEnd(mod, i + 1)]);
  }
  return mod;
}
