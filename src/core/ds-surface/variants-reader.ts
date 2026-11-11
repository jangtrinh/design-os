/**
 * The one place `ui ds surface` reads variants (spec 033 FR-027, AC-29), and only where a pattern reads them exactly:
 * the props type of the component, declared in the same file as `interface <Name>Props { ... }` or
 * `type <Name>Props = { ... }`, with a member whose type is a union of two or more string literals
 * (`tone?: "neutral" | "danger"`). Each literal becomes one `Dimension=value` entry, the dimension being the member name
 * with its first letter upper-case and the value verbatim.
 *
 * Anything else is not read: a look chosen through an object, a `cva` call, a union written through another type, a
 * type that is not declared in the file. Such a component gets no variants and is counted under `notRead`; nothing is
 * inferred from a file name or from a name that merely resembles a variant. The registry record has no field for
 * props, so props are never written.
 */
import { blankComments } from "./source-export-reader.js";

const LITERAL_UNION = /^\s*(?:"[^"\n]*"|'[^'\n]*')(?:\s*\|\s*(?:"[^"\n]*"|'[^'\n]*'))+\s*$/;

/** The text between the braces that open at `open`, or null when they are not closed. */
function braceBody(text: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

export function readVariants(componentName: string, source: string): string[] {
  const text = blankComments(source);
  const decl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:interface\\s+${componentName}Props\\b[^{=]*|type\\s+${componentName}Props\\s*=\\s*)\\{`);
  const m = decl.exec(text);
  if (m === null) return [];
  const body = braceBody(text, m.index + m[0].length - 1);
  if (body === null) return [];
  const out: string[] = [];
  for (const member of body.split(/[;\n,]/)) {
    const mm = /^\s*([A-Za-z_$][\w$]*)\??\s*:\s*(.+)$/.exec(member);
    if (mm === null || !LITERAL_UNION.test(mm[2] as string)) continue;
    const dim = (mm[1] as string).charAt(0).toUpperCase() + (mm[1] as string).slice(1);
    for (const lit of (mm[2] as string).split("|")) out.push(`${dim}=${lit.trim().slice(1, -1)}`);
  }
  return out;
}
