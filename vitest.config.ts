import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/dist/**', '**/out/**', '**/test-results/**', '**/tests/e2e/**'],
  },
});
