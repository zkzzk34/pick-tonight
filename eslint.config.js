import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const javascriptFiles = ["**/*.{js,mjs,cjs}"];
const typescriptFiles = ["**/*.{ts,tsx}"];
const browserFiles = ["src/browser/**/*.{ts,tsx}", "src/main.tsx"];
const serverFiles = ["src/server/**/*.ts", "vite.config.ts"];
const sharedFiles = ["src/shared/**/*.ts"];

export default defineConfig([
  globalIgnores(
    [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      ".vite/**",
      "playwright-report/**",
      "test-results/**",
    ],
    "pick-tonight/generated-files",
  ),
  {
    name: "pick-tonight/javascript",
    files: javascriptFiles,
    extends: [eslint.configs.recommended],
  },
  {
    name: "pick-tonight/browser-javascript",
    files: ["proofs/tmdb-server-only/browser.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "pick-tonight/node-javascript",
    files: ["eslint.config.js", "proofs/tmdb-server-only/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: "pick-tonight/typescript",
    files: typescriptFiles,
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
  {
    name: "pick-tonight/node-typescript",
    files: serverFiles,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: "pick-tonight/react",
    files: browserFiles,
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "pick-tonight/react-refresh",
    files: browserFiles,
    extends: [reactRefresh.configs.vite()],
  },
  {
    name: "pick-tonight/browser-boundary",
    files: browserFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/server/**"],
              message: "Browser modules must not import server-only code.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "pick-tonight/server-boundary",
    files: serverFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/browser/**"],
              message: "Server modules must not import browser code.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "pick-tonight/shared-boundary",
    files: sharedFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/browser/**", "**/server/**"],
              message:
                "Shared modules must remain independent of browser and server code.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
]);
