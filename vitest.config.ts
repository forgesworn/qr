import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: false,
    include: ['test/**/*.test.ts'],
    // Keep the damage suites from competing with a worker for every CPU.
    maxWorkers: 2,
    // Several tests run for seconds on an idle machine; the default 5 s fails them on a busy one.
    testTimeout: 60_000,
  },
})
