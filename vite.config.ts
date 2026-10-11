import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "."),
    },
  },
  // No static-copy plugin for the manifest: Vite's default publicDir already
  // copies the contents of public/ (manifest.json, icons, favicon) to the root
  // of outDir. Copying it a second time produced extension/public/manifest.json
  // alongside extension/manifest.json, which the Chrome Web Store rejects as
  // "More than one manifest found in package".
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "extension",
    rollupOptions: {
      input: {
        main: "./index.html",
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "src/background/index.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
