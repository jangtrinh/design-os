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
 * props, so props are never written. A props type with more than one literal union writes none of them: the record has no
 * field that keeps which prop a value belongs to, and one union written with the others left out would be a silent loss.
 */
import { blankComments } from "./source-text-masks.js";

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

export interface VariantReading {
  variants: string[];
  /** True when the props type holds more than one literal union: none is written, because the record keeps no prop name per value. */
  severalUnions: boolean;
}

export const readVariants = (componentName: string, source: string): string[] => readVariantsDetail(componentName, source).variants;

export function readVariantsDetail(componentName: string, source: string): VariantReading {
  const none: VariantReading = { variants: [], severalUnions: false };
  const text = blankComments(source);
  const decl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:interface\\s+${componentName}Props\\b[^{=]*|type\\s+${componentName}Props\\s*=\\s*)\\{`);
  const m = decl.exec(text);
  if (m === null) return none;
  const body = braceBody(text, m.index + m[0].length - 1);
  if (body === null) return none;
  const out: string[] = [];
  let unions = 0;
  for (const member of body.split(/[;\n,]/)) {
    const mm = /^\s*([A-Za-z_$][\w$]*)\??\s*:\s*(.+)$/.exec(member);
    if (mm === null || !LITERAL_UNION.test(mm[2] as string)) continue;
    unions++;
    const dim = (mm[1] as string).charAt(0).toUpperCase() + (mm[1] as string).slice(1);
    for (const lit of (mm[2] as string).split("|")) out.push(`${dim}=${lit.trim().slice(1, -1)}`);
  }
  return unions > 1 ? { variants: [], severalUnions: true } : { variants: out, severalUnions: false };
}
