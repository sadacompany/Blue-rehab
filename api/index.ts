import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRequest } from "../server/src/fetch-handler.js";

/**
 * Vercel adapter.
 *
 * Vercel's Node runtime speaks `(req, res)`, so this bridges Node's streams to
 * the Web `Request`/`Response` pair the shared handler works in. Nothing about
 * the API is decided here — routing and behaviour are in
 * `server/src/fetch-handler.ts`, the same module the Netlify function uses.
 */

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // `req.url` is a path; the shared handler needs an absolute URL to parse.
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost") as string;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const request = new Request(url, {
    method: req.method ?? "GET",
    headers,
    body: await readBody(req),
  });

  const response = await handleApiRequest(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
