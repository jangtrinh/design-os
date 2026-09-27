import { posix } from "node:path";
import { splitSeam } from "./seam-tokens.js";
import { visibleBinding } from "./seam-model.js";
import type { Span } from "./seam-tokens.js";
import type { SeamModule, SeamFunction } from "./seam-model.js";
const unknown = ["*"];
const unique = (values: string[]) => values.length ? [...new Set(values)].sort() : unknown;
type Environment = Map<string, string[]>;
export function importedModule(mod: SeamModule, name: string, modules: SeamModule[]): SeamModule | undefined {
  const ref = mod.imports.get(name);
  if (!ref?.module.startsWith(".")) return undefined;
  const file = posix.normalize(posix.join(posix.dirname(mod.file), ref.module)).replace(/\.js$/, ".ts");
  return modules.find((m) => m.file === file);
}
export function functionFor(mod: SeamModule, name: string, modules: SeamModule[]): { mod: SeamModule; fn: SeamFunction } | undefined {
  const owner = importedModule(mod, name, modules) ?? mod;
  const fn = owner.functions.find((f) => f.name === (mod.imports.get(name)?.name ?? name));
  return fn ? { mod: owner, fn } : undefined;
}
function combine(parts: string[][], separator: string): string[] {
  let values = [""];
  for (const part of parts) {
    values = unique(values.flatMap((left) => part.map((right) => left === "" ? right : left + separator + right)));
    if (values.length > 512) throw new Error("path expansion exceeds 512 alternatives; simplify the source path expression");
  }
  return values;
}
export function resolveSeamPaths(modules: SeamModule[]) {
  function evaluate(mod: SeamModule, span: Span, env: Environment = new Map(), seen = new Set<string>(), property?: string): string[] {
    let [a, b] = span; const t = mod.tokens;
    while (t[a]?.text === "(" && mod.pairs.get(a) === b - 1) { a++; b--; }
    if (a >= b) return unknown;
    const key = `${mod.file}:${a}:${b}:${property ?? ""}`;
    if (seen.has(key)) return unknown;
    const next = new Set(seen).add(key);
    const val = (s: Span, prop?: string) => evaluate(mod, s, env, next, prop);
    // Conditional/coalescing alternatives are unioned; no execution or branch guessing.
    const choices = splitSeam(mod, a, b, ["?", ":", "??", "||"]);
    if (choices.length > 1) return unique(choices.slice(t.slice(a, b).some((x) => x.text === "?") ? 1 : 0).flatMap((s) => val(s, property)));
    if (property && t[a]?.text === "{") {
      const entry = splitSeam(mod, a + 1, mod.pairs.get(a) ?? b).find(([x]) => t[x]?.text === property);
      return entry ? val([entry[0] + (t[entry[0] + 1]?.text === ":" ? 2 : 0), entry[1]]) : unknown;
    }
    if (t[a]?.text === "[") return unique(splitSeam(mod, a + 1, mod.pairs.get(a) ?? b).flatMap((s) => val(s)));
    const plus = splitSeam(mod, a, b, ["+"]);
    if (plus.length > 1) return combine(plus.map((s) => val(s)), "");
    if (b - a === 1 && t[a]?.literal) {
      const raw = t[a]!.text; if (!/^["'`]/.test(raw)) return unknown;
      const text = raw.slice(1, -1).replace(/\\([\\'"`])/g, "$1");
      if (raw[0] !== "`") return [text];
      const parts: string[][] = []; let offset = 0;
      for (const match of text.matchAll(/\$\{([^{}]+)\}/g)) {
        parts.push([text.slice(offset, match.index)]);
        const binding = visibleBinding(mod, match[1]!.trim(), a);
        parts.push(binding?.values.length ? unique(binding.values.flatMap((span) => evaluate(mod, span, env, next))) : unknown);
        offset = match.index + match[0].length;
      }
      parts.push([text.slice(offset)]);
      return combine(parts, "");
    }
    const call = mod.calls.find((c) => c.at === a && c.end === b - 1) ??
      mod.calls.find((c) => c.at === a + 2 && t[a + 1]?.text === "." && c.end === b - 1);
    if (call) {
      const ref = mod.imports.get(call.name) ?? mod.imports.get(t[a]!.text);
      const name = ref?.name === "*" ? call.name : ref?.name ?? call.name;
      if ((ref?.module === "node:path" || ref?.module === "path") && ["join", "resolve"].includes(name)) {
        return combine(call.args.map((s) => val(s)), "/").map((p) => posix.normalize(p));
      }
      const target = functionFor(mod, call.name, modules);
      if (target) {
        const args = new Map(env);
        target.fn.parameters.forEach((param, index) => {
          const prefix = `${target.mod.file}:${target.fn.at}:${param}`;
          args.set(prefix, call.args[index] ? val(call.args[index]!) : unknown);
          for (const prop of new Set(target.mod.bindings.map((binding) => binding.property).filter((p) => p !== undefined))) {
            args.set(`${prefix}.${prop}`, call.args[index] ? val(call.args[index]!, prop) : unknown);
          }
        });
        return unique(target.fn.returns.flatMap((s) => evaluate(target.mod, s, args, next, property)));
      }
      return unknown;
    }
    // Bare member access (`input.templatesRoot`, not a call): reuse the same
    // property-threading the analyzer already has for destructuring and
    // template-literal interpolation, so a parameter's object-shaped value
    // still resolves through it instead of silently becoming unknown.
    if (b === a + 3 && t[a + 1]?.text === "." && /^[\w$]+$/.test(t[a]!.text) && /^[\w$]+$/.test(t[a + 2]!.text)) {
      return val([a, a + 1], t[a + 2]!.text);
    }
    if (b - a === 1 && /^[\w$]+$/.test(t[a]!.text)) {
      const name = t[a]!.text;
      let binding = visibleBinding(mod, name, a);
      if (!binding) binding = mod.bindings.find((item) => item.name === name && item.parameter && item.parameter.fn.body[0] <= a && item.parameter.fn.body[1] >= a);
      if (binding?.parameter) {
        const { fn, index } = binding.parameter;
        const supplied = env.get(`${mod.file}:${fn.at}:${name}${property ? `.${property}` : ""}`); if (supplied) return supplied;
        const values = modules.flatMap((caller) => caller.calls.flatMap((site) => {
          const target = functionFor(caller, site.name, modules);
          return target?.fn === fn && site.args[index] ? evaluate(caller, site.args[index]!, env, next, property) : [];
        }));
        return values.length ? unique(values) : unknown;
      }
      if (binding) return binding.values.length ? unique(binding.values.flatMap((s) => val(s, binding.property ?? property))) : unknown;
      const owner = importedModule(mod, name, modules);
      if (owner) {
        const imported = mod.imports.get(name)!.name;
        const value = owner.bindings.find((item) => item.name === imported);
        if (value) return unique(value.values.flatMap((s) => evaluate(owner, s, env, next, property)));
      }
    }
    return unknown;
  }
  return (mod: SeamModule, span: Span) => evaluate(mod, span);
}
/** Keep README at the root; rooted Markdown paths may contain symbolic segments. */
export function isProsePath(path: string): boolean {
  const normalized = posix.normalize(path.replace(/\\/g, "/"));
  return /(?:^|\/)README\.md$/.test(normalized) ||
    /(?:^|\/)(?:knowledge|templates|docs)\/.+\.md$/.test(normalized) ||
    /(?:^|\/)(?:knowledge|templates|docs)\/(?:[^.]*\/)?\*$/.test(normalized);
}
