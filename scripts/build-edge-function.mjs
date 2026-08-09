// Bundle the API into a single Deno module for Supabase Edge Functions.
//
// The server sources target Node with NodeNext resolution, so their relative
// imports carry `.js` extensions pointing at files that are really `.ts`. Deno
// resolves paths literally and would not find them, so the function ships as a
// bundle rather than as sources — which also inlines supabase-js and zod,
// leaving nothing to fetch at cold start.
//
// Node built-ins stay external: Deno provides `node:crypto` and friends.
// dotenv is aliased away — it reads a .env file that does not exist on the edge,
// and the environment comes from the platform via env-shim.ts.
import { build } from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const outFile = resolve(repo, "supabase/functions/api/bundle.js");

mkdirSync(dirname(outFile), { recursive: true });

// A stand-in for dotenv: same shape, no filesystem.
const dotenvStub = resolve(repo, "supabase/functions/api/dotenv-stub.mjs");
writeFileSync(dotenvStub, "export const config = () => ({ parsed: {} });\nexport default { config };\n");

/** Map the server's NodeNext `./x.js` imports onto the `./x.ts` that exists. */
const nodeNextTs = {
  name: "nodenext-ts",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
      const asTs = resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
      return existsSync(asTs) ? { path: asTs } : undefined;
    });
  },
};

await build({
  entryPoints: [resolve(repo, "supabase/functions/api/entry.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["module", "main"],
  conditions: ["import", "module", "default"],
  external: ["node:*"],
  alias: { dotenv: dotenvStub },
  plugins: [nodeNextTs],
  legalComments: "none",
  logLevel: "info",
});

console.log(`\nbundled → ${outFile}`);
