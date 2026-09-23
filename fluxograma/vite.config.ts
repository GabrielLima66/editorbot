import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// O build vai para ../vendor/fluxograma e e commitado (decisao D4): quem
// instala a extensao nao precisa de npm. Pagina de extensao MV3 bloqueia
// <script> inline (CSP script-src 'self'), entao NAO usa
// vite-plugin-singlefile como o desktop - o JS sai em assets/ externos.
// Fontes inlinadas como data URI (html-to-image as embute sem buscar arquivo).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../vendor/fluxograma",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 200_000,
    chunkSizeWarningLimit: 1_000,
    modulePreload: { polyfill: false },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
