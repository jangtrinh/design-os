/**
 * Match selectors against one document, returning exactly what `css-select`'s
 * `selectAll` returns, without its two costs.
 *
 *  1. Every selector is tested against every element. The shared cascade matches
 *     each rule of a page, so a page with 2,000 rules over 8,000 elements made 16M
 *     tests. Here each selector is tested only on the elements that carry the class,
 *     id or type its rightmost compound requires (an index built once per document).
 *  2. Combinators are walked by backtracking with no memo. A chain of k descendant
 *     (or `~` sibling) combinators over a tree of depth D costs about C(D, k) per
 *     element, worst when the leftmost compound never matches: `.nope div div div
 *     div div` over 100 nested divs took 12 s, `.nope div div` over 3,000 took 40 s,
 *     and `.nope ~ div ~ div ~ div ~ div ~ div` over 80 siblings took 2.6 s. Where
 *     that bound is large, the selector is instead evaluated compound by compound
 *     with "does element e satisfy compounds 0..i" memoised per element, so each
 *     (compound, element) pair is decided once: linear in the document.
 *
 * `css-select` remains the authority on what a selector means: it compiles the
 * whole selector (so an unsupported one throws exactly as `selectAll` throws) and
 * every single compound. Only the walk between compounds is done here, and
 * tests/css-selector-match-differential.test.ts holds the two engines equal over
 * seeded random documents and selectors.
 */
import { compile } from "css-select";
import type { AnyNode, Document, Element } from "domhandler";
import { isTag } from "./html-dom.js";
import { splitCompoundChain, subjectKey } from "./css-selector-compound-chain.js";
import type { CompoundChain, Combinator } from "./css-selector-compound-chain.js";

/**
 * Above this many backtracking paths (candidates x C(depth, descendant combinators)
 * x C(siblings, `~` combinators)) a selector takes the memoised chain. Below it
 * `css-select`'s own walk is cheaper: the memo writes a map entry per visited
 * element, which on 2,000 ordinary 4-compound rules cost 4.7x the plain walk.
 * Measured: the plain walk covers about 1e8 paths a second, so this caps it near 10 ms.
 */
const PLAIN_WALK_PATH_BUDGET = 1e6;

export interface SelectorMatcherOptions {
  /** Take the memoised chain for every selector it can split. For tests: both paths must agree with css-select. */
  forceChain?: boolean;
}

type Test = (el: Element) => boolean;

/** The element's parent element; null at the top of the tree (the document is not an element). */
export const parentElementOf = (el: Element): Element | null => (el.parent !== null && isTag(el.parent) ? el.parent : null);
const prevElementOf = (el: Element): Element | null => {
  for (let p: AnyNode | null = el.prev; p !== null; p = p.prev) if (isTag(p)) return p;
  return null;
};

/** The elements `css-select` would visit, in document order: every element, not descending into `<template>`. */
interface ElementIndex {
  all: Element[];
  byKey: Map<string, Element[]>;
  /** Most ancestors, and most element siblings, any visited element has: the D and S of the path bound. */
  maxDepth: number;
  maxSiblings: number;
}

function indexElements(doc: Document): ElementIndex {
  const index: ElementIndex = { all: [], byKey: new Map(), maxDepth: 0, maxSiblings: 0 };
  const add = (key: string, el: Element): void => {
    const list = index.byKey.get(key);
    if (list === undefined) index.byKey.set(key, [el]);
    else if (list[list.length - 1] !== el) list.push(el);
  };
  const push = (stack: Array<[AnyNode, number]>, nodes: readonly AnyNode[], depth: number): void => {
    index.maxSiblings = Math.max(index.maxSiblings, nodes.filter(isTag).length);
    for (let i = nodes.length - 1; i >= 0; i--) stack.push([nodes[i] as AnyNode, depth]);
  };
  const stack: Array<[AnyNode, number]> = [];
  push(stack, doc.children, 0);
  while (stack.length > 0) {
    const [node, depth] = stack.pop() as [AnyNode, number];
    if (!isTag(node)) continue;
    index.all.push(node);
    index.maxDepth = Math.max(index.maxDepth, depth);
    add(`tag:${node.name}`, node);
    const id = node.attribs["id"];
    if (id !== undefined) add(`id:${id}`, node);
    for (const cls of (node.attribs["class"] ?? "").split(/\s+/)) if (cls !== "") add(`class:${cls}`, node);
    if (node.name !== "template") push(stack, node.children, depth + 1);
  }
  return index;
}

const binomial = (n: number, k: number): number => {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.max(0, r);
};

/** Upper bound on the paths `css-select`'s backtracking walk may try for this selector on this document. */
function plainWalkPaths(chain: CompoundChain, candidates: number, index: ElementIndex): number {
  const count = (c: Combinator): number => chain.combinators.filter((x) => x === c).length;
  return candidates * binomial(index.maxDepth, count(" ")) * binomial(index.maxSiblings, count("~"));
}

/** Does `el` satisfy the chain's compounds 0..last? Each (compound, element) pair is decided once. */
function chainTest(tests: Test[], combinators: Combinator[]): Test {
  const last = tests.length - 1;
  const satisfied = tests.map(() => new Map<Element, boolean>());
  const reachUp = tests.map(() => new Map<Element, boolean>());
  const reachBack = tests.map(() => new Map<Element, boolean>());

  const satisfies = (i: number, el: Element): boolean => {
    const memo = satisfied[i] as Map<Element, boolean>;
    const hit = i < last ? memo.get(el) : undefined;
    if (hit !== undefined) return hit;
    const result = (tests[i] as Test)(el) && (i === 0 || related(i, el));
    if (i < last) memo.set(el, result);
    return result;
  };

  /** Does `start`, or any element `step` reaches from it, satisfy compound `j`? Iterative: depth can be in the thousands. */
  const reaches = (memo: Map<Element, boolean>, j: number, start: Element | null, step: (el: Element) => Element | null): boolean => {
    const trail: Element[] = [];
    let result = false;
    for (let cur = start; cur !== null; cur = step(cur)) {
      const hit = memo.get(cur);
      if (hit !== undefined) { result = hit; break; }
      trail.push(cur);
      if (satisfies(j, cur)) { result = true; break; }
    }
    for (const el of trail) memo.set(el, result);
    return result;
  };

  /** Is there an element joined to `el` by the combinator before compound `i` that satisfies compound i-1? */
  const related = (i: number, el: Element): boolean => {
    const j = i - 1;
    switch (combinators[j]) {
      case ">": { const p = parentElementOf(el); return p !== null && satisfies(j, p); }
      case "+": { const s = prevElementOf(el); return s !== null && satisfies(j, s); }
      case "~": return reaches(reachBack[j] as Map<Element, boolean>, j, prevElementOf(el), prevElementOf);
      default: return reaches(reachUp[j] as Map<Element, boolean>, j, parentElementOf(el), parentElementOf);
    }
  };

  return (el) => satisfies(last, el);
}

/**
 * A matcher for one document. Build it once and reuse it for every selector: the
 * element index is built on the first call. The document must not be mutated
 * while the matcher is in use.
 */
export function createSelectorMatcher(doc: Document, options: SelectorMatcherOptions = {}): (selector: string) => Element[] {
  let index: ElementIndex | undefined;
  return (selector) => {
    // Throws for an unsupported selector exactly as `selectAll` does.
    const whole = compile<Element, Element>(selector, undefined, doc as unknown as Element);
    index ??= indexElements(doc);
    const chain = splitCompoundChain(selector);
    const key = chain === undefined ? undefined : subjectKey(chain.compounds[chain.compounds.length - 1] as string);
    const candidates = key === undefined ? index.all : (index.byKey.get(`${key.kind}:${key.value}`) ?? []);
    let test: Test = whole;
    if (chain !== undefined && (options.forceChain === true || plainWalkPaths(chain, candidates.length, index) > PLAIN_WALK_PATH_BUDGET)) {
      try {
        test = chainTest(chain.compounds.map((c) => compile<Element, Element>(c, undefined, doc as unknown as Element)), chain.combinators);
      } catch {
        test = whole; // a compound css-select will not compile alone: keep the whole-selector test
      }
    }
    return candidates.filter(test);
  };
}

/**
 * Every element of `doc` matching `selector`, in document order; the same list as
 * `css-select`'s `selectAll`. Throws when the selector cannot be compiled, as
 * `selectAll` does. Matching many selectors? Build one `createSelectorMatcher`.
 */
export function selectMatching(selector: string, doc: Document): Element[] {
  return createSelectorMatcher(doc)(selector);
}
