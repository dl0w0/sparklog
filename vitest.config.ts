import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/out/**', 'tests/e2e/**', 'tests/perf/**', 'src/**/*.perf.test.ts'],
    globals: true,
    reporters: ['default'],
    testTimeout: 20000
  }
})
