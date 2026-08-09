import "./env-shim.ts";
import { handleApiRequest } from "../../../server/src/fetch-handler.ts";

/**
 * Supabase Edge Function adapter — the source entry.
 *
 * A third target beside Netlify and Vercel, and the only one needing no hosting
 * account of its own: the Supabase project already exists. Routing and behaviour
 * stay in `server/src/fetch-handler.ts`, so all three deployments answer
 * identically on the payment and authorization paths.
 *
 * The function is published with `verify_jwt` off. Several routes are public —
 * the catalogue, a course page, the payment configuration — and the ones that
 * are not check the Authorization header themselves, exactly as on every other
 * target. Letting the platform gate the whole function would break the public
 * catalogue and change nothing about the protected routes.
 *
 * Deployed as a bundle, not as these sources: `scripts/build-edge-function.mjs`
 * inlines the dependencies and resolves the server's NodeNext `.js` imports,
 * which Deno reads literally and would not find.
 */

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };

Deno.serve(handleApiRequest);
