import { defineConfig } from 'vitest/config';

// Only this project's tests: without this, a run in the main checkout also picks up the copies in
// `.claude/worktrees/*` and counts them twice.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
