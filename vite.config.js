import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "web/classes/static/js/schedule_build.ts",
      formats: ["iife"],
      name: "CrimsonScheduler",
      fileName: () => "schedule_build.bundle.js",
    },
    outDir: "web/classes/static/js",
    emptyOutDir: false,
    minify: false,
  },
});
