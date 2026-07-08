import { defineConfig } from 'vitest/config';

// Pure-logic unit tests for the figma-agent workspace (converter + payload
// builders). Kept SEPARATE from the root vitest project (which only globs
// root tests/) so figma-agent tests never touch the deterministic `ui` binary
// suite. Run with: npx vitest run --config figma-agent/vitest.config.ts
export default defineConfig({
  // Pin root to this workspace so `include` never resolves against the repo
  // root's tests/ (which holds the deterministic `ui` binary suite).
  root: import.meta.dirname,
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
