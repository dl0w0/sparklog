import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.test.ts', 'src/**/*.perf.test.ts'],
    globals: true,
    testTimeout: 60000,
    reporters: ['default']
  }
})
