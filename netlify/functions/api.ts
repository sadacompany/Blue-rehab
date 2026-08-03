import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://lfuuptigzjocgewhrmkt.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_578u_Ab3cgUlqcXhFiidnQ_MnoAEf9l";
const catalog = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const FUNCTION_PREFIX = "/.netlify/functions/api";
const API_PREFIX = "/api";

// Google Meet (free Google Calendar API). Secrets stay server-side only.
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
const GOOGLE_OAUTH_REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
const GOOGLE_MEET_TIME_ZONE = process.env.GOOGLE_MEET_TIME_ZONE?.trim() || "Asia/Riyadh";

function isGoogleMeetConfigured() {
  return Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REFRESH_TOKEN);
}

async function createMeetEvent(input: { summary: string; description?: string; startsAt: string; endsAt?: string | null; attendees?: string[] }) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID as string,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET as string,
      refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
  });
  const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as { access_token?: string };
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(`google_token_failed_${tokenResponse.status}`);

  const startIso = new Date(input.startsAt).toISOString();
  const endIso = input.endsAt ? new Date(input.endsAt).toISOString() : new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString();
  const requestId = `blue-rehab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const eventResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?conferenceDataVersion=1&sendUpdates=all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenPayload.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: startIso, timeZone: GOOGLE_MEET_TIME_ZONE },
      end: { dateTime: endIso, timeZone: GOOGLE_MEET_TIME_ZONE },
      attendees: (input.attendees ?? []).filter((email) => email && email.includes("@")).map((email) => ({ email })),
      conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  if (!eventResponse.ok) throw new Error(`google_event_failed_${eventResponse.status}`);
  const event = (await eventResponse.json()) as { id: string; htmlLink: string; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> } };
  const meetUrl = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
  if (!meetUrl) throw new Error("google_meet_link_missing");
  return { meetUrl, eventId: event.id, htmlLink: event.htmlLink };
}

type Result = { status: number; body: unknown; cacheControl?: string };

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

function json(request: Request, result: Result) {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": result.cacheControl ?? "no-store",
      ...corsHeaders(request),
    },
  });
}

async function getCatalog(): Promise<Result> {
  const now = new Date().toISOString();
  const [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult] = await Promise.all([
    catalog.from("services").select("id,name,description,duration_minutes,price,allowed_modes,is_demo").eq("is_active", true).order("price"),
    catalog.from("specialists").select("id,display_name,title,bio,specialties,languages,is_verified,is_demo").order("created_at"),
    catalog.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo").eq("is_published", true).order("starts_at"),
    catalog.from("branches").select("id,name,city,address,is_demo").eq("is_active", true).order("name"),
    catalog.from("availability_slots").select("id,specialist_id,branch_id,starts_at,ends_at,mode").eq("is_available", true).gt("starts_at", now).order("starts_at").limit(40),
  ]);
  const error = [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult].find((result) => result.error)?.error;
  if (error) throw error;
  return {
    status: 200,
    cacheControl: "public, max-age=30, s-maxage=120",
    body: {
      source: "supabase",
      services: (servicesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", durationMinutes: Number(row.duration_minutes), price: Number(row.price), modes: row.allowed_modes, isDemo: row.is_demo })),
      specialists: (specialistsResult.data ?? []).map((row) => ({ id: row.id, name: row.display_name, title: row.title, bio: row.bio ?? "", specialties: row.specialties, languages: row.languages, isVerified: row.is_verified, isDemo: row.is_demo })),
      courses: (coursesResult.data ?? []).map((row) => ({ id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo })),
      branches: (branchesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, city: row.city, address: row.address, isDemo: row.is_demo })),
      availability: (slotsResult.data ?? []).map((row) => ({ id: row.id, specialistId: row.specialist_id, branchId: row.branch_id, startsAt: row.starts_at, endsAt: row.ends_at, mode: row.mode })),
    },
  };
}

async function getCourse(slug: string): Promise<Result> {
  const courseResult = await catalog.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) return { status: 404, body: { error: "Course not found" } };
  const modulesResult = await catalog.from("course_modules").select("id,title,description,sort_order").eq("course_id", courseResult.data.id).order("sort_order");
  if (modulesResult.error) throw modulesResult.error;
  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  const lessonsResult = moduleIds.length ? await catalog.from("course_lessons").select("id,module_id,title,lesson_type,duration_minutes,is_preview,sort_order").in("module_id", moduleIds).order("sort_order") : { data: [], error: null };
  if (lessonsResult.error) throw lessonsResult.error;
  const row = courseResult.data;
  return {
    status: 200,
    cacheControl: "public, max-age=30, s-maxage=120",
    body: {
      source: "supabase",
      course: { id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo },
      modules: (modulesResult.data ?? []).map((module) => ({ id: module.id, title: module.title, summary: module.description ?? "", position: module.sort_order, lessons: (lessonsResult.data ?? []).filter((lesson) => lesson.module_id === module.id).map((lesson) => ({ id: lesson.id, title: lesson.title, contentType: lesson.lesson_type, durationMinutes: lesson.duration_minutes, isPreview: lesson.is_preview })) })),
    },
  };
}

async function createBooking(request: Request): Promise<Result> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401, body: { error: "Authentication required" } };
  const body = await request.json() as { serviceId?: string; specialistId?: string; slotId?: string; mode?: string; notes?: string };
  if (!body.serviceId || !body.specialistId || !body.slotId || !body.mode) return { status: 400, body: { error: "Invalid request" } };
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return { status: 401, body: { error: "Invalid session" } };
  const [{ data: slot, error: slotError }, { data: service, error: serviceError }] = await Promise.all([
    client.from("availability_slots").select("id,specialist_id,branch_id,starts_at,ends_at,mode,is_available").eq("id", body.slotId).single(),
    client.from("services").select("id,price,is_active,allowed_modes").eq("id", body.serviceId).single(),
  ]);
  if (slotError || serviceError || !slot || !service) return { status: 409, body: { error: "Service or slot is unavailable" } };
  const { data, error } = await client.from("bookings").insert({ patient_id: userData.user.id, specialist_id: body.specialistId, service_id: body.serviceId, slot_id: body.slotId, branch_id: slot.branch_id, starts_at: slot.starts_at, ends_at: slot.ends_at, mode: body.mode, status: "draft", total: service.price, notes: body.notes ?? null }).select("id,status,starts_at,total").single();
  if (error) throw error;
  return { status: 201, body: { data, next: "payment" } };
}

async function createBookingMeeting(request: Request, bookingId: string): Promise<Result> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401, body: { error: "Authentication required" } };
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return { status: 400, body: { error: "Invalid booking id" } };
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return { status: 401, body: { error: "Invalid session" } };
  const { data: booking, error: bookingError } = await client.from("bookings").select("id,patient_id,mode,starts_at,ends_at,meeting_url").eq("id", bookingId).maybeSingle();
  if (bookingError || !booking) return { status: 404, body: { error: "Booking not found" } };
  if (booking.patient_id !== userData.user.id) return { status: 403, body: { error: "Forbidden" } };
  if (booking.mode !== "remote") return { status: 409, body: { error: "Booking is not a remote session" } };
  if (booking.meeting_url) return { status: 200, body: { meetingUrl: booking.meeting_url, reused: true } };
  if (!isGoogleMeetConfigured()) return { status: 200, body: { meetingUrl: null, configured: false } };
  const meeting = await createMeetEvent({ summary: "جلسة بلو ريهاب عن بُعد", description: `رقم الحجز: ${booking.id}`, startsAt: booking.starts_at, endsAt: booking.ends_at, attendees: userData.user.email ? [userData.user.email] : [] });
  await client.from("bookings").update({ meeting_url: meeting.meetUrl }).eq("id", booking.id);
  return { status: 200, body: { meetingUrl: meeting.meetUrl, configured: true } };
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const path = routePath(request);
  try {
    if (request.method === "GET" && path === "/health") return json(request, { status: 200, body: { status: "ok", service: "blue-rehab-api", catalog: "supabase", protectedWrites: "authenticated-rls" } });
    if (request.method === "GET" && path === "/catalog") return json(request, await getCatalog());
    const courseMatch = path.match(/^\/courses\/([^/]+)$/);
    if (request.method === "GET" && courseMatch) return json(request, await getCourse(decodeURIComponent(courseMatch[1])));
    if (request.method === "POST" && path === "/bookings/drafts") return json(request, await createBooking(request));
    const meetMatch = path.match(/^\/bookings\/([^/]+)\/meet$/);
    if (request.method === "POST" && meetMatch) return json(request, await createBookingMeeting(request, decodeURIComponent(meetMatch[1])));
    return json(request, { status: 404, body: { error: "Route not found" } });
  } catch (error) {
    console.error(error);
    return json(request, { status: 500, body: { error: "Unexpected server error" } });
  }
}
