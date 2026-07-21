import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/extension.spec.ts', '**/references/**'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
