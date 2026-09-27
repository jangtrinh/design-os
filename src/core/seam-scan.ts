import { modelSeam } from "./seam-model.js";
import { isProsePath, resolveSeamPaths } from "./seam-paths.js";
export interface ProseRead { file: string; line: number; readCall: string; paths: string[] }
/** Bounded static path analysis, never executes scanned code or reads the prose itself. */
export function scanProseReads(sources: Record<string, string>): ProseRead[] {
  const modules = Object.keys(sources).sort().map((file) => modelSeam(file, sources[file]!));
  const resolve = resolveSeamPaths(modules); const reads: ProseRead[] = [];
  for (const mod of modules) {
    for (const call of mod.calls) {
      let receiverAt = call.at;
      while (mod.tokens[receiverAt - 1]?.text === ".") receiverAt -= 2;
      const receiver = receiverAt < call.at ? mod.tokens[receiverAt]?.text : undefined;
      const ref = mod.imports.get(receiver ?? call.name);
      const name = ref?.name === "*" ? call.name : ref?.name;
      if (!ref || !/^(?:node:)?fs(?:\/promises)?$/.test(ref.module) || !name || !["readFileSync", "readFile", "openSync", "open"].includes(name)) continue;
      if (call.args[0] === undefined) continue;
      if (name === "open" || name === "openSync") {
        const flags = call.args[1] ? resolve(mod, call.args[1]) : ["r"];
        if (flags.every((flag) => /^[wa]x?$/.test(flag))) continue;
      }
      const paths = [...new Set(resolve(mod, call.args[0]).filter(isProsePath))].sort();
      if (!paths.length) continue;
      const start = mod.tokens[receiverAt]!.start;
      reads.push({ file: mod.file, line: mod.source.slice(0, start).split("\n").length,
        readCall: mod.source.slice(start, mod.tokens[call.end]!.end), paths });
    }
  }
  return reads;
}
