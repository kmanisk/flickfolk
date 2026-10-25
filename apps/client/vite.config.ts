import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { brand } from "@watchparty/shared";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "flickfolk-brand",
      transformIndexHtml(html) {
        return html
          .replaceAll(
            "__PRODUCT_TITLE__",
            `${brand.productName} — ${brand.tagline}`,
          )
          .replaceAll("__PRODUCT_DESCRIPTION__", brand.description);
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        spotify: fileURLToPath(
          new URL("./spotify-bridge.html", import.meta.url),
        ),
      },
    },
  },
  server: {
    proxy: {
      "/socket.io": { target: "http://localhost:3001", ws: true },
      "/api": "http://localhost:3001",
      "/healthz": "http://localhost:3001",
    },
  },
});
