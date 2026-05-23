/**
 * Sentinel manifest builder for `ui init --runtime`.
 *
 * Writes a JSON placeholder that reserves the CLI surface and defines the
 * manifest schema. A future `ui init` release will flip `status` from `"stub"`
 * to `"ready"` and extend the directory with the real adapter tree.
 *
 * The `now` parameter is injectable so tests can assert on a fixed timestamp
 * without time-dependent flakiness.
 */
import { join } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Runtime = "claude" | "antigravity" | "codex";

export const RUNTIMES: readonly Runtime[] = ["claude", "antigravity", "codex"] as const;

export interface InitStubManifest {
  version: 1;
  runtime: Runtime;
  /** ISO-8601 timestamp supplied by the caller (injectable for deterministic tests). */
  generatedAt: string;
  /** `"stub"` until a future release populates the real adapter tree. */
  status: "stub";
  /** PATH-lookup name or absolute path the host runtime uses to invoke the binary via Bash. */
  binaryPath: string;
  /** Absolute path to the knowledge/ directory the host model reads directly. */
  knowledgePath: string;
  /**
   * Repo-relative pointer to the phase that implements full adapter generation.
   * Stable across plan renumbering because it references a heading anchor, not
   * a phase filename.
   */
  roadmapPointer: string;
}

// ─── Manifest builder ─────────────────────────────────────────────────────────

const ROADMAP_POINTER =
  "plans/ease-design/implementation-plan.md#phase-6-per-runtime-adapters-ui-init";

/**
 * Build the sentinel manifest for a given runtime.
 *
 * @param input.runtime      Target runtime identifier.
 * @param input.binaryPath   Resolved path to the `ui` binary (e.g. `which ui` output).
 * @param input.knowledgePath Resolved path to the `knowledge/` directory.
 * @param input.now          Injectable clock — called once for `generatedAt`.
 */
export function buildManifest(input: {
  runtime: Runtime;
  binaryPath: string;
  knowledgePath: string;
  now: () => Date;
}): InitStubManifest {
  return {
    version: 1,
    runtime: input.runtime,
    generatedAt: input.now().toISOString(),
    status: "stub",
    binaryPath: input.binaryPath,
    knowledgePath: input.knowledgePath,
    roadmapPointer: ROADMAP_POINTER,
  };
}

// ─── Target path resolution ───────────────────────────────────────────────────

/**
 * Resolve the absolute path where the manifest should be written for a given
 * runtime and working directory.
 *
 * - claude      → `<cwd>/.claude/ease-design.json`
 * - antigravity → `<cwd>/.agent/ease-design.json`
 * - codex       → `<cwd>/AGENTS.ease-design.json`
 *
 * The Codex target uses a sidecar JSON file rather than appending to
 * `AGENTS.md` so the write is idempotent and machine-readable.
 */
export function manifestTargetPath(cwd: string, runtime: Runtime): string {
  switch (runtime) {
    case "claude":      return join(cwd, ".claude", "ease-design.json");
    case "antigravity": return join(cwd, ".agent",  "ease-design.json");
    case "codex":       return join(cwd, "AGENTS.ease-design.json");
  }
}
