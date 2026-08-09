/**
 * `process.env`, backed by Deno's environment.
 *
 * `server/src/config.ts` validates `process.env` at module load, and the whole
 * API reads its configuration from the object that produces. Supabase Edge
 * Functions run on Deno, where the environment lives behind `Deno.env`.
 *
 * This module is imported for its side effect and must come first: ES modules
 * run side effects in import order, so listing it above the handler guarantees
 * the shim is in place before the config schema is parsed.
 */

declare const Deno: { env: { get(key: string): string | undefined; toObject(): Record<string, string> } };

const globals = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };

if (!globals.process) globals.process = {};

globals.process.env = new Proxy({} as Record<string, string | undefined>, {
  get: (_target, key) => (typeof key === "string" ? Deno.env.get(key) : undefined),
  has: (_target, key) => typeof key === "string" && Deno.env.get(key) !== undefined,
  ownKeys: () => Reflect.ownKeys(Deno.env.toObject()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
