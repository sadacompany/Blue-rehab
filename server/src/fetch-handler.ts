import {
  apiErrorResult,
  createBookingDraft,
  createBookingMeeting,
  createEnrollment,
  createPaymentCheckout,
  createTestMeeting,
  deleteTestMeeting,
  getCatalog,
  getCourseDetail,
  getHealth,
  getPaymentConfig,
  listMeetTestSpecialists,
  repairBookingMeetingAttendees,
  deleteCourseWithRefunds,
  refundPaymentByOrder,
  settlePendingPayments,
  verifyPayment,
  type ApiResult,
} from "./runtime-api.js";

/**
 * The API as a Web `Request` → `Response` function.
 *
 * Behaviour lives in `runtime-api.ts`; routing lives here; the platform adapters
 * are a few lines each. Netlify and Vercel disagree about the shape of a
 * handler, and the local server is Express — none of that should be able to make
 * one deployment behave differently from another on the payment or
 * authorization paths.
 */

const PREFIXES = ["/.netlify/functions/api", "/api"];

function routePath(request: Request) {
  let pathname = new URL(request.url).pathname;
  for (const prefix of PREFIXES) {
    if (pathname.startsWith(prefix)) pathname = pathname.slice(prefix.length);
  }
  const normalized = pathname || "/";
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

export async function handleApiRequest(request: Request): Promise<Response> {
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
      if (path === "/admin/meet-test/specialists") return json(request, await listMeetTestSpecialists(authorization));
    }

    if (request.method === "POST") {
      if (path === "/bookings/drafts") return json(request, await createBookingDraft(authorization, await readJson(request)));
      if (path === "/enrollments") return json(request, await createEnrollment(authorization, await readJson(request)));
      if (path === "/payments/checkout") return json(request, await createPaymentCheckout(authorization, await readJson(request)));
      if (path === "/payments/verify") return json(request, await verifyPayment(authorization, await readJson(request)));
      if (path === "/admin/courses/delete") return json(request, await deleteCourseWithRefunds(authorization, await readJson(request)));
      if (path === "/payments/refund") return json(request, await refundPaymentByOrder(authorization, await readJson(request)));
      if (path === "/payments/settle") return json(request, await settlePendingPayments(authorization));
      const meetMatch = path.match(/^\/bookings\/([^/]+)\/meet$/);
      if (meetMatch) return json(request, await createBookingMeeting(authorization, { bookingId: decodeURIComponent(meetMatch[1]) }));
      if (path === "/admin/meet-test") return json(request, await createTestMeeting(authorization, await readJson(request)));
      if (path === "/admin/meet-test/cancel") return json(request, await deleteTestMeeting(authorization, await readJson(request)));
      if (path === "/admin/bookings/repair-meeting") return json(request, await repairBookingMeetingAttendees(authorization, await readJson(request)));
    }

    return json(request, { status: 404, body: { error: "Route not found" } });
  } catch (error) {
    return json(request, apiErrorResult(error));
  }
}
