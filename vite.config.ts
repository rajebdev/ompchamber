import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { flatRoutes } from "remix-flat-routes";
import { attachAgentStreamWebSocket } from "./server/agent-stream-websocket.js";

/**
 * Serves the agent event WebSocket (`/api/agent/:sessionId/ws`) on the dev
 * server's own HTTP server. The production entry (server/index.js) attaches the
 * same handler, so dev and prod expose one transport implementation.
 */
function agentStreamWebSocket(): Plugin {
  return {
    name: "ompchamber:agent-stream-websocket",
    configureServer(server) {
      if (server.httpServer) attachAgentStreamWebSocket(server.httpServer);
    },
  };
}

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      routes: async (defineRoutes) => {
        return flatRoutes("routes", defineRoutes, {
          appDir: "app",
          nestedDirectoryChar: "",
          routeRegex: /\.(ts|tsx|js|jsx)$/,
        });
      },
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tailwindcss(),
    agentStreamWebSocket(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
      "@": path.resolve(__dirname, "./app"),
    },
  },
  optimizeDeps: {
    include: ["@xterm/xterm", "@xterm/addon-fit"],
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
  },
});
