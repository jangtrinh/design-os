/**
 * Types for `css-tree`'s subpath entries.
 *
 * @types/css-tree only declares the package root. The root entry pulls in the
 * lexer, which `require`s its syntax data at runtime — unbundlable, and it broke
 * the relocatable binary. These three subpaths carry parse/walk/generate with no
 * runtime data load, so the engine imports them directly and borrows the root
 * package's node types for the shapes.
 */
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
  const generate: (ast: CssNode, options?: GenerateOptions) => string;
  export default generate;
}
