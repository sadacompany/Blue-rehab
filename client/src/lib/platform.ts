import type {
  AvailabilitySlot,
  Branch,
  CatalogResponse,
  Course,
  CourseDetailResponse,
  CourseModule,
  DeliveryMode,
  Service,
  Specialist,
} from "./catalog-types";
import { supabase } from "./supabase";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationRequiredError";
  }
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

export async function loadCatalog(): Promise<CatalogResponse> {
  const now = new Date().toISOString();
  const [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult] = await Promise.all([
    supabase.from("services").select("id,name,description,duration_minutes,price,allowed_modes,is_demo").eq("is_active", true).order("price"),
    supabase.from("specialists").select("id,display_name,title,bio,specialties,languages,is_verified,is_demo").order("created_at"),
    supabase.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo").eq("is_published", true).order("starts_at"),
    supabase.from("branches").select("id,name,city,address,is_demo").eq("is_active", true).order("name"),
    supabase.from("availability_slots").select("id,specialist_id,branch_id,starts_at,ends_at,mode").eq("is_available", true).gt("starts_at", now).order("starts_at").limit(40),
  ]);

  const error = firstError([servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult]);
  if (error) throw new Error(error.message);

  const services: Service[] = (servicesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    durationMinutes: Number(row.duration_minutes),
    price: Number(row.price),
    modes: row.allowed_modes as DeliveryMode[],
    isDemo: Boolean(row.is_demo),
  }));

  const specialists: Specialist[] = (specialistsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.display_name,
    title: row.title,
    bio: row.bio ?? "",
    specialties: row.specialties ?? [],
    languages: row.languages ?? [],
    isVerified: Boolean(row.is_verified),
    isDemo: Boolean(row.is_demo),
  }));

  const courses: Course[] = (coursesResult.data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    description: row.description ?? "",
    durationHours: Number(row.duration_hours),
    price: Number(row.price),
    mode: row.mode as Course["mode"],
    level: row.level,
    startsAt: row.starts_at,
    learningOutcomes: row.learning_outcomes ?? [],
    prerequisites: row.prerequisites ?? [],
    language: row.language,
    certificateAvailable: Boolean(row.certificate_available),
    isDemo: Boolean(row.is_demo),
  }));

  const branches: Branch[] = (branchesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    address: row.address,
    isDemo: Boolean(row.is_demo),
  }));

  const availability: AvailabilitySlot[] = (slotsResult.data ?? []).map((row) => ({
    id: row.id,
    specialistId: row.specialist_id,
    branchId: row.branch_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mode: row.mode as DeliveryMode,
  }));

  return { services, specialists, courses, branches, availability, source: "supabase" };
}

export async function loadCourseDetail(slug: string): Promise<CourseDetailResponse> {
  const courseResult = await supabase
    .from("courses")
    .select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (courseResult.error) throw new Error(courseResult.error.message);
  if (!courseResult.data) throw new Error("COURSE_NOT_FOUND");

  const modulesResult = await supabase
    .from("course_modules")
    .select("id,title,description,sort_order")
    .eq("course_id", courseResult.data.id)
    .order("sort_order");
  if (modulesResult.error) throw new Error(modulesResult.error.message);

  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  const lessonsResult = moduleIds.length
    ? await supabase
        .from("course_lessons")
        .select("id,module_id,title,lesson_type,duration_minutes,is_preview,sort_order")
        .in("module_id", moduleIds)
        .order("sort_order")
    : { data: [], error: null };
  if (lessonsResult.error) throw new Error(lessonsResult.error.message);

  const row = courseResult.data;
  const course: Course = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    description: row.description ?? "",
    durationHours: Number(row.duration_hours),
    price: Number(row.price),
    mode: row.mode as Course["mode"],
    level: row.level,
    startsAt: row.starts_at,
    learningOutcomes: row.learning_outcomes ?? [],
    prerequisites: row.prerequisites ?? [],
    language: row.language,
    certificateAvailable: Boolean(row.certificate_available),
    isDemo: Boolean(row.is_demo),
  };

  const modules: CourseModule[] = (modulesResult.data ?? []).map((module) => ({
    id: module.id,
    title: module.title,
    summary: module.description ?? "",
    position: module.sort_order,
    lessons: (lessonsResult.data ?? [])
      .filter((lesson) => lesson.module_id === module.id)
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        contentType: lesson.lesson_type,
        durationMinutes: lesson.duration_minutes,
        isPreview: Boolean(lesson.is_preview),
      })),
  }));

  return { course, modules, source: "supabase" };
}

type BookingInput = {
  service: Service;
  specialist: Specialist;
  slot: AvailabilitySlot;
  notes: string;
};

export async function createBooking(input: BookingInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      patient_id: user.id,
      specialist_id: input.specialist.id,
      service_id: input.service.id,
      slot_id: input.slot.id,
      branch_id: input.slot.branchId,
      starts_at: input.slot.startsAt,
      ends_at: input.slot.endsAt,
      mode: input.slot.mode,
      status: "draft",
      total: input.service.price,
      notes: input.notes,
    })
    .select("id,status,starts_at,total")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function enrollInCourse(course: Course) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const existing = await supabase
    .from("enrollments")
    .select("id,status,progress,amount_due")
    .eq("student_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const { data, error } = await supabase
    .from("enrollments")
    .insert({ student_id: user.id, course_id: course.id })
    .select("id,status,progress,amount_due")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type SupportRequestInput = {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
};

export async function createSupportRequest(input: SupportRequestInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("support_requests")
    .insert({
      user_id: sessionData.session?.user.id ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      subject: input.subject,
      message: input.message,
    })
    .select("id,status,created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type PortalSnapshot = {
  profile: { full_name: string; phone: string | null; roles: string[] } | null;
  bookings: Array<{ id: string; status: string; starts_at: string; total: number | null; service_id: string }>;
  enrollments: Array<{ id: string; status: string; progress: number; amount_due: number; course_id: string }>;
  payments: Array<{ id: string; status: string; amount: number; order_number: string; created_at: string }>;
  notifications: Array<{ id: string; title: string; body: string; read_at: string | null; created_at: string }>;
  services: Record<string, string>;
  courses: Record<string, string>;
};

export async function loadPortalSnapshot(): Promise<PortalSnapshot> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const [profileResult, bookingsResult, enrollmentsResult, paymentsResult, notificationsResult, catalogData] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,roles").eq("id", user.id).maybeSingle(),
    supabase.from("bookings").select("id,status,starts_at,total,service_id").order("starts_at", { ascending: false }).limit(20),
    supabase.from("enrollments").select("id,status,progress,amount_due,course_id").order("created_at", { ascending: false }).limit(20),
    supabase.from("payments").select("id,status,amount,order_number,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("notifications").select("id,title,body,read_at,created_at").order("created_at", { ascending: false }).limit(20),
    loadCatalog(),
  ]);

  const error = firstError([profileResult, bookingsResult, enrollmentsResult, paymentsResult, notificationsResult]);
  if (error) throw new Error(error.message);

  return {
    profile: profileResult.data ? {
      full_name: profileResult.data.full_name,
      phone: profileResult.data.phone,
      roles: profileResult.data.roles ?? [],
    } : null,
    bookings: (bookingsResult.data ?? []).map((item) => ({ ...item, total: item.total === null ? null : Number(item.total) })),
    enrollments: (enrollmentsResult.data ?? []).map((item) => ({ ...item, amount_due: Number(item.amount_due) })),
    payments: (paymentsResult.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })),
    notifications: notificationsResult.data ?? [],
    services: Object.fromEntries(catalogData.services.map((item) => [item.id, item.name])),
    courses: Object.fromEntries(catalogData.courses.map((item) => [item.id, item.title])),
  };
}
