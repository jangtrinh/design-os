// Which file a request routes to, and how strictly. PURE — the daemon reads env + envelope and
// asks here, so precedence is a unit test rather than a code path only reachable with two Figma
// files open.
export type FilterSource = 'flag' | 'env' | 'none';

export interface RouteFilter {
  value: string | null;   // trimmed; null = no restriction
  exact: boolean;         // --file must match the WHOLE name; the env pin stays a substring pin
  source: FilterSource;
}

/**
 * Precedence: explicit `--file` (per request) > FIGMA_AGENT_FILE (per daemon) > active plugin.
 *
 * `--file` is EXACT (case-insensitive, trimmed) on purpose: it is the routing half of a guard the
 * plugin re-checks against `figma.root.name`. A substring filter could route "Design" to
 * "Design System" and then have the plugin refuse it with E_WRONG_FILE — routing and guard must
 * agree, so they use the same comparison.
 */
export function resolveRouteFilter(expectedFile?: string | null, envPin?: string | null): RouteFilter {
  const flag = expectedFile?.trim();
  if (flag) return { value: flag, exact: true, source: 'flag' };
  const env = envPin?.trim();
  if (env) return { value: env, exact: false, source: 'env' };
  return { value: null, exact: false, source: 'none' };
}

export { fileMatches } from '../../../shared/file-match.ts';
