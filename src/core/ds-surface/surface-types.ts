/** The shapes of `ui ds surface` (spec 033 FR-019, FR-020): the output `design-os-surface/1` and what registration needs beside it. */

import type { StyleBreakdown } from "./style-references.js";

export const SURFACE_SCHEMA = "design-os-surface/1";

export interface SurfaceComponent {
  name: string;
  /** Project-relative, POSIX. */
  file: string;
  /** The directory of the file. */
  dir: string;
  /** Token paths the component's own source references, resolved exactly; sorted. */
  tokens: string[];
  /** References that resolve to no token, plus one per class-composing helper call: the sum of the keys of `unresolved`. */
  unresolvedStyles: number;
  /** `unresolvedStyles` by kind, so nothing is invisible (spec 033 FR-019). */
  unresolved: StyleBreakdown;
  /** Theme-key utilities (`text-sm`, `bg-nope`) that name no token: not in the sum, because the kernel cannot tell a colour from a size without the app's theme. */
  utilitiesNamingNoToken: number;
}
export interface SurfaceCollision { name: string; files: string[] }
export interface SurfaceShadowed { name: string; file: string; fingerprint: string }
export interface SurfaceLink { file: string; components: string[] }
export interface SurfaceUnread {
  /** Files the walk met and did not read, with the reason. */
  files: { file: string; reason: string }[];
  /** Exports a pattern could not read as a component. */
  exports: { file: string; name: string; line: number; reason: string }[];
  /** Imports of a page or story that name a project file the walk could not pin to one file. */
  unresolvedImports: number;
  /**
   * What the project scan, which finds the app roots, reports about its own reach. When `truncated` is true the scan
   * stopped at its entry cap, so app roots may be missing; the components of the chosen app do not come from it.
   */
  scan: { truncated: boolean; visited: number; budget: { dir: string; visited: number }[] };
}

export interface SurfaceOutput {
  schema: typeof SURFACE_SCHEMA;
  /** The app root read, project-relative; "." is the scan root. */
  app: string;
  components: SurfaceComponent[];
  collisions: SurfaceCollision[];
  shadowed: SurfaceShadowed[];
  screens: SurfaceLink[];
  stories: SurfaceLink[];
  unstoried: string[];
  tailwindCss?: string;
  /** The store the tokens were resolved against: sealed, unverified (its files drifted from their seal; read as they are) or none. */
  tokenStore: { status: "sealed" | "unverified" | "none"; drifted?: string[] };
  unread: SurfaceUnread;
}

/** What registration reads that the output does not carry. */
export interface ComponentDetail {
  name: string;
  file: string;
  dir: string;
  startLine: number;
  endLine: number;
  /** Source slice of the declaration: the markup of the record. */
  source: string;
  /** Variants an extractor read exactly; empty when none was. */
  variants: string[];
}

export interface SurfaceModel { output: SurfaceOutput; details: ComponentDetail[] }

export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const idOf = (c: { name: string; file: string }): string => `${c.file}#${c.name}`;
