import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages regardless of repo name
// (e.g. https://user.github.io/belot/) as well as a custom domain.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
  },
});
