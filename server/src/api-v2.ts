import { z } from "zod";
import { previewCatalog, previewCourseDetail } from "./catalog.js";
import { authenticatedClient, catalog } from "./supabase.js";

export type ApiResult = {
  status: number;
  body: unknown;
  cacheControl?: string;
};

const publicCache = "public, max-age=30, s-maxage=120";
const noStore = "no-store";

const bookingDraftSchema = z.object({
  serviceId: z.string().uuid(),
  specialistId: z.string().uuid(),
  slotId: z.string().uuid(),
  mode: z.enum(["remote", "clinic"]),
  notes: z.string().max(800).optional(),
});

export function getHealth(): ApiResult {
  return {
    status: 200,
    body: {
      status: "ok",
      service: "blue-rehab-api",
      catalog: "supabase",
      protectedWrites: "authenticated-rls",
    },
    cacheControl: noStore,
  };
}

export async function getCatalog(): Promise<ApiResult> {
  const [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult] = await Promise.all([
    catalog
      .from("services")
      .select("id,name,description,duration_minutes,price,allowed_modes,is_demo")
      .eq("is_active", true)
      .order("price"),
    catalog
      .from("specialists")
      .select("id,display_name,title,bio,specialties,photo_url,languages,is_verified,is_demo")
      .order("created_at"),
    catalog
      .from("courses")
      .select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo,cover_url,compare_at_price,presenter_name")
      .eq("is_published", true)
      .order("starts_at"),
    catalog
      .from("branches")
      .select("id,name,city,address,is_demo")
      .eq("is_active", true)
      .order("name"),
    catalog
      .from("availability_slots")
      .select("id,specialist_id,branch_id,starts_at,ends_at,mode")
      .eq("is_available", true)
      .gt("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(12),
  ]);

  const error = [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult]
    .find((result) => result.error)?.error;

  if (error) throw error;

  return {
    status: 200,
    cacheControl: publicCache,
    body: {
      source: "supabase",
      services: (servicesResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        durationMinutes: Number(row.duration_minutes),
        price: Number(row.price),
        modes: row.allowed_modes,
        isDemo: row.is_demo,
      })),
      specialists: (specialistsResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.display_name,
        title: row.title,
        bio: row.bio ?? "",
        specialties: row.specialties,
        languages: row.languages,
        isVerified: row.is_verified,
        photoUrl: row.photo_url ?? null,
        isDemo: row.is_demo,
      })),
      courses: (coursesResult.data ?? []).map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary ?? "",
        description: row.description ?? "",
        durationHours: Number(row.duration_hours),
        price: Number(row.price),
        mode: row.mode,
        level: row.level,
        startsAt: row.starts_at,
        learningOutcomes: row.learning_outcomes,
        prerequisites: row.prerequisites,
        language: row.language,
        certificateAvailable: row.certificate_available,
        coverUrl: row.cover_url ?? null,
        compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price), presenterName: row.presenter_name ?? null,
        isDemo: row.is_demo,
      })),
      branches: (branchesResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        address: row.address,
        isDemo: row.is_demo,
      })),
      availability: (slotsResult.data ?? []).map((row) => ({
        id: row.id,
        specialistId: row.specialist_id,
        branchId: row.branch_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        mode: row.mode,
      })),
    },
  };
}

export async function getCourseDetail(rawSlug: string): Promise<ApiResult> {
  const slug = z.string().min(2).max(160).parse(rawSlug);

  const courseResult = await catalog
    .from("courses")
    .select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo,cover_url,compare_at_price,presenter_name")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) {
    const preview = previewCourseDetail(slug);
    return { status: 404, body: { error: "Course not found", preview }, cacheControl: noStore };
  }

  const modulesResult = await catalog
    .from("course_modules")
    .select("id,title,summary,position")
    .eq("course_id", courseResult.data.id)
    .order("position");

  if (modulesResult.error) throw modulesResult.error;

  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  const lessonsResult = moduleIds.length
    ? await catalog
        .from("course_lessons")
        .select("id,module_id,title,content_type,duration_minutes,is_preview")
        .in("module_id", moduleIds)
        .order("position")
    : { data: [], error: null };

  if (lessonsResult.error) throw lessonsResult.error;

  const row = courseResult.data;
  return {
    status: 200,
    cacheControl: publicCache,
    body: {
      source: "supabase",
      course: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary ?? "",
        description: row.description ?? "",
        durationHours: Number(row.duration_hours),
        price: Number(row.price),
        mode: row.mode,
        level: row.level,
        startsAt: row.starts_at,
        learningOutcomes: row.learning_outcomes,
        prerequisites: row.prerequisites,
        language: row.language,
        certificateAvailable: row.certificate_available,
        coverUrl: row.cover_url ?? null,
        compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price), presenterName: row.presenter_name ?? null,
        isDemo: row.is_demo,
      },
      modules: (modulesResult.data ?? []).map((module) => ({
        id: module.id,
        title: module.title,
        summary: module.summary ?? "",
        position: module.position,
        lessons: (lessonsResult.data ?? [])
          .filter((lesson) => lesson.module_id === module.id)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            contentType: lesson.content_type,
            durationMinutes: lesson.duration_minutes,
            isPreview: lesson.is_preview,
          })),
      })),
    },
  };
}

export async function createBookingDraft(
  authorization: string | null,
  payload: unknown,
): Promise<ApiResult> {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { status: 401, body: { error: "Authentication required" }, cacheControl: noStore };
  }

  const userClient = authenticatedClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { status: 401, body: { error: "Invalid session" }, cacheControl: noStore };
  }

  const body = bookingDraftSchema.parse(payload);
  const [{ data: slot, error: slotError }, { data: service, error: serviceError }] = await Promise.all([
    userClient
      .from("availability_slots")
      .select("id,specialist_id,branch_id,starts_at,ends_at,mode,is_available")
      .eq("id", body.slotId)
      .single(),
    userClient
      .from("services")
      .select("id,price,is_active,allowed_modes")
      .eq("id", body.serviceId)
      .single(),
  ]);

  if (slotError || serviceError || !slot || !service) {
    return { status: 409, body: { error: "Service or slot is unavailable" }, cacheControl: noStore };
  }

  if (
    !slot.is_available ||
    slot.specialist_id !== body.specialistId ||
    slot.mode !== body.mode ||
    !service.is_active ||
    !service.allowed_modes.includes(body.mode)
  ) {
    return {
      status: 409,
      body: { error: "Booking selection is no longer available" },
      cacheControl: noStore,
    };
  }

  const { data, error } = await userClient
    .from("bookings")
    .insert({
      patient_id: userData.user.id,
      specialist_id: body.specialistId,
      service_id: body.serviceId,
      slot_id: body.slotId,
      branch_id: slot.branch_id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      mode: body.mode,
      status: "pending_payment",
      total: service.price,
      notes: body.notes ?? null,
    })
    .select("id,status,starts_at,total")
    .single();

  if (error) throw error;
  return { status: 201, body: { data, next: "payment" }, cacheControl: noStore };
}

export function apiErrorResult(error: unknown): ApiResult {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "Invalid request", details: error.issues },
      cacheControl: noStore,
    };
  }

  console.error(error);
  return { status: 500, body: { error: "Unexpected server error" }, cacheControl: noStore };
}

export { previewCatalog };
