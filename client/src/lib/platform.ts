import { apiUrl } from "./api";
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

export type BookingResult = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  mode: DeliveryMode;
  total: number;
  orderNumber: string;
  currency: string;
  meetingUrl: string | null;
};

async function authorizedFetch(path: string, init?: RequestInit) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new AuthenticationRequiredError();

  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `REQUEST_FAILED_${response.status}`);
  return payload;
}

/**
 * Create a booking through the API. The price, the slot lock and the payment
 * record are all decided server-side — the browser only names what it wants.
 */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const payload = await authorizedFetch("/bookings/drafts", {
    method: "POST",
    body: JSON.stringify({
      serviceId: input.service.id,
      specialistId: input.specialist.id,
      slotId: input.slot.id,
      mode: input.slot.mode,
      notes: input.notes,
    }),
  });
  return payload.data as BookingResult;
}

export type PaymentConfig = {
  provider: string;
  configured: boolean;
  testMode: boolean;
  publishableKey: string | null;
  currency: string;
};

export async function loadPaymentConfig(): Promise<PaymentConfig> {
  const response = await fetch(apiUrl("/payments/config"));
  if (!response.ok) throw new Error(`PAYMENT_CONFIG_FAILED_${response.status}`);
  return (await response.json()) as PaymentConfig;
}

/** Start checkout and get the Moyasar-hosted payment URL to redirect to. */
export async function startCheckout(orderNumber: string): Promise<{ paymentUrl: string }> {
  const payload = await authorizedFetch("/payments/checkout", {
    method: "POST",
    body: JSON.stringify({ orderNumber }),
  });
  return payload as { paymentUrl: string };
}

export type VerifyResult = { status: string; persisted: boolean; orderNumber?: string; bookingId?: string | null; reason?: string };

/** Confirm a payment outcome. The server re-reads it from Moyasar. */
export async function verifyPayment(paymentId: string): Promise<VerifyResult> {
  return (await authorizedFetch("/payments/verify", {
    method: "POST",
    body: JSON.stringify({ paymentId }),
  })) as VerifyResult;
}

export async function enrollViaApi(courseId: string) {
  const payload = await authorizedFetch("/enrollments", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
  return payload.data as { id: string; status: string; amountDue: number; orderNumber: string | null; currency: string };
}

export type MeetingLinkResult = { meetingUrl: string | null; configured?: boolean; reused?: boolean };

/**
 * Ask the server to generate (or return an existing) Google Meet link for a
 * remote booking. Secrets live server-side, so this always goes through the API.
 * Returns { meetingUrl: null } when the integration is not configured yet.
 */
export async function requestMeetingLink(bookingId: string): Promise<MeetingLinkResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new AuthenticationRequiredError();

  const response = await fetch(apiUrl(`/bookings/${bookingId}/meet`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const message = await response.json().then((body) => body?.error).catch(() => null);
    throw new Error(message || `MEET_REQUEST_FAILED_${response.status}`);
  }
  return (await response.json()) as MeetingLinkResult;
}

/**
 * Enroll in a course. Like bookings, the price and the seat check are enforced
 * server-side; re-enrolling returns the existing record instead of duplicating.
 */
export async function enrollInCourse(course: Course) {
  return enrollViaApi(course.id);
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
