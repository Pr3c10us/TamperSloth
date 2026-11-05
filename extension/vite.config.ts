import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => ({
  define: {
    // The TamperSloth API the Sloth models and sign-in talk to. .env.local
    // points it at a local server; leave it unset for store builds.
    __TAMPERSLOTH_API_URL__: JSON.stringify(
      loadEnv(mode, process.cwd(), "VITE_").VITE_TAMPERSLOTH_API_URL || "https://api.tampersloth.com",
    ),
    // The website whose /pricing page "Upgrade" opens, and where the pricing relay runs;
    // .env.local can point it at the local landing page.
    __TAMPERSLOTH_SITE_URL__: JSON.stringify(
      loadEnv(mode, process.cwd(), "VITE_").VITE_TAMPERSLOTH_SITE_URL || "https://tampersloth.com",
    ),
    // A "Web application" OAuth client for Google sign-in outside Chrome (Edge, Brave…),
    // where getAuthToken isn't available. Its redirect URI is chrome.identity.getRedirectURL().
    __TAMPERSLOTH_GOOGLE_WEB_CLIENT_ID__: JSON.stringify(
      loadEnv(mode, process.cwd(), "VITE_").VITE_GOOGLE_WEB_CLIENT_ID || "",
    ),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
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
        clipboard: resolve(__dirname, "clipboard.html"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "src/background/index.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
}));
