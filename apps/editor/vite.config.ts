import { defineConfig } from "vite";
export default defineConfig({
  base: "/engine/",
  resolve: {
    alias: {
      "@core": new URL("./src/core", import.meta.url).pathname,
      "@scene": new URL("./src/scene", import.meta.url).pathname,
      "@authoring": new URL("./src/authoring", import.meta.url).pathname,
      "@modules": new URL("./src/modules", import.meta.url).pathname,
    },
  },
  build: { outDir: "../../build/site", emptyOutDir: true },
});
