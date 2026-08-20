import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // src imports use NodeNext-style relative specifiers ("./moyasar.js")
    // that point at ".ts" files on disk (see server/tsconfig.json). Without
    // this alias Vite's resolver looks for a literal ".js" file, finds
    // nothing, and every test that imports src/*.ts fails to resolve.
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
