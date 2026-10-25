import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": { target: "http://localhost:3001", ws: true },
      "/api": "http://localhost:3001",
      "/healthz": "http://localhost:3001",
    },
  },
});
