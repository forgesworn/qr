import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: false,
    include: ['test/**/*.test.ts'],
    // Several tests run for seconds on an idle machine; the default 5 s fails them on a busy one.
    testTimeout: 60_000,
  },
})
