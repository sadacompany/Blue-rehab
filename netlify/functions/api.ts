import { handleApiRequest } from "../../server/src/fetch-handler.js";

/**
 * Netlify adapter. Routing and behaviour are shared with every other deployment
 * target in `server/src/fetch-handler.ts`, so the function, the Vercel function
 * and the local Express server cannot drift apart — which matters most on the
 * payment and authorization paths.
 */
export default function handler(request: Request) {
  return handleApiRequest(request);
}
