import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const javascriptFiles = ["**/*.{js,mjs,cjs}"];
const typescriptFiles = ["**/*.{ts,tsx}"];
const applicationFiles = ["src/**/*.{ts,tsx}"];

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
    files: ["vite.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: "pick-tonight/react",
    files: applicationFiles,
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "pick-tonight/react-refresh",
    files: applicationFiles,
    extends: [reactRefresh.configs.vite()],
  },
  eslintConfigPrettier,
]);
