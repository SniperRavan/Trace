import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: mode === 'development',
    minify: mode === 'development' ? false : 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/content/interceptor.ts'),
      name: 'TraceInterceptor',
      formats: ['iife'],
      fileName: () => 'content/interceptor.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
}))
