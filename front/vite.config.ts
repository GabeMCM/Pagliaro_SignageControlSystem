import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

const TARGET = process.env.VITE_BACKEND_URL || "http://localhost:8001";
const WS_TARGET = TARGET.replace(/^http/, "ws");

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tsconfigPaths(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": TARGET,
      "/ws": {
        target: WS_TARGET,
        ws: true,
      },
      "/media": TARGET,
      "/player": TARGET,
    },
  },
});
