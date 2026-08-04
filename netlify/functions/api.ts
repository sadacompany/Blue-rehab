import {
  apiErrorResult,
  createBookingDraft,
  createBookingMeeting,
  createEnrollment,
  createPaymentCheckout,
  getCatalog,
  getCourseDetail,
  getHealth,
  getPaymentConfig,
  settlePendingPayments,
  verifyPayment,
  type ApiResult,
} from "../../server/src/runtime-api.js";

/**
 * Netlify adapter. All behaviour lives in `server/src/runtime-api.ts` so the
 * deployed function and the local Express server cannot drift apart — which
 * matters most for the payment and authorization paths.
 */

const FUNCTION_PREFIX = "/.netlify/functions/api";
const API_PREFIX = "/api";

function routePath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const withoutFunctionPrefix = pathname.startsWith(FUNCTION_PREFIX) ? pathname.slice(FUNCTION_PREFIX.length) : pathname;
  const withoutApiPrefix = withoutFunctionPrefix.startsWith(API_PREFIX) ? withoutFunctionPrefix.slice(API_PREFIX.length) : withoutFunctionPrefix;
  const normalized = withoutApiPrefix || "/";
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && origin === requestOrigin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request: Request, result: ApiResult) {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": result.cacheControl ?? "no-store",
      ...corsHeaders(request),
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const path = routePath(request);
  const authorization = request.headers.get("authorization");

  try {
    if (request.method === "GET") {
      if (path === "/health") return json(request, getHealth());
      if (path === "/catalog") return json(request, await getCatalog());
      if (path === "/payments/config") return json(request, getPaymentConfig());
      const courseMatch = path.match(/^\/courses\/([^/]+)$/);
      if (courseMatch) return json(request, await getCourseDetail(decodeURIComponent(courseMatch[1])));
    }

    if (request.method === "POST") {
      if (path === "/bookings/drafts") return json(request, await createBookingDraft(authorization, await readJson(request)));
      if (path === "/enrollments") return json(request, await createEnrollment(authorization, await readJson(request)));
      if (path === "/payments/checkout") return json(request, await createPaymentCheckout(authorization, await readJson(request)));
      if (path === "/payments/verify") return json(request, await verifyPayment(authorization, await readJson(request)));
      if (path === "/payments/settle") return json(request, await settlePendingPayments(authorization));
      const meetMatch = path.match(/^\/bookings\/([^/]+)\/meet$/);
      if (meetMatch) return json(request, await createBookingMeeting(authorization, { bookingId: decodeURIComponent(meetMatch[1]) }));
    }

    return json(request, { status: 404, body: { error: "Route not found" } });
  } catch (error) {
    return json(request, apiErrorResult(error));
  }
}
