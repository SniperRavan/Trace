import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    resolve: {
      alias: { "@": resolve(__dirname, "src") },
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: mode === "development",
      minify: mode === "development" ? false : "esbuild",
      lib: {
        entry: resolve(__dirname, "src/content/index.ts"),
        name: "TraceContent",
        formats: ["iife"],
        fileName: () => "content/index.js",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  };
});
