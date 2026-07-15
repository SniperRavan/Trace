import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
