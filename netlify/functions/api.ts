import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://lfuuptigzjocgewhrmkt.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_578u_Ab3cgUlqcXhFiidnQ_MnoAEf9l";
const catalog = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const FUNCTION_PREFIX = "/.netlify/functions/api";
const API_PREFIX = "/api";

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

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const path = routePath(request);
  try {
    if (request.method === "GET" && path === "/health") return json(request, { status: 200, body: { status: "ok", service: "blue-rehab-api", catalog: "supabase", protectedWrites: "authenticated-rls" } });
    if (request.method === "GET" && path === "/catalog") return json(request, await getCatalog());
    const courseMatch = path.match(/^\/courses\/([^/]+)$/);
    if (request.method === "GET" && courseMatch) return json(request, await getCourse(decodeURIComponent(courseMatch[1])));
    if (request.method === "POST" && path === "/bookings/drafts") return json(request, await createBooking(request));
    return json(request, { status: 404, body: { error: "Route not found" } });
  } catch (error) {
    console.error(error);
    return json(request, { status: 500, body: { error: "Unexpected server error" } });
  }
}
