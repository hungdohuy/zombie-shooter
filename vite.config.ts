import { defineConfig } from "vitest/config";

// GitHub Pages serves the site from https://<user>.github.io/<repo>/, so the
// production build must use that repo subpath as its base. Dev/preview stay at
// root. If the repo is renamed, update this path to match the new repo name.
const repoBase = "/zombie-shooter/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? repoBase : "/",
  server: {
    host: true,
    port: 5173,
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
}));
