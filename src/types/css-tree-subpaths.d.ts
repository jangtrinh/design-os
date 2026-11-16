// Ambient declaration shims for css-tree subpaths that DefinitelyTyped does not cover
declare module "css-tree/parser" {
  import type { CssNode, ParseOptions } from "css-tree";
  const parse: (source: string, options?: ParseOptions) => CssNode;
  export default parse;
}
declare module "css-tree/walker" {
  import type { CssNode, EnterOrLeaveFn, WalkOptions } from "css-tree";
  const walk: (ast: CssNode, options: EnterOrLeaveFn | WalkOptions) => void;
  export default walk;
}
declare module "css-tree/generator" {
  import type { CssNode, GenerateOptions } from "css-tree";
  const generate: (node: CssNode, options?: GenerateOptions) => string;
  export default generate;
}
