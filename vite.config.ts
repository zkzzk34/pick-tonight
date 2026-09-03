import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { API_PREFIX } from "./src/shared/api-paths.ts";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      [API_PREFIX]: "http://127.0.0.1:4174",
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/browser/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
